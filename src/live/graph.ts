import path from "node:path";

/**
 * Which files a study is built from. Pure helpers: the watcher in `server.ts`
 * owns the filesystem, these decide entries and walk imports.
 *
 * A page's entries are the host files named after its route slug
 * (`/studio/studies/cross-app-tabs` → `CrossAppTabs.tsx`, `cross-app-tabs/`,
 * `cross-app-tabs.css`) plus the registry's `source` files. Everything those
 * entries import, transitively, belongs to the page too, one hop per import.
 */

/** Hops for a file whose name only partly matches the slug. */
const PARTIAL_MATCH_HOPS = 1;

export function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s.]+/g, "-")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function pageSlug(href: string): string {
  const parts = href.replace(/\/+$/, "").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function nameScore(slug: string, name: string): number | undefined {
  const key = kebab(name).replace(/-study$/, "");
  if (!key) return undefined;
  if (key === slug) return 0;
  // Partial: one name ends or starts the other on a word boundary, and the
  // shorter is at least two words so `doc` or `shell` alone never match.
  const [short, long] = key.length < slug.length ? [key, slug] : [slug, key];
  if (!short.includes("-")) return undefined;
  if (long.endsWith(`-${short}`) || long.startsWith(`${short}-`)) {
    return PARTIAL_MATCH_HOPS;
  }
  return undefined;
}

/**
 * Entry hops for a host file (path relative to the host root) against a page
 * slug: 0 for an exact name match on the file or a parent directory, 1 for a
 * partial one, undefined when the file is not an entry.
 */
export function entryHops(slug: string, relativeFile: string): number | undefined {
  if (!slug) return undefined;
  const segments = relativeFile.split(/[\\/]/);
  const base = segments.pop() ?? "";
  const stem = base.replace(/\.[^.]+$/, "");
  let best: number | undefined;
  for (const name of [stem, ...segments]) {
    const score = nameScore(slug, name);
    if (score !== undefined && (best === undefined || score < best)) best = score;
    if (best === 0) break;
  }
  return best;
}

const IMPORT_PATTERNS: RegExp[] = [
  // import x from "y" · import { a, b } from "y" · export * from "y"
  /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  // import "y"
  /\bimport\s*['"]([^'"]+)['"]/g,
  // import("y") · require("y")
  /\b(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const CSS_IMPORT = /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g;

/** Root-relative asset strings like `src="/nexus/board.html"`, served from `public/`. */
const PUBLIC_REF = /['"`](\/[\w\-./]+\.(?:html?|svg|md|json|css|png|jpe?g|webp))['"`]/g;

export interface ParsedRefs {
  /** Module specifiers as written. */
  imports: string[];
  /** Root-relative paths that resolve against the host's `public/` dir. */
  publicRefs: string[];
}

export function parseRefs(text: string, file: string): ParsedRefs {
  const ext = path.extname(file).toLowerCase();
  const imports = new Set<string>();
  const publicRefs = new Set<string>();
  if (ext === ".css") {
    for (const match of text.matchAll(CSS_IMPORT)) imports.add(match[1]!);
  } else if (/\.(?:[cm]?[jt]sx?)$/.test(ext)) {
    for (const pattern of IMPORT_PATTERNS) {
      for (const match of text.matchAll(pattern)) imports.add(match[1]!);
    }
    for (const match of text.matchAll(PUBLIC_REF)) publicRefs.add(match[1]!);
  }
  return { imports: [...imports], publicRefs: [...publicRefs] };
}

export interface PathAlias {
  /** `@/` for a `@/*` pattern, or the exact key for patterns without `*`. */
  prefix: string;
  wildcard: boolean;
  /** Absolute target prefixes. */
  targets: string[];
}

/** Read `compilerOptions.paths` out of a tsconfig body. */
export function parsePathAliases(tsconfigText: string, root: string): PathAlias[] {
  let config: { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } };
  try {
    // tsconfig allows comments and trailing commas; strip both before parsing.
    const json = tsconfigText
      .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_m, str) => str ?? "")
      .replace(/,(\s*[}\]])/g, "$1");
    config = JSON.parse(json);
  } catch {
    return [];
  }
  const options = config.compilerOptions ?? {};
  const base = path.resolve(root, options.baseUrl ?? ".");
  return Object.entries(options.paths ?? {}).map(([key, targets]) => {
    const wildcard = key.endsWith("*");
    return {
      prefix: wildcard ? key.slice(0, -1) : key,
      wildcard,
      targets: targets.map((target) =>
        path.resolve(base, target.endsWith("*") ? target.slice(0, -1) : target),
      ),
    };
  });
}

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".md", ".mdx"];

export interface ResolveContext {
  aliases: readonly PathAlias[];
  /** Absolute path of the host's `public/` directory. */
  publicDir: string;
  /** True when the absolute path is a file the watcher knows about. */
  has(file: string): boolean;
}

function withExtensions(base: string, has: ResolveContext["has"]): string | undefined {
  if (has(base)) return base;
  for (const ext of RESOLVE_EXTENSIONS) if (has(base + ext)) return base + ext;
  for (const ext of RESOLVE_EXTENSIONS) {
    const index = path.join(base, `index${ext}`);
    if (has(index)) return index;
  }
  return undefined;
}

/** Resolve an import to a known host file, or undefined for packages and outside files. */
export function resolveImport(
  specifier: string,
  fromFile: string,
  context: ResolveContext,
): string | undefined {
  const spec = specifier.replace(/[?#].*$/, "");
  if (spec.startsWith(".")) {
    return withExtensions(path.resolve(path.dirname(fromFile), spec), context.has);
  }
  for (const alias of context.aliases) {
    const matches = alias.wildcard ? spec.startsWith(alias.prefix) : spec === alias.prefix;
    if (!matches) continue;
    const rest = alias.wildcard ? spec.slice(alias.prefix.length) : "";
    for (const target of alias.targets) {
      const found = withExtensions(path.join(target, rest), context.has);
      if (found) return found;
    }
  }
  return undefined;
}

export function resolvePublicRef(ref: string, context: ResolveContext): string | undefined {
  const file = path.join(context.publicDir, ref);
  return context.has(file) ? file : undefined;
}

/**
 * Shortest import distance from a page's entries to every file it reaches.
 * `entries` maps file → starting hops; `edges` maps importer → imported.
 */
export function distancesFrom(
  entries: ReadonlyMap<string, number>,
  edges: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const dist = new Map<string, number>();
  let frontier = [...entries.entries()].sort((a, b) => a[1] - b[1]);
  for (const [file, hops] of frontier) {
    const known = dist.get(file);
    if (known === undefined || hops < known) dist.set(file, hops);
  }
  frontier = [...dist.entries()];
  while (frontier.length > 0) {
    const next: [string, number][] = [];
    for (const [file, hops] of frontier) {
      if (dist.get(file) !== hops) continue;
      for (const target of edges.get(file) ?? []) {
        const known = dist.get(target);
        if (known === undefined || hops + 1 < known) {
          dist.set(target, hops + 1);
          next.push([target, hops + 1]);
        }
      }
    }
    frontier = next;
  }
  return dist;
}
