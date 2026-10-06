/**
 * Bundle one Studio study into a self-contained HTML page for a Claude artifact.
 *
 * Works for any Studio-style Next app: `@/*` maps to `<app>/src/*`, the
 * registry lives at `<app>/src/studio/studioRegistry.ts`, and the app's look
 * comes from `app/globals.css` (Tailwind v4) plus the CSS packages and Hudson
 * theme script in `app/layout.tsx`. The page carries React, the study, the
 * compiled CSS and its fonts inline, so it runs with no network.
 *
 * Output: `<repo>/.studio/artifacts/<id>.html` and a sidecar `<id>.json` with
 * the source hash the sync plan compares against.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export interface StudySpec {
  /** Artifact id: a slug, unique within the repo. */
  id: string;
  /** Study module, relative to the repo root. */
  entry: string;
  /** Named export rendered with `{ page }`. */
  export: string;
  /** Registry page to pass as `page`, by id or href. Defaults to `id`. */
  page?: string;
  /** "app" (default) brings the app's globals.css and fonts; "own" relies on the study's CSS imports. */
  css?: "app" | "own";
}

export interface BuildStudyOptions {
  repoRoot: string;
  /** The Next app holding the study, relative to the repo root. */
  appDir: string;
  study: StudySpec;
  /** Base url of the running Studio, for the link back. */
  studioUrl?: string;
}

export interface BuiltStudy {
  id: string;
  title: string;
  htmlPath: string;
  metaPath: string;
  sourceHash: string;
  bytes: number;
  studioHref: string;
}

const BASE_CSS = `
html, body { margin: 0; padding: 0; }
body { min-height: 100vh; background: var(--studio-canvas, #0a0a0a); color: var(--studio-ink, #e5e5e5); -webkit-font-smoothing: antialiased; }
.studio-artifact-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 8px 16px; background: #0a0a0a; color: #a3a3a3;
  font: 300 10.5px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; letter-spacing: .04em;
  border-bottom: 1px solid rgba(229, 229, 229, .09);
}
.studio-artifact-bar b { color: #e5e5e5; font-weight: 700; letter-spacing: .18em; font-size: 10px; }
.studio-artifact-bar a { color: #10b981; text-decoration: none; }
.studio-artifact-bar a:hover { text-decoration: underline; }
#root { min-height: calc(100vh - 34px); }`;

const FONT_STACKS = `
:root {
  --studio-font-sans: -apple-system, BlinkMacSystemFont, "Inter", system-ui, "Segoe UI", sans-serif;
  --studio-font-serif: "Newsreader", "Iowan Old Style", Georgia, serif;
  --studio-font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
}`;

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

/** Inline script/style bodies must not close their own tag early. */
function escapeInline(code: string, tag: "script" | "style") {
  return code.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
}

function importPath(fromDir: string, file: string) {
  const path = relative(fromDir, file).replace(/\.tsx?$/, "");
  return path.startsWith(".") ? path : `./${path}`;
}

export async function hashSources(repoRoot: string, files: readonly string[]) {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(join(repoRoot, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

/** Compiles `app/globals.css` with the app's own Tailwind, so the page gets exactly the app's utilities. */
async function compileAppCss(app: string) {
  const globals = join(app, "app/globals.css");
  if (!existsSync(globals)) return "";
  const require = createRequire(join(app, "package.json"));
  const pluginPath = require.resolve("@tailwindcss/postcss");
  // postcss may be hoisted or nested under the plugin (bun workspaces); resolve it from the plugin.
  const postcssPath = createRequire(pluginPath).resolve("postcss");
  const postcss = (await import(pathToFileURL(postcssPath).href)).default;
  const tailwind = (await import(pathToFileURL(pluginPath).href)).default;
  // Tailwind's @source scan can read binary files and mint junk rules full of control bytes; drop them.
  const junk = /[\u0000-\u0008\u000e-\u001f\uFFFD]/;
  const dropJunk = {
    postcssPlugin: "studio-drop-junk",
    OnceExit(root: { walkRules: (fn: (rule: { selector: string; toString(): string; remove(): void }) => void) => void }) {
      root.walkRules((rule) => {
        if (junk.test(rule.toString())) rule.remove();
      });
    },
  };
  const result = await postcss([tailwind({ base: app }), dropJunk]).process(await readFile(globals, "utf8"), { from: globals });
  return result.css as string;
}

/** Side-effect CSS imports in the root layout (font packages), and its Hudson theme script options. */
async function readLayout(app: string) {
  const layoutPath = join(app, "app/layout.tsx");
  if (!existsSync(layoutPath)) return { cssImports: [] as string[], themeOptions: null };
  const source = await readFile(layoutPath, "utf8");
  const cssImports = [...source.matchAll(/^import\s+["']([^"']+)["'];/gm)]
    .map((match) => match[1])
    .filter((specifier) => !specifier.startsWith("."));
  const call = source.match(/getHudsonThemeScript\(\{([^}]*)\}\)/);
  let themeOptions: Record<string, string> | null = null;
  if (call) {
    themeOptions = {};
    for (const [, key, value] of call[1].matchAll(/(\w+):\s*["']([^"']+)["']/g)) themeOptions[key] = value;
  }
  return { cssImports, themeOptions };
}

async function themeScript(app: string, options: Record<string, string> | null) {
  if (!options) return "";
  try {
    const require = createRequire(join(app, "package.json"));
    const { getHudsonThemeScript } = await import(pathToFileURL(require.resolve("hudsonkit/theme-script")).href);
    return getHudsonThemeScript(options) as string;
  } catch {
    return "";
  }
}

const PUBLIC_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif",
};

/** Root-relative urls of files in the app's `public/` ("/pets/tuck.png") become data urls. */
async function inlinePublicAssets(app: string, code: string) {
  const found = new Map<string, string>();
  for (const [, path] of code.matchAll(/["'(](\/[\w./-]+\.(?:png|jpe?g|gif|webp|svg|avif))["')]/gi)) {
    if (found.has(path)) continue;
    const file = join(app, "public", path);
    if (!existsSync(file)) continue;
    const type = PUBLIC_TYPES[path.slice(path.lastIndexOf(".")).toLowerCase()];
    found.set(path, `data:${type};base64,${(await readFile(file)).toString("base64")}`);
  }
  let out = code;
  for (const [path, dataUrl] of found) out = out.replace(new RegExp(`(["'(])${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(["')])`, "g"), `$1${dataUrl}$2`);
  return out;
}

export async function buildStudy({ repoRoot, appDir, study, studioUrl = "http://studio.studio.local" }: BuildStudyOptions): Promise<BuiltStudy> {
  const app = isAbsolute(appDir) ? appDir : join(repoRoot, appDir);
  const appSrc = join(app, "src");
  const { pages } = await import(join(appSrc, "studio/studioRegistry.ts"));
  const pageKey = study.page ?? study.id;
  const page = pages.find((candidate: { id?: string; href: string }) => candidate.id === pageKey || candidate.href === pageKey);
  if (!page) throw new Error(`No registry page "${pageKey}" in ${relative(repoRoot, app) || "."}.`);

  const outDir = join(repoRoot, ".studio/artifacts");
  const workDir = join(app, ".studio-artifact-build", study.id);
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const useAppCss = study.css !== "own";
  const layout = useAppCss ? await readLayout(app) : { cssImports: [], themeOptions: null };
  // Tailwind's output goes into the page as-is: Bun's CSS minifier folds
  // `color-mix(in oklab, var(--x) 5%, transparent)` down to `var(--x)`.
  const appCss = useAppCss ? await compileAppCss(app) : "";

  // The entry lives inside the app so bare imports resolve from the app's node_modules.
  const entryPath = join(workDir, "entry.tsx");
  await writeFile(entryPath, [
    ...layout.cssImports.map((specifier) => `import ${JSON.stringify(specifier)};`),
    `import { createRoot } from "react-dom/client";`,
    `import { ${study.export} as Study } from ${JSON.stringify(importPath(workDir, join(repoRoot, study.entry)))};`,
    `const page = ${JSON.stringify(page)};`,
    `createRoot(document.getElementById("root")!).render(<Study page={page} />);`,
    "",
  ].join("\n"));

  const alias = {
    name: "studio-aliases",
    setup(build: import("bun").PluginBuilder) {
      build.onResolve({ filter: /^@\// }, (args) => ({ path: Bun.resolveSync(join(appSrc, args.path.slice(2)), appSrc) }));
    },
  };

  const result = await Bun.build({
    entrypoints: [entryPath],
    target: "browser",
    format: "iife",
    minify: true,
    plugins: [alias],
    loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl", ".svg": "dataurl", ".png": "dataurl" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  await rm(join(app, ".studio-artifact-build"), { recursive: true, force: true });
  if (!result.success) {
    throw new AggregateError(result.logs, `Bundling ${study.id} failed:\n${result.logs.map(String).join("\n")}`);
  }

  let js = "";
  let css = "";
  for (const output of result.outputs) {
    if (output.path.endsWith(".css")) css += await output.text();
    else if (output.kind === "entry-point") js += await output.text();
  }

  js = await inlinePublicAssets(app, js);
  css = await inlinePublicAssets(app, appCss + css);

  const relativeApp = relative(repoRoot, app);
  const sources = [...new Set([study.entry, ...(page.source ?? [])])]
    // Registry sources are written relative to the repo, or to the app for apps nested in a repo.
    .map((file: string) => (existsSync(join(repoRoot, file)) ? file : join(relativeApp, file)))
    .filter((file: string) => existsSync(join(repoRoot, file)));
  if (useAppCss) sources.push(join(relativeApp, "app/globals.css"));
  const sourceHash = await hashSources(repoRoot, sources);

  const studioHref = `${studioUrl.replace(/\/$/, "")}${page.href}`;
  const title = page.label as string;
  const theme = await themeScript(app, layout.themeOptions);
  const html = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(page.blurb ?? "")}">`,
    `<meta name="studio-study" content="${escapeHtml(study.id)}">`,
    `<meta name="studio-source-hash" content="${sourceHash}">`,
    ...(theme ? [`<script>${escapeInline(theme, "script")}</script>`] : []),
    `<style>${escapeInline(FONT_STACKS + css + BASE_CSS, "style")}</style>`,
    `<div class="studio-artifact-bar"><span><b>STUDIO</b>&nbsp;&nbsp;${escapeHtml(title)}</span>`,
    `<a href="${escapeHtml(studioHref)}" target="_blank" rel="noopener">Open in Studio →</a></div>`,
    `<div id="root"></div>`,
    `<script>${escapeInline(js, "script")}</script>`,
    "",
  ].join("\n");

  const htmlPath = join(outDir, `${study.id}.html`);
  const metaPath = join(outDir, `${study.id}.json`);
  await mkdir(dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, html);
  const built = { id: study.id, title, htmlPath, metaPath, sourceHash, bytes: Buffer.byteLength(html), studioHref };
  await writeFile(metaPath, `${JSON.stringify({ ...built, appDir: relativeApp, study, builtAt: new Date().toISOString(), sources }, null, 2)}\n`);
  return built;
}
