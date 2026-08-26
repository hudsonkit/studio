import {
  readStudioMachineRegistry,
  listResolvedStudios,
  resolveStudio,
} from "./registry";
import { StudioProcessSupervisor } from "./processes";
import type { StudioSupportPaths } from "./paths";
import { resolveStudioSupportPaths } from "./paths";
import {
  previewRoutesForStudios,
  registryToCaddyfileConfig,
  renderStudioLocalCaddyfile,
} from "./caddy";
import type { ResolvedStudio, StudioRuntimeStatus } from "./types";
import {
  STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT,
  STUDIO_LOCAL_PORTAL_HOST,
  studioLocalApiPaths,
} from "./urls";

interface StudioBunServer {
  port: number;
  hostname: string;
  stop(force?: boolean): void;
}

interface StudioBunGlobal {
  serve(options: {
    port: number;
    hostname?: string;
    fetch(request: Request): Response | Promise<Response>;
  }): StudioBunServer;
}

export interface StartStudioLocalServerOptions {
  port?: number;
  hostname?: string;
  paths?: StudioSupportPaths;
}

export interface StudioLocalServer {
  port: number;
  hostname: string;
  stop(): void;
}

interface RequestContext {
  paths: StudioSupportPaths;
  supervisor: StudioProcessSupervisor;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function text(body: string, contentType = "text/plain; charset=utf-8"): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

function routeId(pathname: string, suffix = ""): string | null {
  const prefix = "/api/studios/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (suffix && !rest.endsWith(suffix)) return null;
  const id = suffix ? rest.slice(0, -suffix.length) : rest;
  if (!id || id.includes("/")) return null;
  return decodeURIComponent(id);
}

async function resolveStudioById(
  id: string,
  paths: StudioSupportPaths,
): Promise<ResolvedStudio | null> {
  const registry = await readStudioMachineRegistry(paths);
  const entry = registry.studios.find((studio) => studio.id === id);
  return entry ? resolveStudio(entry) : null;
}

async function statusesFor(
  studios: readonly ResolvedStudio[],
  supervisor: StudioProcessSupervisor,
): Promise<StudioRuntimeStatus[]> {
  return Promise.all(studios.map((studio) => supervisor.status(studio)));
}

function renderLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111315;
      color: #f2f4f7;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #111315; }
    main { width: min(1040px, calc(100vw - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
    h2, h3 { margin: 0 0 8px; font-size: 17px; letter-spacing: 0; }
    p { margin: 0; color: #9aa4b2; line-height: 1.5; }
    a { color: #7dc4ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:focus-visible, button:focus-visible { outline: 2px solid #7dc4ff; outline-offset: 3px; }
    .grid { display: grid; gap: 10px; }
    .row {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) 118px 82px 210px;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      border: 1px solid #2c333b;
      border-radius: 8px;
      background: #171a1d;
    }
    .preview-row {
      position: relative;
      margin-left: 18px;
      border-color: #252c33;
      background: #131619;
    }
    .preview-row::before {
      content: "";
      position: absolute;
      left: -23px;
      top: 50%;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff7466;
      transform: translateY(-50%);
    }
    .preview-links { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
    .preview-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 34px;
      padding: 0 12px;
      border: 1px solid #3a424c;
      border-radius: 7px;
      background: #20252a;
      color: #f2f4f7;
      font-size: 13px;
      font-weight: 700;
    }
    .preview-link:hover { background: #292f35; text-decoration: none; }
    .meta { font-size: 12px; color: #7e8896; margin-top: 4px; }
    .pill { display: inline-flex; align-items: center; justify-content: center; min-height: 24px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .up { color: #98f3b1; background: rgba(61, 174, 95, 0.16); }
    .down { color: #f8c77e; background: rgba(233, 151, 54, 0.16); }
    .preview { color: #ffb1a9; background: rgba(255, 116, 102, 0.14); }
    button {
      min-height: 34px;
      border: 1px solid #3a424c;
      border-radius: 7px;
      background: #23282e;
      color: #f2f4f7;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    button:hover { background: #2b3138; }
    button:disabled { opacity: 0.55; cursor: progress; }
    code { color: #c6d3e1; }
    .empty { border: 1px dashed #38414b; border-radius: 8px; padding: 22px; }
    @media (max-width: 720px) {
      header { display: block; }
      .row { grid-template-columns: 1fr; }
      .preview-row { margin-left: 0; }
      .preview-row::before { display: none; }
      .preview-links { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function renderDashboardRows(statuses: readonly StudioRuntimeStatus[]): string {
  if (statuses.length === 0) {
    return `<div class="empty">
      <h2>No studios enabled</h2>
      <p>Run <code>bun run local enable /path/to/repo</code> after adding a project manifest.</p>
    </div>`;
  }

  return `<div class="grid">${statuses.map((status) => `
    <section class="row">
      <div>
        <h2><a href="${escapeHtml(status.url)}">${escapeHtml(status.label)}</a></h2>
        <div class="meta">${escapeHtml(status.repo)}</div>
      </div>
      <div><span class="pill ${status.running ? "up" : "down"}">${status.running ? "RUNNING" : "STOPPED"}</span></div>
      <div class="meta">:${status.port}</div>
      <button type="button" data-start="${escapeHtml(status.id)}" ${status.running ? "disabled" : ""}>${status.running ? "Running" : "Start"}</button>
    </section>
    ${status.previews.map((preview) => `
      <section class="row preview-row">
        <div>
          <h3>${escapeHtml(preview.label)}</h3>
          <div class="meta">${escapeHtml(preview.description ?? `Preview work hosted by ${status.label}`)}</div>
        </div>
        <div><span class="pill preview">PREVIEWS</span></div>
        <div class="meta">via ${escapeHtml(status.label)}</div>
        <nav class="preview-links" aria-label="${escapeHtml(`${preview.label} previews`)}">
          ${preview.links.map((link) => `<a class="preview-link" href="${escapeHtml(`http://${preview.host}${link.path}`)}">${escapeHtml(link.label)}</a>`).join("")}
        </nav>
      </section>`).join("")}
    `).join("")}</div>
    <script>
      for (const button of document.querySelectorAll('[data-start]')) {
        button.addEventListener('click', async () => {
          button.disabled = true;
          button.textContent = 'Starting';
          const id = button.getAttribute('data-start');
          await fetch('/api/studios/' + encodeURIComponent(id) + '/start', { method: 'POST' });
          window.location.reload();
        });
      }
    </script>`;
}

async function renderDashboard(ctx: RequestContext): Promise<Response> {
  const studios = await listResolvedStudios(ctx.paths);
  const statuses = await statusesFor(studios, ctx.supervisor);
  return html(renderLayout("Studio Local", `
    <header>
      <div>
        <h1>Studio Local</h1>
        <p>${escapeHtml(STUDIO_LOCAL_PORTAL_HOST)} is the machine registry for enabled Studio apps.</p>
      </div>
      <a href="${studioLocalApiPaths.caddyfile}">Caddyfile</a>
    </header>
    ${renderDashboardRows(statuses)}
  `));
}

function renderFallbackPage(studio: ResolvedStudio): string {
  const label = jsString(studio.label);
  return renderLayout(`Start ${studio.label}`, `
    <header>
      <div>
        <h1>Start ${escapeHtml(studio.label)}</h1>
        <p>${escapeHtml(studio.host)} is registered, but the app is not responding on port ${studio.port}.</p>
      </div>
    </header>
    <section class="empty">
      <p class="meta">${escapeHtml(studio.studioDir)}</p>
      <p class="meta"><code>${escapeHtml(studio.command)}</code></p>
      <div style="height: 16px"></div>
      <button id="start" type="button">Start Studio</button>
      <p id="status" class="meta" role="status" style="margin-top: 12px"></p>
    </section>
    <script>
      const button = document.getElementById('start');
      const status = document.getElementById('status');
      const targetPath = window.location.pathname + window.location.search + window.location.hash;
      async function waitForStudio() {
        const deadline = Date.now() + 25000;
        while (Date.now() < deadline) {
          try {
            const response = await fetch('${studioLocalApiPaths.hostStatus}', { cache: 'no-store' });
            if (response.ok) {
              const body = await response.json();
              if (body.running) {
                window.location.replace(targetPath || '/');
                return true;
              }
            }
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return false;
      }
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = 'Starting ' + ${label} + '...';
        try {
          const response = await fetch('${studioLocalApiPaths.hostStart}', { method: 'POST' });
          if (!response.ok) throw new Error('Start failed.');
          status.textContent = 'Waiting for the app...';
          const ready = await waitForStudio();
          if (!ready) {
            status.textContent = 'The app did not become ready yet.';
            button.disabled = false;
          }
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : String(error);
          button.disabled = false;
        }
      });
    </script>
  `);
}

async function handleRequest(
  request: Request,
  ctx: RequestContext,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === studioLocalApiPaths.health) {
    return json({ ok: true });
  }

  if (url.pathname === "/" && request.method === "GET") {
    return renderDashboard(ctx);
  }

  if (url.pathname === studioLocalApiPaths.caddyfile && request.method === "GET") {
    const registry = await readStudioMachineRegistry(ctx.paths);
    const studios = await listResolvedStudios(ctx.paths);
    const caddyfile = renderStudioLocalCaddyfile({
      ...registryToCaddyfileConfig(registry),
      previews: previewRoutesForStudios(studios),
    });
    return text(caddyfile, "text/caddyfile; charset=utf-8");
  }

  if (url.pathname === studioLocalApiPaths.studios && request.method === "GET") {
    const studios = await listResolvedStudios(ctx.paths);
    return json(await statusesFor(studios, ctx.supervisor));
  }

  const startId = routeId(url.pathname, "/start");
  if (startId && request.method === "POST") {
    const studio = await resolveStudioById(startId, ctx.paths);
    if (!studio) return json({ error: "Unknown studio" }, 404);
    return json(await ctx.supervisor.start(studio));
  }

  const stopId = routeId(url.pathname, "/stop");
  if (stopId && request.method === "POST") {
    ctx.supervisor.stop(stopId);
    return json({ ok: true });
  }

  const studioId = routeId(url.pathname);
  if (studioId && request.method === "GET") {
    const studio = await resolveStudioById(studioId, ctx.paths);
    if (!studio) return json({ error: "Unknown studio" }, 404);
    return json(await ctx.supervisor.status(studio));
  }

  const fallbackPrefix = "/__studio/fallback/";
  if (url.pathname.startsWith(fallbackPrefix) && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.slice(fallbackPrefix.length));
    const studio = await resolveStudioById(id, ctx.paths);
    if (!studio) return html(renderLayout("Unknown Studio", "<h1>Unknown Studio</h1>"), 404);
    return html(renderFallbackPage(studio));
  }

  return html(renderLayout("Not Found", "<h1>Not Found</h1>"), 404);
}

export function startStudioLocalServer(
  options: StartStudioLocalServerOptions = {},
): StudioLocalServer {
  const bun = (globalThis as { Bun?: StudioBunGlobal }).Bun;
  if (!bun) {
    throw new Error("Studio local server must run under Bun.");
  }
  const paths = options.paths ?? resolveStudioSupportPaths();
  const supervisor = new StudioProcessSupervisor({ paths });
  const server = bun.serve({
    port: options.port ?? STUDIO_LOCAL_DEFAULT_SUPERVISOR_PORT,
    hostname: options.hostname ?? "127.0.0.1",
    fetch: (request) =>
      handleRequest(request, { paths, supervisor }).catch((error) =>
        json({ error: error instanceof Error ? error.message : String(error) }, 500),
      ),
  });

  return {
    port: server.port,
    hostname: server.hostname,
    stop() {
      supervisor.dispose();
      server.stop(true);
    },
  };
}
