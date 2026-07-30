/**
 * Manifest verification — does the manifest tell the truth?
 *
 * `auditManifest()` checks a manifest for *completeness*, and every one of
 * its rules is internal to the object: it can only see what the manifest says
 * about itself. A manifest listing a source file that was deleted, a prop
 * that no longer exists, or an export that was renamed passes the audit
 * cleanly. That is the failure mode that kills a registry — not an
 * incomplete entry, but a confident entry that is wrong.
 *
 * This module reads the filesystem and checks the manifest against it. It is
 * node-only and deliberately on its own export path
 * (`studio/components/verify`): the main `studio/components` barrel must stay
 * free of `node:*` so browser bundles never reach `node:fs`.
 *
 * Repo-root resolution: pass `root` explicitly, or let `findRepoRoot()` walk
 * up from `from` (default: `process.cwd()`) to the nearest directory holding
 * a `.git`. A package consumed from `node_modules` at varying depths cannot
 * count levels from `import.meta.url` — the consumer's repo root is the only
 * anchor that means anything.
 *
 * The parsing here is regex-based and knows it. It is used only to find
 * claims that are provably false — a prop the source never mentions, an
 * export that does not appear. It never reports a problem it cannot point at.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ComponentManifest, ComponentStatus } from "./manifest";

export interface VerifyOptions {
  /**
   * Repo root that manifest paths are resolved against. Defaults to the
   * nearest `.git` ancestor of `process.cwd()`.
   */
  root?: string;
}

/**
 * Walk up from `from` to the nearest directory containing a `.git` (file or
 * directory, so worktrees count). Throws when there is none.
 */
export function findRepoRoot(from: string = process.cwd()): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no .git found at or above ${resolve(from)} — pass an explicit root`);
    }
    dir = parent;
  }
}

function resolveRoot(options: VerifyOptions): string {
  return options.root ? resolve(options.root) : findRepoRoot();
}

function read(root: string, repoRelative: string): string | null {
  const path = resolve(root, repoRelative);
  if (!path.startsWith(root)) return null;
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Short content hash, for recording what a port claim was checked against. */
export function hashFile(repoRelative: string, options: VerifyOptions = {}): string | null {
  const content = read(resolveRoot(options), repoRelative);
  if (content === null) return null;
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

/** Every name the module makes available, however it was exported. */
function exportedSymbols(source: string): Set<string> {
  const names = new Set<string>();
  const declaration =
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declaration)) names.add(match[1]!);

  // `export { A, B as C }` and `export type { ... }`, including re-exports.
  const list = /export\s+(?:type\s+)?\{([^}]*)\}/g;
  for (const match of source.matchAll(list)) {
    for (const part of match[1]!.split(",")) {
      const piece = part.trim();
      if (!piece) continue;
      // `A as B` exports B; `type A` exports A.
      const aliased = piece.match(/\bas\s+([A-Za-z_$][\w$]*)/);
      const bare = piece.replace(/^type\s+/, "").trim();
      names.add(aliased ? aliased[1]! : bare);
    }
  }
  return names;
}

/** Prop names declared on the component's props interface or type alias. */
function declaredProps(source: string, componentName: string): Set<string> | null {
  const pattern = new RegExp(
    `(?:interface|type)\\s+${componentName}Props(?:\\s*=)?\\s*(?:extends[^{]*)?\\{`,
  );
  const start = source.search(pattern);
  if (start === -1) return null;

  const open = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const body = source.slice(open + 1, end);
  const names = new Set<string>();
  // Only depth-0 keys: a nested object type's fields are not props.
  let nesting = 0;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (nesting === 0) {
      const key = trimmed.match(/^([A-Za-z_$][\w$]*)\s*\??\s*:/);
      if (key) names.add(key[1]!);
    }
    nesting += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
  }
  return names;
}

export interface VerifyIssue {
  level: "error" | "warning";
  field: string;
  message: string;
}

/**
 * Check one manifest against the files it describes.
 *
 * Errors are provable falsehoods. Warnings are claims that could not be
 * verified — a missing props interface is not evidence of a wrong manifest,
 * only of a component this parser cannot read.
 */
export function verifyManifest<Status extends string = ComponentStatus>(
  manifest: ComponentManifest<Status>,
  options: VerifyOptions = {},
): VerifyIssue[] {
  const root = resolveRoot(options);
  const issues: VerifyIssue[] = [];
  const error = (field: string, message: string) =>
    issues.push({ level: "error", field, message });
  const warn = (field: string, message: string) =>
    issues.push({ level: "warning", field, message });

  // 1. Source files must exist.
  for (const path of manifest.source) {
    if (read(root, path) === null) error("source", `listed file does not exist: ${path}`);
  }

  const componentSource = manifest.source[0] ? read(root, manifest.source[0]) : null;
  if (componentSource === null) {
    warn("source", "component source unreadable; skipped export and prop checks");
    return issues;
  }

  // 2. Every claimed export must actually be exported.
  const exported = exportedSymbols(componentSource);
  for (const symbol of manifest.import.symbols) {
    if (!exported.has(symbol)) {
      error("import.symbols", `"${symbol}" is not exported by ${manifest.source[0]}`);
    }
  }

  // 3. Every documented prop must exist on the props type.
  const props = declaredProps(componentSource, manifest.name);
  if (props === null) {
    warn("props", `could not locate ${manifest.name}Props; skipped prop check`);
  } else {
    for (const prop of manifest.props) {
      if (!props.has(prop.name)) {
        error("props", `documents "${prop.name}", which is not on ${manifest.name}Props`);
      }
    }
    for (const name of props) {
      if (!manifest.props.some((prop) => prop.name === name)) {
        warn("props", `"${name}" exists on ${manifest.name}Props but is undocumented`);
      }
    }
  }

  // 4. A stated port target must exist.
  if (manifest.port?.target && read(root, manifest.port.target) === null) {
    error("port.target", `does not exist: ${manifest.port.target}`);
  }

  // 5. Drift is a claim about two files at a moment in time. Nobody editing
  //    the product tree will think to update a studio sidecar, so the
  //    manifest records what it was checked against (hashes, plus the git
  //    ref they were taken at) and we flag when the ground has moved.
  if (manifest.port?.verifiedAgainst) {
    for (const [path, recorded] of Object.entries(manifest.port.verifiedAgainst)) {
      const current = hashFile(path, { root });
      if (current === null) {
        error("port.verifiedAgainst", `cannot hash missing file: ${path}`);
      } else if (current !== recorded) {
        const ref = manifest.port.ref ? ` at ${manifest.port.ref}` : "";
        warn(
          "port.verifiedAgainst",
          `${path} changed since the drift list was written${ref} (${recorded} → ${current}); re-check port.drift`,
        );
      }
    }
  } else if (manifest.port && manifest.port.status !== "none") {
    warn(
      "port.verifiedAgainst",
      "no content hashes recorded, so drift staleness cannot be detected",
    );
  }

  return issues;
}

/** Registry-wide checks that no single manifest can make about itself. */
export function verifyRegistry<Status extends string = ComponentStatus>(
  manifests: ReadonlyArray<ComponentManifest<Status>>,
): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  const seen = new Map<string, number>();
  for (const manifest of manifests) {
    seen.set(manifest.id, (seen.get(manifest.id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({
        level: "error",
        field: "registry",
        message: `duplicate id "${id}" registered ${count} times — ids are the search key`,
      });
    }
  }
  return issues;
}

/** Print-ready hashes for the files a port claim covers. */
export function portHashes<Status extends string = ComponentStatus>(
  manifest: ComponentManifest<Status>,
  options: VerifyOptions = {},
): Record<string, string> {
  const root = resolveRoot(options);
  const paths = [manifest.source[0], manifest.port?.target].filter(
    (path): path is string => Boolean(path),
  );
  const out: Record<string, string> = {};
  for (const path of paths) {
    const hash = hashFile(path, { root });
    if (hash) out[path] = hash;
  }
  return out;
}
