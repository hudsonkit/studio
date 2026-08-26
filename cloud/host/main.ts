/**
 * Studio cloud host — one process serving every studio.
 *
 * Layout on the VM:
 *
 *   ~/studios/<id>/           studio worktree: studio.json + views/*.tsx
 *   ~/studios/<id>/ is a git repo with receive.denyCurrentBranch=updateInstead,
 *   so `git push` from anywhere updates it atomically and refuses on dirty.
 *
 * Routes:
 *   GET /                    index of studios
 *   GET /<id>/…              view shell; Vite transforms the view module
 *   GET /api/health          liveness
 *   GET|POST /api/scout/pairing   review-session agent pairing (per studio)
 *
 * The host watches worktree files; Vite HMR pushes edits to connected
 * browsers without restarts.
 */

import { createServer as createHttpServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";

const STUDIOS_DIR = process.env.STUDIOS_DIR ?? "/home/exedev/studios";
const PORT = Number(process.env.STUDIO_HOST_PORT ?? 43215);
const BIND = process.env.STUDIO_HOST_BIND ?? "127.0.0.1";

interface StudioPage {
  path: string;
  view: string;
  title?: string;
}

interface StudioManifest {
  id: string;
  label: string;
  pages: StudioPage[];
  /** Optional real layout module rendered around every page view. */
  layout?: string;
  /** Raw HTML injected into every page shell (fonts, style runtimes). */
  head?: string[];
}

interface Studio {
  manifest: StudioManifest;
  dir: string;
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const NEXT_LINK_SHIM = path.join(import.meta.dir, "compat", "next-link.tsx");
const NEXT_NAVIGATION_SHIM = path.join(import.meta.dir, "compat", "next-navigation.ts");

/**
 * Resolves imports inside a synced studio's real source tree: `@/…` to the
 * studio root and the few Next runtime modules studies touch to host-served
 * compat shims. Scoped by the importing file's studio so N studios can share
 * one Vite server without alias collisions.
 */
function studioResolvePlugin(studios: Studio[]) {
  return {
    name: "studio-resolve",
    enforce: "pre" as const,
    async resolveId(source: string, importer: string | undefined) {
      if (!importer) return null;
      // Vite hands importers inside the root as root-relative ids; the
      // boot module lives in the root, so its graph arrives relative.
      const importerAbs = importer.startsWith("/") ? importer : path.resolve(process.cwd(), importer);
      const studio = studios.find((candidate) => importerAbs.startsWith(candidate.dir));
      if (!studio) return null;
      if (source === "next/link") return NEXT_LINK_SHIM;
      if (source === "next/navigation") return NEXT_NAVIGATION_SHIM;
      const scoped = source.match(/^@\/(.*)$/);
      if (scoped) {
        // Delegate to Vite's resolver so extensionless sources (`@/lib/utils`)
        // land on real files and get /@fs URLs the browser can load.
        return this.resolve(path.join(studio.dir, scoped[1]), importer, { skipSelf: true });
      }
      return null;
    },
  };
}

/**
 * Serves generated studio bootstrap modules completely in-memory without
 * writing files to disk. Prevents Vite's file watcher from triggering spurious
 * full-page reloads when pages or prefetches are requested.
 */
function studioBootPlugin(bootModules: Map<string, string>) {
  return {
    name: "studio-boot",
    enforce: "pre" as const,
    resolveId(id: string) {
      if (id.includes(".studio-boot/boot-") || id.startsWith("/@studio-boot/")) {
        return id.startsWith("/") ? id : `/${id}`;
      }
      return null;
    },
    load(id: string) {
      if (id.includes(".studio-boot/boot-") || id.startsWith("/@studio-boot/")) {
        const clean = id.replace(/^\//, "");
        const hash = clean.match(/boot-([a-f0-9]+)\.js/)?.[1];
        if (hash && bootModules.has(hash)) {
          return bootModules.get(hash)!;
        }
      }
      return null;
    },
  };
}

type PostcssProcessor = {
  process(css: string, options?: { from?: string }): Promise<{ css: string; map: unknown }>;
};
/**
 * Compiles a studio's CSS with the studio's OWN tailwindcss + postcss
 * installs and config (resolved from the studio's node_modules), so
 * `theme(...)` calls, directives, and content globs behave exactly as in
 * the studio's local dev server. No build artifacts — transform happens
 * per request, like any dev server.
 */
function studioTailwindPlugin(studios: Studio[]) {
  const chains: Record<string, PostcssProcessor> = {};
  return {
    name: "studio-tailwind",
    enforce: "pre" as const,
    async transform(css: string, id: string) {
      if (!id.endsWith(".css")) return null;
      const idAbs = id.startsWith("/") ? id : path.resolve(process.cwd(), id);
      const studio = studios.find((candidate) => idAbs.startsWith(candidate.dir));
      if (!studio) return null;
      let processor: PostcssProcessor | undefined = chains[studio.dir];
      if (!processor) {
        // Library boundary: the studio's own dependency versions, resolved
        // from its tree, expose loosely-typed plugin shapes.
        const requireFromStudio = createRequire(path.join(studio.dir, "package.json"));
        const jitiFactory = requireFromStudio("jiti") as (
          filename: string,
          options?: { interopDefault?: boolean },
        ) => (id: string) => Record<string, unknown>;
        const tailwindcss = requireFromStudio("tailwindcss") as (options?: { config?: unknown }) => unknown;
        const autoprefixer = requireFromStudio("autoprefixer") as (options?: unknown) => unknown;
        const postcss = requireFromStudio("postcss") as (plugins: unknown[]) => PostcssProcessor;

        // Execute the studio's real config, then absolutize `content` globs:
        // tailwind resolves them against the process cwd, which is the host
        // repo, not the studio tree.
        const loadConfig = jitiFactory(path.join(studio.dir, "tailwind.config.ts"), { interopDefault: true });
        const studioConfig = loadConfig("./tailwind.config.ts") as { content?: unknown };
        const content = Array.isArray(studioConfig.content) ? studioConfig.content : [];
        studioConfig.content = content.map((glob) =>
          typeof glob === "string" && !path.isAbsolute(glob) ? path.join(studio.dir, glob) : glob,
        );
        processor = postcss([tailwindcss({ config: studioConfig }), autoprefixer()]);
        chains[studio.dir] = processor;
      }
      const result = await processor.process(css, { from: id });
      return { code: result.css, map: result.map ?? null };
    },
  };
}

/**
 * Route discovery for synced Next-app sources: every page.tsx under the
 * app directory becomes a route at its directory path, mirroring the app
 * router the source was written for. Dynamic segments ([param]) and
 * underscore-private directories are skipped. Manifest pages take
 * precedence over discovered ones.
 */
async function discoverPages(studioDir: string): Promise<StudioPage[]> {
  const pages: StudioPage[] = [];
  try {
    if ((await stat(path.join(studioDir, "app", "page.tsx"))).isFile()) {
      pages.push({ path: "/", view: "app/page.tsx" });
    }
  } catch {
    // no root page
  }
  const walk = async (dir: string, route: string): Promise<void> => {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const param = entry.name.match(/^\[([a-z]+)\]$/);
      const child = path.join(dir, entry.name);
      const pageFile = path.join(child, "page.tsx");
      const segment = param ? `:${param[1]}` : `/${entry.name}`;
      try {
        if ((await stat(pageFile)).isFile()) {
          pages.push({
            path: `${route}/${segment}`.replace("//", "/"),
            view: path.relative(studioDir, pageFile),
          });
        }
      } catch {
        // directory without a page — still walk it for nested routes
      }
      await walk(child, `${route}/${segment}`);
    }
  };
  await walk(path.join(studioDir, "app"), "");
  return pages;
}

async function listStudios(): Promise<Studio[]> {
  const studios: Studio[] = [];
  let entries: string[] = [];

  try {
    entries = await readdir(STUDIOS_DIR);
  } catch {
    return studios;
  }
  for (const entry of entries) {
    const dir = path.join(STUDIOS_DIR, entry);
    try {
      const manifestPath = path.join(dir, "studio.json");
      const s = await stat(manifestPath);
      if (!s.isFile()) continue;
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as StudioManifest;
      if (manifest.id && Array.isArray(manifest.pages)) {
        studios.push({ manifest, dir });
      }
    } catch {
      // unreadable or missing manifest — not a studio
    }
  }
  return studios;
}

function htmlDocument(body: string, head = ""): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>@view-transition { navigation: auto; }</style>
  <title>Studio</title>
  ${head}
</head>
<body>${body}</body>
</html>`;
}

function json(response: import("node:http").ServerResponse, data: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
}

function notFound(response: import("node:http").ServerResponse, detail: string): void {
  json(response, { error: "not_found", detail }, 404);
}

async function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body;
}

async function start(): Promise<void> {
  const studios = await listStudios();
  const discoveredRoutes: Record<string, StudioPage[]> = {};
  for (const studio of studios) {
    discoveredRoutes[studio.dir] = await discoverPages(studio.dir);
  }

  const bootModules = new Map<string, string>();

  const vite = await createViteServer({
    appType: "custom",
    plugins: [
      react(),
      studioResolvePlugin(studios),
      studioTailwindPlugin(studios),
      studioBootPlugin(bootModules),
    ],
    resolve: {
      // Nested node_modules (studio deps like hudsonkit) must resolve React
      // to the host's optimized instance — two copies break hooks.
      dedupe: ["react", "react-dom"],
    },
    server: {
      middlewareMode: true,
      // Tailnet-private dev server: MagicDNS names and tailnet IPs are all
      // trusted, so Vite's host check is disabled.
      allowedHosts: true,
      fs: { allow: [STUDIOS_DIR, process.cwd()] },
      watch: {
        ignored: ["**/.studio-boot/**", "**/.studio/**", "**/node_modules/**", "**/.git/**"],
      },
    },
    optimizeDeps: { include: ["react", "react-dom"] },
  });

  const server = createHttpServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
      const segments = url.pathname.split("/").filter(Boolean);

      if (url.pathname === "/api/health") {
        return json(response, { ok: true, studios: (await listStudios()).length });
      }

      // Pairing: /api/scout/pairing under a studio path, e.g. /talkie/api/…
      if (segments.length >= 2 && segments[1] === "api" && segments[2] === "scout" && segments[3] === "pairing") {
        const studioId = segments[0];
        const studio = (await listStudios()).find((candidate) => candidate.manifest.id === studioId);
        if (!studio) return notFound(response, `studio ${studioId} not found`);
        const pairingPath = path.join(studio.dir, ".studio", "review-pairing.json");
        if (request.method === "POST") {
          const body = JSON.parse((await readBody(request)) || "{}") as { agent?: string };
          if (!body.agent?.trim()) return json(response, { error: "agent is required." }, 400);
          await import("node:fs/promises").then((fs) =>
            fs.mkdir(path.join(studio.dir, ".studio"), { recursive: true }),
          );
          const pairing = {
            pairedAgent: body.agent.trim(),
            pairedAt: new Date().toISOString(),
          };
          await import("node:fs/promises").then((fs) =>
            fs.writeFile(pairingPath, `${JSON.stringify(pairing, null, 2)}\n`),
          );
          return json(response, pairing);
        }
        try {
          return json(response, JSON.parse(await readFile(pairingPath, "utf8")));
        } catch {
          return json(response, { pairedAgent: null, pairedAt: null });
        }
      }

      // Index of studios.
      if (url.pathname === "/" || url.pathname === "") {
        const studios = await listStudios();
        const items = studios
          .map((studio) => {
            const routes = studio.manifest.pages.length + (discoveredRoutes[studio.dir]?.length ?? 0);
            return `<a class="studio-card" href="/${studio.manifest.id}/">
              <div class="card-head">
                <span class="card-label">${studio.manifest.label ?? studio.manifest.id}</span>
                <span class="card-count">${routes} route${routes === 1 ? "" : "s"}</span>
              </div>
              <span class="card-id">/${studio.manifest.id}/</span>
            </a>`;
          })
          .join("\n");
        const html = htmlDocument(
          `<main>
            <p class="eyebrow">Studio · Cloud Host</p>
            <h1>Studios</h1>
            <div class="cards">${items || `<p class="empty">No studios shipped yet. <code>studio sync --dir &lt;studio-folder&gt; --host &lt;vm&gt;</code></p>`}</div>
          </main>
          <style>
            :root { color-scheme: light; }
            * { box-sizing: border-box; }
            body {
              margin: 0; min-height: 100vh; background: #f8f8f7; color: #232423;
              font-family: Inter, -apple-system, "SF Pro Text", sans-serif;
              -webkit-font-smoothing: antialiased;
            }
            main { max-width: 56rem; margin: 0 auto; padding: 4.5rem 2rem 4rem; }
            .eyebrow {
              margin: 0 0 10px; font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
              font-size: 10px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: #76767a;
            }
            h1 {
              margin: 0 0 28px; padding-bottom: 18px; border-bottom: 1px solid #dededd;
              font-family: Newsreader, "Iowan Old Style", Georgia, serif;
              font-size: 34px; font-weight: 500; letter-spacing: -0.01em;
            }
            .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
            .studio-card {
              display: block; padding: 18px 20px 16px; border: 1px solid #dededd; border-radius: 10px;
              background: #fff; text-decoration: none; color: inherit;
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
              transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
            }
            .studio-card:hover {
              border-color: #232423; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.1); transform: translateY(-1px);
            }
            .card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
            .card-label { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
            .card-count {
              font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
              font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #76767a;
            }
            .card-id {
              display: block; margin-top: 6px;
              font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
              font-size: 11px; color: #76767a;
            }
            .empty { color: #76767a; font-size: 14px; }
            .empty code {
              font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
              font-size: 12px; background: #ececeb; padding: 2px 6px; border-radius: 4px;
            }
          </style>`,
        );
        response.writeHead(200, { "content-type": "text/html" });
        return response.end(await vite.transformIndexHtml("/", html));
      }

      // Studio views: /<id>/<pagePath>
      const studios = await listStudios();
      const studio = studios.find((candidate) => candidate.manifest.id === segments[0]);
      if (studio) {
        const pagePath = "/" + segments.slice(1).join("/");
        const pages = [...studio.manifest.pages, ...(discoveredRoutes[studio.dir] ?? [])];
        let page = pages.find((candidate) => candidate.path === pagePath);
        let params: Record<string, string> = {};
        if (!page) {
          // Parametrized routes (`/studies/:slug`) match by segment shape.
          for (const candidate of pages) {
            if (!candidate.path.includes(":")) continue;
            const pattern = candidate.path.split("/");
            const actual = pagePath.split("/");
            if (pattern.length !== actual.length) continue;
            const captured: Record<string, string> = {};
            let hit = true;
            for (let i = 0; i < pattern.length; i++) {
              const seg = pattern[i];
              if (seg.startsWith(":")) captured[seg.slice(1)] = decodeURIComponent(actual[i]);
              else if (seg !== actual[i]) { hit = false; break; }
            }
            if (hit) { page = candidate; params = captured; break; }
          }
        }
        if (page) {
          const viewAbs = path.resolve(studio.dir, page.view);
          const layoutAbs = studio.manifest.layout ? path.resolve(studio.dir, studio.manifest.layout) : null;
          const bootHash = createHash("sha1").update(`${viewAbs}\n${layoutAbs}`).digest("hex").slice(0, 12);
          const bootSrc = `import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import View from ${JSON.stringify(`/@fs${viewAbs}`)};
${layoutAbs ? `import Layout from ${JSON.stringify(`/@fs${layoutAbs}`)};` : ""}
const container = document.getElementById("root");
if (!window.__studioRoot && container) {
  window.__studioRoot = createRoot(container);
}
const view = React.createElement(View);
const element = ${layoutAbs ? "React.createElement(Layout, null, view)" : "view"};
const commit = () => {
  if (window.__studioRoot) {
    flushSync(() => {
      window.__studioRoot.render(element);
    });
  }
};
if (document.startViewTransition && window.__studioMounted) {
  document.startViewTransition(commit);
} else {
  commit();
  window.__studioMounted = true;
}
if (import.meta.hot) {
  import.meta.hot.accept();
}`;
          bootModules.set(bootHash, bootSrc);
          const bootUrl = `/.studio-boot/boot-${bootHash}.js`;
          const html = htmlDocument(
            `<div id="root"></div>
             <script>window.__studioRoute = { params: ${JSON.stringify(params)} };</script>
             <script type="module" blocking="render" src="${bootUrl}"></script>`,
            (studio.manifest.head ?? []).join("\n"),
          );
          response.writeHead(200, { "content-type": "text/html" });
          return response.end(await vite.transformIndexHtml(url.pathname, html));
        }

        // Source assets: any real file inside the studio tree serves as-is
        // (fonts, images, runtime style configs referenced by head snippets).
        const assetRel = pagePath.replace(/^\//, "");
        const assetAbs = path.resolve(studio.dir, assetRel);
        if (assetRel && assetAbs.startsWith(studio.dir)) {
          try {
            const data = await readFile(assetAbs);
            response.writeHead(200, {
              "content-type": MIME_TYPES[path.extname(assetAbs)] ?? "application/octet-stream",
            });
            return response.end(data);
          } catch {
            // not a file — fall through to 404
          }
        }
        return notFound(response, `page ${pagePath} not found in ${studio.manifest.id}`);
      }

      // Everything else (module transforms, HMR websocket, deps) → Vite.
      vite.middlewares(request, response, () => {
        notFound(response, `no route for ${url.pathname}`);
      });
    })().catch((error) => {
      console.error(`[studio-host] ${(error as Error)?.stack ?? String(error)}`);
      if (response.headersSent) return response.end();
      json(response, { error: "internal_error", detail: String(error) }, 500);
    });
  });

  server.listen(PORT, BIND, () => {
    console.log(`[studio-host] serving ${STUDIOS_DIR} at http://${BIND}:${PORT}`);
  });
}

void start();
