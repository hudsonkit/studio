/**
 * Minimal HTML dashboard so Flow is visibly "running" in a browser.
 */

import * as store from "./store";
import { DEFAULT_STUDIO_BASE, studioPageUrl } from "./http-api";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function browseHtml(opts: {
  host: string;
  port: number;
}): Promise<Response> {
  const base = `http://${opts.host}:${opts.port}`;
  const files = await store.listFiles();

  const cards: string[] = [];
  for (const f of files) {
    let body = "";
    try {
      const file = await store.loadFile(f.id);
      const journeys = file.journeys
        .map((j) => {
          const pages = j.pageIds
            .map((id) => file.pages.find((p) => p.id === id))
            .filter(Boolean)
            .map((p) => {
              const studio = studioPageUrl(file.id, p!.id);
              return `<a class="page" href="${esc(studio)}" target="_blank" rel="noreferrer">${esc(p!.name)}</a>`;
            })
            .join("");
          return `<div class="journey"><div class="jname">${esc(j.name)}</div><div class="pages">${pages || "<span class='muted'>no pages</span>"}</div></div>`;
        })
        .join("");
      body = journeys || `<p class="muted">No journeys yet.</p>`;
    } catch {
      body = `<p class="muted">Could not load file.</p>`;
    }

    cards.push(`
      <article class="card">
        <header>
          <h2>${esc(f.name)}</h2>
          <div class="meta mono">${esc(f.id)} · ${f.pageCount} pages · <a href="${base}/api/files/${esc(f.id)}">JSON</a></div>
        </header>
        ${body}
        <footer>
          <a class="btn" href="${esc(DEFAULT_STUDIO_BASE)}/flows?file=${encodeURIComponent(f.id)}" target="_blank" rel="noreferrer">Open in Studio Flows</a>
        </footer>
      </article>
    `);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Studio Flows</title>
  <style>
    :root {
      --room: #ece9e2;
      --raised: #f8f6f1;
      --ink: #211f1c;
      --soft: #5b5952;
      --faint: #8c897f;
      --edge: rgba(33,31,28,0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--room);
      color: var(--ink);
      min-height: 100vh;
    }
    header.top {
      background: var(--raised);
      border-bottom: 1px solid var(--edge);
      padding: 20px 28px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
    .sub { margin-top: 4px; color: var(--soft); font-size: 13px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--faint); }
    .status {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 10px; border-radius: 999px;
      background: rgba(63,143,107,0.12); color: #2f6b50; font-size: 12px; font-weight: 600;
    }
    .status i { width: 8px; height: 8px; border-radius: 99px; background: #3f8f6b; display: inline-block; }
    main { padding: 28px; max-width: 1100px; margin: 0 auto; display: grid; gap: 18px; }
    .card {
      background: var(--raised);
      border: 1px solid var(--edge);
      border-radius: 12px;
      padding: 18px 20px;
    }
    .card h2 { margin: 0; font-size: 16px; }
    .card .meta { margin-top: 4px; }
    .card .meta a { color: var(--soft); }
    .journey { margin-top: 14px; }
    .jname {
      font-family: ui-monospace, Menlo, monospace;
      font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
      color: var(--faint); margin-bottom: 6px;
    }
    .pages { display: flex; flex-wrap: wrap; gap: 8px; }
    a.page {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid var(--edge);
      background: var(--room);
      color: var(--ink);
      text-decoration: none;
      font-size: 13px;
    }
    a.page:hover { border-color: rgba(33,31,28,0.28); }
    footer { margin-top: 16px; }
    .btn {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 8px;
      background: var(--ink);
      color: var(--raised);
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
    }
    .muted { color: var(--faint); font-size: 13px; }
    .empty {
      border: 1px dashed var(--edge);
      border-radius: 12px;
      padding: 32px;
      text-align: center;
      color: var(--soft);
      background: var(--raised);
    }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 12px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <header class="top">
    <div>
      <h1>Studio Flows</h1>
      <div class="sub">Agent journey layout · maps on disk · pages open in Studio</div>
      <div class="mono" style="margin-top:8px">${esc(base)} · MCP ${esc(base)}/mcp · API ${esc(base)}/api</div>
    </div>
    <div class="status"><i></i> Running on :${opts.port}</div>
  </header>
  <main>
    ${
      cards.length
        ? cards.join("\n")
        : `<div class="empty">
            <p>No flow files yet.</p>
            <p>From an agent: <code>create_product_map { pack: "product-core" }</code></p>
          </div>`
    }
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
