/**
 * Minimal Streamable HTTP MCP server + REST API for Studio handoff.
 * Bind localhost only. No auth beyond loopback.
 */

import { getOrCreateSession } from "./session";
import { TOOL_DEFS, callTool, setServerContext } from "./tools";
import { DEFAULT_HOST, DEFAULT_PORT } from "../model";
import { handleHttpApi, jsonResponse } from "./http-api";
import { browseHtml } from "./browse";

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

function sseMessage(payload: unknown): Response {
  const data = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function newSessionId(): string {
  return crypto.randomUUID();
}

export type ServeOptions = {
  host?: string;
  port?: number;
};

export function startServer(opts: ServeOptions = {}) {
  const host = opts.host ?? process.env.STUDIO_FLOWS_HOST ?? DEFAULT_HOST;
  const port = Number(opts.port ?? process.env.STUDIO_FLOWS_PORT ?? DEFAULT_PORT);
  // When UI proxies through a public port, handoff URLs use that (not the internal API port).
  const publicPort = Number(
    process.env.STUDIO_FLOWS_PUBLIC_PORT ?? process.env.STUDIO_FLOWS_PORT ?? port,
  );

  setServerContext({ host, port: publicPort });

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/health") {
        return jsonResponse({
          ok: true,
          name: "studio-flows",
          port,
          publicPort,
          mcp: `http://${host}:${publicPort}/mcp`,
          api: `http://${host}:${publicPort}/api`,
          ui: `http://${host}:${publicPort}/`,
        });
      }

      if (req.method === "GET" && url.pathname === "/browse") {
        return browseHtml({ host: host, port: publicPort });
      }

      if (req.method === "GET" && url.pathname === "/") {
        return jsonResponse({
          ok: true,
          name: "studio-flows",
          hint: "Open the Studio /flows route for the canvas UI.",
          port,
          publicPort,
          mcp: `http://${host}:${publicPort}/mcp`,
          api: `http://${host}:${publicPort}/api`,
          ui: `http://${host}:${publicPort}/`,
        });
      }

      const apiRes = await handleHttpApi(req, url, { host, port });
      if (apiRes) return apiRes;

      if (url.pathname !== "/mcp") {
        return new Response("Not found", { status: 404 });
      }

      if (req.method === "GET") {
        return json({
          name: "studio-flows",
          transport: "streamable-http",
          hint: "POST JSON-RPC to this path; REST at /api/*",
        });
      }

      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      let body: JsonRpc;
      try {
        body = (await req.json()) as JsonRpc;
      } catch {
        return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }, 400);
      }

      let sessionId = req.headers.get("mcp-session-id") ?? req.headers.get("Mcp-Session-Id");
      if (!sessionId) sessionId = newSessionId();
      getOrCreateSession(sessionId);

      const method = body.method ?? "";
      const id = body.id ?? null;

      if (method.startsWith("notifications/")) {
        return new Response(null, {
          status: 202,
          headers: { "Mcp-Session-Id": sessionId },
        });
      }

      if (method === "initialize") {
        const result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "studio-flows", version: "0.1.0" },
          instructions:
            "Studio Flows is an agent-driven design tool for whole user journeys — multi-screen product flows on one canvas, each page a tree of Hudson primitives + props. " +
            "FASTEST: create_product_map({ pack: 'product-core' }) — entire product map in one call. " +
            "Then open_in_studio({ pageId }) to bring a single page into Studio for focused work. " +
            "Also: list_packs · create_journey · layout_journeys · scaffold_page · upsert_node · export_page. " +
            "Glance: left→right = time, top→bottom = role/journey. Studio: deep-work on one page. " +
            "Primitives: Stack, Box, Text, Spacer, HudButton, HudBadge, HudInput, HudTextarea, HudPanelSection, HudListItem, HudCheckbox, HudToolbar. " +
            "Not a design app — no pen/HTML soup. Local MCP, no quota. Library: ~/.studio/flows.",
        };
        const res = sseMessage({ jsonrpc: "2.0", id, result });
        res.headers.set("Mcp-Session-Id", sessionId);
        return res;
      }

      if (method === "tools/list" || method === "tools/listChanged") {
        const result = {
          tools: TOOL_DEFS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        };
        const res = sseMessage({ jsonrpc: "2.0", id, result });
        res.headers.set("Mcp-Session-Id", sessionId);
        return res;
      }

      if (method === "tools/call") {
        const params = body.params ?? {};
        const name = String(params.name ?? "");
        const args =
          params.arguments && typeof params.arguments === "object"
            ? (params.arguments as Record<string, unknown>)
            : {};
        const toolResult = await callTool(sessionId, name, args);
        const result = {
          content: toolResult.content,
          isError: toolResult.isError ?? false,
        };
        const res = sseMessage({ jsonrpc: "2.0", id, result });
        res.headers.set("Mcp-Session-Id", sessionId);
        return res;
      }

      if (method === "ping") {
        const res = sseMessage({ jsonrpc: "2.0", id, result: {} });
        res.headers.set("Mcp-Session-Id", sessionId);
        return res;
      }

      const res = sseMessage({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
      res.headers.set("Mcp-Session-Id", sessionId);
      return res;
    },
  });

  return {
    host,
    port,
    url: `http://${host}:${port}/mcp`,
    apiUrl: `http://${host}:${port}/api`,
    stop: () => server.stop(true),
  };
}
