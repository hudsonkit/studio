/**
 * REST surface for Studio (and other hosts) to load Flow files/pages.
 * Local-only; CORS open for localhost Studio.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import * as store from "./store";
import type { FlowFile, FlowPage, FlowTokens } from "../model";

export const DEFAULT_STUDIO_BASE =
  process.env.STUDIO_FLOWS_STUDIO_URL?.trim() || "http://localhost:3033";

export type StudioHandoff = {
  version: 1;
  createdAt: string;
  fileId: string;
  fileName: string;
  journeyId: string | null;
  journeyName: string | null;
  page: FlowPage;
  tokens: FlowTokens;
  studioUrl: string;
  flowApiUrl: string;
  handoffId: string;
};

function handoffsRoot(): string {
  return (
    process.env.STUDIO_FLOWS_HANDOFFS?.trim() ||
    join(homedir(), ".studio", "flows", "handoffs")
  );
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function flowBase(port: number, host: string): string {
  return `http://${host}:${port}`;
}

export function studioPageUrl(
  fileId: string,
  pageId: string,
  studioBase = DEFAULT_STUDIO_BASE,
): string {
  const base = studioBase.replace(/\/$/, "");
  return `${base}/flows?file=${encodeURIComponent(fileId)}&page=${encodeURIComponent(pageId)}`;
}

export function flowPageApiUrl(
  fileId: string,
  pageId: string,
  port: number,
  host: string,
): string {
  return `${flowBase(port, host)}/api/files/${encodeURIComponent(fileId)}/pages/${encodeURIComponent(pageId)}`;
}

export async function ensureHandoffs(): Promise<void> {
  await mkdir(handoffsRoot(), { recursive: true });
}

export async function writeHandoff(
  file: FlowFile,
  page: FlowPage,
  opts: { port: number; host: string; studioBase?: string },
): Promise<StudioHandoff> {
  await ensureHandoffs();
  const journey = file.journeys.find((j) => j.id === page.journeyId);
  const studioBase = opts.studioBase ?? DEFAULT_STUDIO_BASE;
  const handoffId = `${file.id}__${page.id}`;
  const handoff: StudioHandoff = {
    version: 1,
    createdAt: new Date().toISOString(),
    fileId: file.id,
    fileName: file.name,
    journeyId: journey?.id ?? page.journeyId ?? null,
    journeyName: journey?.name ?? null,
    page,
    tokens: file.tokens,
    studioUrl: studioPageUrl(file.id, page.id, studioBase),
    flowApiUrl: flowPageApiUrl(file.id, page.id, opts.port, opts.host),
    handoffId,
  };
  const path = join(handoffsRoot(), `${handoffId}.json`);
  await writeFile(path, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
  return handoff;
}

export async function loadHandoff(handoffId: string): Promise<StudioHandoff | null> {
  try {
    const raw = await readFile(join(handoffsRoot(), `${handoffId}.json`), "utf8");
    return JSON.parse(raw) as StudioHandoff;
  } catch {
    return null;
  }
}

function fileSummary(file: FlowFile) {
  return {
    id: file.id,
    name: file.name,
    pageCount: file.pages.length,
    journeyCount: file.journeys.length,
    updatedAt: file.updatedAt,
    journeys: file.journeys.map((j) => ({
      id: j.id,
      name: j.name,
      y: j.y,
      pages: j.pageIds
        .map((id) => file.pages.find((p) => p.id === id))
        .filter(Boolean)
        .map((p) => ({
          id: p!.id,
          name: p!.name,
          width: p!.width,
          height: p!.height,
          worldX: p!.x,
          worldY: p!.y,
        })),
    })),
    pages: file.pages.map((p) => ({
      id: p.id,
      name: p.name,
      journeyId: p.journeyId ?? null,
      width: p.width,
      height: p.height,
      worldX: p.x,
      worldY: p.y,
    })),
  };
}

/** Payload for Studio HudsonKit canvas: every page tree + world placement. */
function canvasPayload(file: FlowFile) {
  const byId = new Map(file.pages.map((p) => [p.id, p]));
  const pages = file.pages.map((p) => {
    const journey = file.journeys.find((j) => j.id === p.journeyId);
    return {
      id: p.id,
      name: p.name,
      journeyId: journey?.id ?? p.journeyId ?? null,
      journeyName: journey?.name ?? null,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      root: p.root,
    };
  });
  const journeys = file.journeys.map((j) => ({
    id: j.id,
    name: j.name,
    y: j.y,
    pageIds: j.pageIds,
    pages: j.pageIds.map((id) => byId.get(id)).filter(Boolean).map((p) => p!.id),
  }));
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  if (pages.length) {
    minX = Math.min(...pages.map((p) => p.x));
    minY = Math.min(...pages.map((p) => p.y));
    maxX = Math.max(...pages.map((p) => p.x + p.width));
    maxY = Math.max(...pages.map((p) => p.y + p.height));
  }
  return {
    fileId: file.id,
    fileName: file.name,
    tokens: file.tokens,
    journeys,
    pages,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    },
    updatedAt: file.updatedAt,
  };
}

function pagePayload(file: FlowFile, page: FlowPage) {
  const journey = file.journeys.find((j) => j.id === page.journeyId);
  return {
    fileId: file.id,
    fileName: file.name,
    journeyId: journey?.id ?? page.journeyId ?? null,
    journeyName: journey?.name ?? null,
    tokens: file.tokens,
    page,
    studioUrl: studioPageUrl(file.id, page.id),
  };
}

/** Handle non-MCP REST under /api/* and /view/* */
export async function handleHttpApi(
  req: Request,
  url: URL,
  opts: { host: string; port: number },
): Promise<Response | null> {
  if (req.method === "OPTIONS" && (url.pathname.startsWith("/api/") || url.pathname === "/api")) {
    return optionsResponse();
  }

  // Quick agent feedback on a map selection (Scout → Claude harness)
  if (req.method === "POST" && url.pathname === "/api/discuss") {
    try {
      const body = (await req.json()) as {
        message?: string;
        context?: string;
        includeContext?: boolean;
        ref?: string | null;
        projectRoot?: string | null;
        projectName?: string | null;
      };
      const { runDiscuss } = await import("./discuss");
      const result = await runDiscuss({
        message: String(body.message ?? ""),
        context: body.context != null ? String(body.context) : undefined,
        includeContext: body.includeContext !== false,
        ref: body.ref ?? null,
        projectRoot: body.projectRoot ?? null,
        projectName: body.projectName ?? null,
      });
      return jsonResponse(result, result.ok ? 200 : 502);
    } catch (e) {
      return jsonResponse(
        {
          ok: false,
          error: e instanceof Error ? e.message : "discuss failed",
        },
        500,
      );
    }
  }

  if (req.method !== "GET") return null;

  if (url.pathname === "/api" || url.pathname === "/api/") {
    return jsonResponse({
      ok: true,
      name: "studio-flows-api",
      endpoints: [
        "GET /api/files",
        "GET /api/files/:fileId",
        "GET /api/files/:fileId/canvas",
        "GET /api/files/:fileId/pages/:pageId",
        "GET /api/handoffs",
        "GET /api/handoffs/:handoffId",
        "POST /api/discuss",
      ],
      studio: DEFAULT_STUDIO_BASE,
    });
  }

  if (url.pathname === "/api/files") {
    const files = await store.listFiles();
    return jsonResponse({ files, count: files.length });
  }

  const fileMatch = url.pathname.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch) {
    try {
      const file = await store.loadFile(decodeURIComponent(fileMatch[1]!));
      return jsonResponse(fileSummary(file));
    } catch {
      return jsonResponse({ error: "file not found" }, 404);
    }
  }

  /** Full map for HudsonKit canvas host — trees + world positions. */
  const canvasMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/canvas$/);
  if (canvasMatch) {
    try {
      const file = await store.loadFile(decodeURIComponent(canvasMatch[1]!));
      return jsonResponse(canvasPayload(file));
    } catch {
      return jsonResponse({ error: "file not found" }, 404);
    }
  }

  const pageMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/pages\/([^/]+)$/);
  if (pageMatch) {
    try {
      const file = await store.loadFile(decodeURIComponent(pageMatch[1]!));
      const page = file.pages.find((p) => p.id === decodeURIComponent(pageMatch[2]!));
      if (!page) return jsonResponse({ error: "page not found" }, 404);
      return jsonResponse(pagePayload(file, page));
    } catch {
      return jsonResponse({ error: "file not found" }, 404);
    }
  }

  if (url.pathname === "/api/handoffs") {
    await ensureHandoffs();
    const names = await readdir(handoffsRoot());
    const handoffs: StudioHandoff[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(handoffsRoot(), name), "utf8");
        handoffs.push(JSON.parse(raw) as StudioHandoff);
      } catch {
        // skip
      }
    }
    handoffs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return jsonResponse({ handoffs, count: handoffs.length });
  }

  const handoffMatch = url.pathname.match(/^\/api\/handoffs\/([^/]+)$/);
  if (handoffMatch) {
    const handoff = await loadHandoff(decodeURIComponent(handoffMatch[1]!));
    if (!handoff) return jsonResponse({ error: "handoff not found" }, 404);
    return jsonResponse(handoff);
  }

  // Lightweight redirect helpers for agents / CLI
  const viewPage = url.pathname.match(/^\/view\/([^/]+)\/([^/]+)$/);
  if (viewPage) {
    const fileId = decodeURIComponent(viewPage[1]!);
    const pageId = decodeURIComponent(viewPage[2]!);
    const studio = studioPageUrl(fileId, pageId);
    return new Response(null, {
      status: 302,
      headers: {
        Location: studio,
        ...corsHeaders(),
      },
    });
  }

  const viewFile = url.pathname.match(/^\/view\/([^/]+)$/);
  if (viewFile) {
    const fileId = decodeURIComponent(viewFile[1]!);
    const studio = `${DEFAULT_STUDIO_BASE.replace(/\/$/, "")}/flows?file=${encodeURIComponent(fileId)}`;
    return new Response(null, {
      status: 302,
      headers: { Location: studio, ...corsHeaders() },
    });
  }

  return null;
}
