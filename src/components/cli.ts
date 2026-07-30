#!/usr/bin/env bun
/**
 * `studio components` — the query surface for a consumer's component
 * registry, with no dev server running. Wired into `bin/studio.mjs`, which
 * delegates here through bun (manifests are TypeScript; bun loads them with
 * no build step).
 *
 * How it finds the consumer's registry
 * ────────────────────────────────────
 * Manifests are consumer data, not package data, so the CLI loads them from
 * the project it is invoked in. Convention: a `studio.components.ts` (or
 * `.mts`/`.mjs`/`.js`) file at the repo root — the nearest `.git` ancestor of
 * the cwd — exporting a `manifests` array (a default export works too).
 * `--registry <path>` overrides the location. `verify` resolves the
 * manifest's repo-relative paths against that same root (`--root` overrides).
 *
 * Hard rules:
 *   - `--json` on every subcommand prints ONLY valid JSON on stdout; agents
 *     pipe it to `jq`. Diagnostics go to stderr.
 *   - `audit` and `verify` exit non-zero on error-level findings, so they
 *     work as CI gates.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditManifest, type AuditIssue, type ComponentManifest } from "./manifest";
import { createComponentRegistry } from "./registry";
import { findRepoRoot, portHashes, verifyManifest, verifyRegistry } from "./verify";

const REGISTRY_FILE_CANDIDATES = [
  "studio.components.ts",
  "studio.components.mts",
  "studio.components.mjs",
  "studio.components.js",
];

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`studio components: ${message}\n`);
  process.exit(1);
}

// ── arg parsing ──────────────────────────────────────────────────────────

interface ParsedArgs {
  positionals: string[];
  json: boolean;
  status?: string;
  limit?: number;
  registry?: string;
  root?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const out: ParsedArgs = { positionals, json: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const inline = arg.match(/^--(status|limit|registry|root)=(.*)$/);
    if (arg === "--json") {
      out.json = true;
    } else if (arg === "--status" || inline?.[1] === "status") {
      const value = inline ? inline[2]! : argv[++i];
      if (!value) fail("--status requires a value");
      out.status = value;
    } else if (arg === "--limit" || inline?.[1] === "limit") {
      const value = inline ? inline[2]! : argv[++i];
      const parsed = value ? Number.parseInt(value, 10) : NaN;
      if (Number.isNaN(parsed) || parsed <= 0) fail("--limit must be a positive integer");
      out.limit = parsed;
    } else if (arg === "--registry" || inline?.[1] === "registry") {
      const value = inline ? inline[2]! : argv[++i];
      if (!value) fail("--registry requires a path");
      out.registry = value;
    } else if (arg === "--root" || inline?.[1] === "root") {
      const value = inline ? inline[2]! : argv[++i];
      if (!value) fail("--root requires a path");
      out.root = value;
    } else {
      positionals.push(arg);
    }
  }
  return out;
}

// ── registry loading ─────────────────────────────────────────────────────

interface LoadedRegistry {
  registry: ReturnType<typeof createComponentRegistry>;
  /** Repo root the manifest paths are relative to. */
  root: string;
  /** Path of the file the manifests were loaded from. */
  registryFile: string;
}

function resolveRoot(args: ParsedArgs): string {
  if (args.root) return resolve(args.root);
  try {
    return findRepoRoot(process.cwd());
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function loadRegistry(args: ParsedArgs): Promise<LoadedRegistry> {
  const root = resolveRoot(args);

  let registryFile: string | undefined;
  if (args.registry) {
    registryFile = resolve(args.registry);
    if (!existsSync(registryFile)) fail(`--registry file does not exist: ${registryFile}`);
  } else {
    registryFile = REGISTRY_FILE_CANDIDATES.map((name) => resolve(root, name)).find(existsSync);
    if (!registryFile) {
      fail(
        `no component registry found at ${root} — expected one of ` +
          `${REGISTRY_FILE_CANDIDATES.join(", ")} exporting a "manifests" array ` +
          `(or pass --registry <path>)`,
      );
    }
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(registryFile).href)) as Record<string, unknown>;
  } catch (e) {
    fail(`could not load ${registryFile}: ${e instanceof Error ? e.message : String(e)}`);
  }

  const candidate = (mod.manifests ?? mod.default) as unknown;
  const manifests = Array.isArray(candidate)
    ? (candidate as ComponentManifest[])
    : candidate &&
        typeof candidate === "object" &&
        Array.isArray((candidate as { manifests?: unknown }).manifests)
      ? ((candidate as { manifests: ComponentManifest[] }).manifests)
      : undefined;
  if (!manifests) {
    fail(`${registryFile} must export a "manifests" array (named or default export)`);
  }

  return { registry: createComponentRegistry({ manifests }), root, registryFile };
}

// ── output helpers ───────────────────────────────────────────────────────

function padCols(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  }
  return rows.map((row) =>
    row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join("  "),
  );
}

// ── commands ─────────────────────────────────────────────────────────────

function cmdList(loaded: LoadedRegistry, args: ParsedArgs): number {
  const { registry } = loaded;
  const components = args.status
    ? registry.all().filter((m) => m.status === args.status)
    : registry.all();

  if (args.json) {
    printJson({
      components: components.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        summary: m.summary,
      })),
    });
    return 0;
  }

  if (components.length === 0) {
    console.log(args.status ? `No components with status "${args.status}".` : "No components registered.");
    return 0;
  }
  for (const line of padCols(components.map((m) => [m.id, m.name, m.status, m.summary]))) {
    console.log(line);
  }
  return 0;
}

function cmdFind(loaded: LoadedRegistry, args: ParsedArgs): number {
  const query = args.positionals.join(" ").trim();
  if (!query) fail("find requires a query, e.g. `studio components find model picker`");

  const hits = loaded.registry.find(query, args.limit);

  if (args.json) {
    printJson({
      query,
      hits: hits.map((hit) => ({
        id: hit.manifest.id,
        name: hit.manifest.name,
        status: hit.manifest.status,
        score: hit.score,
        matched: hit.matched,
        coverage: hit.coverage,
        summary: hit.manifest.summary,
      })),
    });
    return 0;
  }

  if (hits.length === 0) {
    console.log(`No matches for "${query}". Try \`studio components list\` to see everything.`);
    return 0;
  }
  console.log(`${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}":\n`);
  const rows = hits.map((hit) => [
    hit.manifest.id,
    hit.manifest.name,
    hit.manifest.status,
    String(hit.score),
    hit.matched.join(","),
  ]);
  for (const line of padCols(rows)) console.log(line);
  console.log("");
  for (const hit of hits) console.log(`${hit.manifest.id}: ${hit.manifest.summary}`);
  return 0;
}

function cmdShow(loaded: LoadedRegistry, args: ParsedArgs): number {
  const id = args.positionals[0];
  if (!id) fail("show requires a component id, e.g. `studio components show status-pill`");

  const manifest = loaded.registry.get(id);
  if (!manifest) {
    if (args.json) printJson({ error: `no component "${id}"` });
    else console.log(`No component "${id}". Try \`studio components list\`.`);
    return 1;
  }

  if (args.json) {
    printJson(manifest);
    return 0;
  }

  const lines: string[] = [];
  const h1 = (text: string) => {
    lines.push("", text, "=".repeat(text.length));
  };
  const h2 = (text: string) => {
    lines.push("", text, "-".repeat(text.length));
  };

  h1(`${manifest.name} (${manifest.id})`);
  lines.push(`status: ${manifest.status}`, "", manifest.summary);

  h2("When to use");
  for (const item of manifest.whenToUse) lines.push(`- ${item}`);

  h2("When not to use");
  if (manifest.whenNotToUse.length === 0) lines.push("(not documented)");
  else for (const item of manifest.whenNotToUse) lines.push(`- ${item}`);

  h2("Import");
  lines.push(`import { ${manifest.import.symbols.join(", ")} } from "${manifest.import.from}";`);

  h2("Props");
  if (manifest.props.length === 0) {
    lines.push("(no props documented)");
  } else {
    const rows = manifest.props.map((p) => [
      p.name,
      p.type,
      p.required ? "required" : (p.default ?? "-"),
      p.summary,
    ]);
    for (const line of padCols([["name", "type", "default", "summary"], ...rows])) lines.push(line);
  }

  if (manifest.slots?.length) {
    h2("Slots");
    const rows = manifest.slots.map((s) => [s.name, s.type, s.summary]);
    for (const line of padCols([["name", "type", "summary"], ...rows])) lines.push(line);
  }

  if (manifest.states?.length) {
    h2("States");
    for (const state of manifest.states) {
      lines.push(`- ${state.name} (trigger: ${state.trigger})`, `  ${state.behavior}`);
    }
  }

  if (manifest.keyboard?.length) {
    h2("Keyboard");
    const rows = manifest.keyboard.map((k) => [k.keys, k.action, k.scope ?? "-"]);
    for (const line of padCols([["keys", "action", "scope"], ...rows])) lines.push(line);
  }

  if (manifest.a11y?.length) {
    h2("Accessibility");
    for (const note of manifest.a11y) lines.push(`- ${note}`);
  }

  if (manifest.data) {
    h2("Data contract");
    lines.push(`module: ${manifest.data.module}`, manifest.data.summary);
    if (manifest.data.production) lines.push(`production: ${manifest.data.production}`);
  }

  if (manifest.dependencies) {
    h2("Dependencies");
    if (manifest.dependencies.components?.length) {
      lines.push(`components: ${manifest.dependencies.components.join(", ")}`);
    }
    if (manifest.dependencies.tokens?.length) {
      lines.push(`tokens: ${manifest.dependencies.tokens.join(", ")}`);
    }
    if (manifest.dependencies.packages?.length) {
      lines.push(`packages: ${manifest.dependencies.packages.join(", ")}`);
    }
  }

  h2("Examples");
  for (const example of manifest.examples) {
    lines.push("", example.title);
    if (example.summary) lines.push(example.summary);
    lines.push(example.code);
  }

  if (manifest.atom) {
    h2("Atom route");
    lines.push(manifest.atom);
  }

  h2("Source");
  for (const file of manifest.source) lines.push(`- ${file}`);

  if (manifest.port) {
    h2("Port");
    lines.push(`status: ${manifest.port.status}`);
    if (manifest.port.target) lines.push(`target: ${manifest.port.target}`);
    if (manifest.port.ref) lines.push(`ref: ${manifest.port.ref}`);
    if (manifest.port.notes) lines.push(manifest.port.notes);
    if (manifest.port.drift?.length) {
      lines.push("drift:");
      for (const item of manifest.port.drift) lines.push(`  - ${item}`);
    }
  }

  console.log(lines.join("\n").trim());
  return 0;
}

function cmdAudit(loaded: LoadedRegistry, args: ParsedArgs): number {
  const { registry } = loaded;
  const health = registry.health();
  const issuesById: Record<string, AuditIssue[]> = {};
  for (const manifest of registry.all()) issuesById[manifest.id] = auditManifest(manifest);

  const dishonest = health.filter((h) => !h.honest);
  const hasErrors = Object.values(issuesById).some((issues) =>
    issues.some((issue) => issue.level === "error"),
  );
  const exitCode = dishonest.length > 0 || hasErrors ? 1 : 0;

  if (args.json) {
    printJson({ health, issues: issuesById });
    return exitCode;
  }

  console.log(`Registry health: ${health.length} component${health.length === 1 ? "" : "s"}\n`);
  const rows = health.map((h) => [
    h.id,
    h.status,
    h.honest ? "honest" : "DISHONEST",
    `${h.errors} error${h.errors === 1 ? "" : "s"}`,
    `${h.warnings} warning${h.warnings === 1 ? "" : "s"}`,
  ]);
  for (const line of padCols([["id", "status", "honesty", "errors", "warnings"], ...rows])) {
    console.log(line);
  }

  for (const manifest of registry.all()) {
    const issues = issuesById[manifest.id]!;
    if (issues.length === 0) continue;
    console.log(`\n${manifest.id}:`);
    for (const issue of issues) console.log(`  [${issue.level}] ${issue.field}: ${issue.message}`);
  }

  console.log(exitCode === 0 ? "\nOK" : "\nFAIL");
  return exitCode;
}

/**
 * `verify` — does the manifest tell the truth?
 *
 * `audit` checks a manifest against itself and can only prove it is
 * incomplete. This reads the files it describes and proves it is WRONG: a
 * source path that no longer exists, an export that was renamed, a prop that
 * was deleted, a drift list written against a version of production that has
 * since moved.
 */
function cmdVerify(loaded: LoadedRegistry, args: ParsedArgs): number {
  const manifests = loaded.registry.all();
  const perComponent = manifests.map((manifest) => ({
    id: manifest.id,
    issues: verifyManifest(manifest, { root: loaded.root }),
  }));
  const registryIssues = verifyRegistry(manifests);
  const errors =
    registryIssues.filter((issue) => issue.level === "error").length +
    perComponent.reduce(
      (total, entry) => total + entry.issues.filter((issue) => issue.level === "error").length,
      0,
    );

  if (args.json) {
    printJson({
      ok: errors === 0,
      errors,
      root: loaded.root,
      registry: registryIssues,
      components: Object.fromEntries(perComponent.map((e) => [e.id, e.issues])),
    });
    return errors === 0 ? 0 : 1;
  }

  console.log(`Verifying ${manifests.length} manifest(s) against ${loaded.root}\n`);
  for (const issue of registryIssues) {
    console.log(`  [${issue.level}] ${issue.field}: ${issue.message}`);
  }
  for (const entry of perComponent) {
    if (entry.issues.length === 0) {
      console.log(`${entry.id}: ok`);
      continue;
    }
    console.log(`${entry.id}:`);
    for (const issue of entry.issues) {
      console.log(`  [${issue.level}] ${issue.field}: ${issue.message}`);
    }
  }
  console.log(errors === 0 ? "\nOK" : `\nFAILED — ${errors} error(s)`);
  return errors === 0 ? 0 : 1;
}

/** `hashes <id>` — regenerate the `port.verifiedAgainst` block to paste in. */
function cmdHashes(loaded: LoadedRegistry, args: ParsedArgs): number {
  const id = args.positionals[0];
  if (!id) fail("hashes requires a component id");
  const manifest = loaded.registry.get(id);
  if (!manifest) fail(`no component "${id}"`);

  const hashes = portHashes(manifest, { root: loaded.root });

  // The ref the hashes were taken against — a port claim without it is
  // branch-relative without saying so.
  let ref: string | undefined;
  try {
    ref = execFileSync("git", ["rev-parse", "HEAD"], { cwd: loaded.root })
      .toString()
      .trim()
      .slice(0, 12);
  } catch {
    // Not a git checkout or git missing — hashes alone still work.
  }

  if (args.json) {
    printJson({ ref, verifiedAgainst: hashes });
    return 0;
  }
  if (ref) console.log(`ref: "${ref}",`);
  console.log("verifiedAgainst: {");
  for (const [path, hash] of Object.entries(hashes)) {
    console.log(`  "${path}": "${hash}",`);
  }
  console.log("},");
  return 0;
}

/** `port <id>` — the port block of one manifest: status, target, ref, drift. */
function cmdPort(loaded: LoadedRegistry, args: ParsedArgs): number {
  const id = args.positionals[0];
  if (!id) fail("port requires a component id, e.g. `studio components port status-pill`");
  const manifest = loaded.registry.get(id);
  if (!manifest) fail(`no component "${id}"`);

  if (args.json) {
    printJson({ id: manifest.id, port: manifest.port ?? null });
    return 0;
  }
  if (!manifest.port) {
    console.log(`${manifest.id}: no port block — status unstated.`);
    return 0;
  }
  console.log(`${manifest.id} port: ${manifest.port.status}`);
  if (manifest.port.target) console.log(`  target: ${manifest.port.target}`);
  if (manifest.port.ref) console.log(`  ref: ${manifest.port.ref}`);
  if (manifest.port.notes) console.log(`  ${manifest.port.notes}`);
  if (manifest.port.drift?.length) {
    console.log("  drift:");
    for (const item of manifest.port.drift) console.log(`    - ${item}`);
  }
  if (manifest.port.verifiedAgainst) {
    console.log("  verifiedAgainst:");
    for (const [path, hash] of Object.entries(manifest.port.verifiedAgainst)) {
      console.log(`    ${path}  ${hash}`);
    }
  }
  return 0;
}

const USAGE = `studio components — query a project's component registry

Usage:
  studio components list [--status <status>] [--json]
  studio components find <query...> [--limit N] [--json]
  studio components show <id> [--json]
  studio components audit [--json]
  studio components verify [--json]
  studio components port <id> [--json]
  studio components hashes <id> [--json]

Registry discovery:
  Loads "manifests" from studio.components.ts (or .mts/.mjs/.js) at the repo
  root — the nearest .git ancestor of the cwd. Flags:
  --registry <path>   Use an explicit registry file
  --root <path>       Repo root for verify's repo-relative paths

Commands:
  list    List every registered component (id, name, status, summary).
  find    Ranked search. Multi-word queries do not need quotes, and a
          plain-English sentence works — stopwords are dropped and results
          are ranked by how much of the query matched.
  show    Full manifest for one component: props, states, keyboard, a11y,
          data contract, dependencies, examples, source, port status.
  audit   Check each manifest against ITSELF (completeness). Exits 1 if any
          component claims the top status without clearing the bar or has an
          error-level issue. Safe to use as a CI gate.
  verify  Check each manifest against the FILESYSTEM: source paths exist,
          claimed exports are exported, documented props are real, recorded
          port hashes still match. Exits 1 on any error. "audit" proves a
          manifest is incomplete; "verify" proves it is wrong.
  port    One component's port block: status, target, ref, drift, hashes.
  hashes  Print a fresh port.ref + port.verifiedAgainst block for a component.

--json on every subcommand prints only valid JSON on stdout.
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;

  if (!command || command === "help" || command === "-h" || command === "--help") {
    console.log(USAGE);
    return 0;
  }

  const args = parseArgs(rest);
  const loaded = await loadRegistry(args);

  switch (command) {
    case "list":
      return cmdList(loaded, args);
    case "find":
      return cmdFind(loaded, args);
    case "show":
      return cmdShow(loaded, args);
    case "audit":
      return cmdAudit(loaded, args);
    case "verify":
      return cmdVerify(loaded, args);
    case "port":
      return cmdPort(loaded, args);
    case "hashes":
      return cmdHashes(loaded, args);
    default:
      process.stderr.write(`studio components: unknown command "${command}"\n\n`);
      process.stderr.write(USAGE);
      return 1;
  }
}

process.exitCode = await main();
