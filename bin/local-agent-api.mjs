import { randomUUID } from "node:crypto";
import { StudioArtifactSync } from "./local-artifacts.mjs";
import { foldFeedback, FeedbackError, pageAttention, StudioFeedbackStore } from "./local-feedback.mjs";
import { pagePresence, StudioPresence } from "./local-presence.mjs";

/**
 * The Studio MCP and the page-side feedback API, served by the host daemon.
 *
 *   POST /mcp                         Streamable HTTP MCP for coding agents
 *   GET  /__studio/api/pages          agent pages in a studio
 *   GET  /__studio/api/pages/:slug    one page with its body and feedback threads
 *   POST /__studio/api/pages/:slug/feedback               reviewer feedback
 *   POST /__studio/api/pages/:slug/feedback/:id/resolve   resolve or reopen
 *   GET  /__studio/api/events         SSE: feedback and page changes
 *
 * Through the proxy (`<repo>.studio.local`) the studio comes from the Host
 * header. On the loopback MCP port it comes from `?studio=`.
 */

export const DEFAULT_MCP_PORT = 43_148;
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const STUDIO_API_PREFIX = "/__studio/api";
export const STUDIO_MCP_PATH = "/mcp";

const MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_WAIT_SECONDS = 50;
const MAX_WAIT_SECONDS = 300;
const SSE_KEEPALIVE_MS = 20_000;

const MCP_INSTRUCTIONS = [
  "Studio MCP: publish pages into a local Studio and collect feedback from the people reviewing them.",
  "Loop: create_page → share the returned url → wait_for_feedback → reply / update_page / resolve_feedback → wait again.",
  "Pages are markdown plus widgets: comments (threaded, on by default), chat, and small forms you define.",
  "Use ask to put a question in front of the reviewer, with optional choices.",
  "wait_for_feedback remembers your cursor per session, so calling it again only returns new feedback.",
  "Reviewers sign their feedback with a name. Your replies are shown under the agent name you give create_page.",
  "Studies can be mirrored as Claude artifacts: artifact_sync_plan returns the publish, comment-import and reply steps to run with your Artifact tools.",
  "Outside MCP, ~/.studio/studio.json describes this server and ~/.studio/inventory.json lists every space and page.",
].join(" ");

const studioProperty = {
  studio: {
    type: "string",
    description: "Studio id (see list_studios). Optional when only one studio is known.",
  },
};

const widgetSchema = {
  type: "array",
  description: "Feedback widgets shown with the page. Defaults to [{kind:'comments'}].",
  items: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["comments", "chat", "form"] },
      id: { type: "string", description: "Stable id, lowercase with dashes. Needed to read form responses back." },
      title: { type: "string", description: "Form heading." },
      fields: {
        type: "array",
        description: "Form fields (kind: form only).",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            label: { type: "string" },
            type: { type: "string", enum: ["text", "textarea", "choice", "rating", "boolean"] },
            options: { type: "array", items: { type: "string" }, description: "For choice fields." },
            max: { type: "number", description: "For rating fields (2-10, default 5)." },
            required: { type: "boolean" },
          },
          required: ["name"],
        },
      },
    },
    required: ["kind"],
  },
};

export const STUDIO_MCP_TOOLS = [
  {
    name: "list_studios",
    description: "List the studios this machine knows about, with their URLs and whether their dev server is running.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_page",
    description: "Publish a new agent page (markdown + feedback widgets) into a studio. Returns the page URL to share with the reviewer.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        title: { type: "string" },
        slug: { type: "string", description: "URL slug. Defaults to a slug of the title." },
        body: { type: "string", description: "Markdown body." },
        blurb: { type: "string", description: "One-line summary shown in the nav and header." },
        widgets: widgetSchema,
        agent: { type: "string", description: "Your name as reviewers will see it, e.g. your Scout handle." },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "update_page",
    description: "Change an agent page's body, title, widgets or status. Reviewers see the new revision live.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slug: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        blurb: { type: "string" },
        widgets: widgetSchema,
        status: { type: "string", enum: ["draft", "review", "done", "archived"] },
        note: { type: "string", description: "Short change note shown to reviewers." },
      },
      required: ["slug"],
    },
  },
  {
    name: "list_pages",
    description: "List agent pages in a studio.",
    inputSchema: {
      type: "object",
      properties: { ...studioProperty, include_archived: { type: "boolean" } },
    },
  },
  {
    name: "get_page",
    description: "Read an agent page: metadata, markdown body and all feedback threads.",
    inputSchema: {
      type: "object",
      properties: { ...studioProperty, slug: { type: "string" } },
      required: ["slug"],
    },
  },
  {
    name: "wait_for_feedback",
    description: "Wait until a reviewer leaves feedback (comment, chat, form response or answer), then return it. Returns early as soon as something arrives.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slugs: { type: "array", items: { type: "string" }, description: "Only these pages. Defaults to all." },
        since: { type: "number", description: "Cursor from a previous call. Defaults to this session's cursor." },
        timeout_seconds: { type: "number", description: `Default ${DEFAULT_WAIT_SECONDS}, max ${MAX_WAIT_SECONDS}.` },
      },
    },
  },
  {
    name: "list_feedback",
    description: "List feedback threads on pages without waiting.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slugs: { type: "array", items: { type: "string" } },
        open_only: { type: "boolean", description: "Only threads that are not resolved." },
      },
    },
  },
  {
    name: "reply",
    description: "Answer a feedback item (pass feedback_id) or post a chat message on the page (omit it).",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slug: { type: "string" },
        body: { type: "string" },
        feedback_id: { type: "string" },
      },
      required: ["slug", "body"],
    },
  },
  {
    name: "ask",
    description: "Put a question in front of the reviewer on the page, optionally with choices. Their answer arrives through wait_for_feedback.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slug: { type: "string" },
        question: { type: "string" },
        choices: { type: "array", items: { type: "string" } },
      },
      required: ["slug", "question"],
    },
  },
  {
    name: "resolve_feedback",
    description: "Mark a feedback item resolved (or reopen it with resolved: false).",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        slug: { type: "string" },
        feedback_id: { type: "string" },
        resolved: { type: "boolean" },
      },
      required: ["slug", "feedback_id"],
    },
  },
  {
    name: "artifact_sync_plan",
    description: "Plan the sync between built Studio studies and their Claude artifacts: what to publish or republish, which comments to import, which Studio replies to post back. Run `bun src/artifacts/cli.ts build --all` in the studio repo first. Execute the plan with the Artifact and ArtifactComments tools.",
    inputSchema: { type: "object", properties: { ...studioProperty } },
  },
  {
    name: "artifact_link",
    description: "Record that a study was published as a Claude artifact. Creates the study's feedback page on first link.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        study: { type: "string" },
        url: { type: "string", description: "The claude.ai artifact url." },
        source_hash: { type: "string", description: "source_hash from the plan for the build you published." },
      },
      required: ["study", "url"],
    },
  },
  {
    name: "artifact_import_comments",
    description: "Copy artifact comments into Studio feedback on the study. Pass every comment ArtifactComments read returned; ones already imported, and Claude's own replies, are skipped.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        study: { type: "string" },
        comments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              thread_id: { type: "string" },
              comment_id: { type: "string", description: "Stable comment id when the read shows one." },
              author: { type: "string" },
              body: { type: "string" },
              from_claude: { type: "boolean", description: "True for replies posted by Claude." },
            },
            required: ["thread_id", "body"],
          },
        },
      },
      required: ["study", "comments"],
    },
  },
  {
    name: "artifact_mark_mirrored",
    description: "Record that a Studio reply from the plan's outbound list was posted to its artifact thread.",
    inputSchema: {
      type: "object",
      properties: {
        ...studioProperty,
        study: { type: "string" },
        event_id: { type: "string" },
        thread_id: { type: "string" },
        text: { type: "string", description: "The text you posted, so it isn't imported back." },
      },
      required: ["study", "event_id", "thread_id"],
    },
  },
];

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

function sendSseMessage(response, payload, headers = {}) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    ...headers,
  });
  response.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) throw new RequestError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Request body must be valid JSON.");
  }
}

function hostName(header) {
  if (!header) return "";
  return header.startsWith("[") ? header.slice(1, header.indexOf("]")) : header.split(":")[0].toLowerCase();
}

/** Loopback names and Studio hostnames. Anything else is a rebinding attempt. */
export function isTrustedHost(header) {
  const name = hostName(header);
  return name === "127.0.0.1" || name === "localhost" || name === "::1"
    || name === "studio.local" || name.endsWith(".studio.local");
}

function isTrustedOrigin(origin) {
  if (!origin) return true;
  try {
    return isTrustedHost(new URL(origin).host);
  } catch {
    return false;
  }
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  if (!origin || !isTrustedOrigin(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-expose-headers": "mcp-session-id",
    vary: "origin",
  };
}

function textResult(value, isError = false) {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
    isError,
  };
}

/**
 * @param {object} options
 * @param {() => Array<{id: string, repoRoot: string, hostname: string, url: string, live: boolean}>} options.listStudios
 * @param {(message: string) => void} [options.log]
 * @param {(studioId: string) => void} [options.onChange]  Any page or feedback write.
 */
export function createStudioAgentService({ listStudios, log = () => {}, onChange = () => {} }) {
  const stores = new Map();
  const sessions = new Map();
  const presence = new StudioPresence();

  function storeFor(studio) {
    const existing = stores.get(studio.id);
    if (existing && existing.repoRoot === studio.repoRoot) return existing;
    const store = new StudioFeedbackStore({ studioId: studio.id, repoRoot: studio.repoRoot });
    store.emitter.on("event", () => onChange(studio.id));
    store.emitter.on("pages", () => onChange(studio.id));
    stores.set(studio.id, store);
    return store;
  }

  /** Every page in a studio (archived included) with its open/total reviewer feedback. */
  async function summarizePages(studio) {
    const store = storeFor(studio);
    const pages = await store.listPages({ includeArchived: true });
    return Promise.all(pages.map(async (page) => {
      const threads = foldFeedback(await store.listEvents(page.slug));
      const reviewerItems = threads.filter((thread) => thread.status);
      return {
        slug: page.slug,
        title: page.title,
        status: page.status,
        href: page.href,
        owner: page.owner,
        revision: page.revision,
        updatedAt: page.updatedAt,
        widgets: (page.widgets ?? []).map((widget) => widget.kind),
        feedback: {
          open: reviewerItems.filter((thread) => thread.status === "open").length,
          total: reviewerItems.length,
        },
      };
    }));
  }

  function resolveStudio(id) {
    const studios = listStudios();
    if (id) {
      const studio = studios.find((candidate) => candidate.id === id);
      if (!studio) {
        throw new FeedbackError(404, `Unknown studio "${id}". Known: ${studios.map((s) => s.id).join(", ") || "none"}.`);
      }
      return studio;
    }
    if (studios.length === 1) return studios[0];
    const live = studios.filter((studio) => studio.live);
    if (live.length === 1) return live[0];
    throw new FeedbackError(
      400,
      studios.length === 0
        ? "No studios are known yet. Run `studio dev` in a repo first."
        : `Several studios are known; pass studio. Known: ${studios.map((s) => s.id).join(", ")}.`,
    );
  }

  function pageUrl(studio, page) {
    return `${studio.url.replace(/\/$/, "")}${page.href}`;
  }

  function session(sessionId) {
    let value = sessions.get(sessionId);
    if (!value) {
      value = { id: sessionId, client: undefined, cursors: new Map(), createdAt: Date.now() };
      sessions.set(sessionId, value);
    }
    return value;
  }

  async function callTool(sessionState, name, args, signal) {
    if (name === "list_studios") {
      return { studios: listStudios().map(({ id, url, live, repoRoot }) => ({ id, url, live, repoRoot })) };
    }
    const studio = resolveStudio(args.studio);
    const store = storeFor(studio);
    presence.touch(sessionState.id, studio.id, {
      name: name === "create_page" ? args.agent : undefined,
      client: sessionState.client?.name,
    });
    // A session that picks up an existing page (after an agent restart, say) speaks as its owner.
    if (typeof args.slug === "string" && !presence.named(sessionState.id, studio.id)) {
      const owner = await store.readPage(args.slug).then((page) => page.owner?.name, () => undefined);
      if (owner) presence.touch(sessionState.id, studio.id, { name: owner });
    }

    if (name === "create_page") {
      const agentName = args.agent || sessionState.client?.name || "agent";
      const page = await store.createPage(args, {
        name: agentName,
        client: sessionState.client?.name,
        session: sessionState.id,
      });
      log(`agent page created: ${studio.id}/${page.slug} by ${agentName}`);
      return {
        url: pageUrl(studio, page),
        page: { slug: page.slug, title: page.title, revision: page.revision, widgets: page.widgets },
        next: "Share the url, then call wait_for_feedback.",
      };
    }
    if (name === "update_page") {
      const page = await store.updatePage(args.slug, args);
      return { url: pageUrl(studio, page), slug: page.slug, revision: page.revision, status: page.status };
    }
    if (name === "list_pages") {
      const pages = await store.listPages({ includeArchived: Boolean(args.include_archived) });
      return {
        pages: pages.map((page) => ({
          slug: page.slug,
          title: page.title,
          status: page.status,
          owner: page.owner?.name,
          revision: page.revision,
          updatedAt: page.updatedAt,
          url: pageUrl(studio, page),
        })),
      };
    }
    if (name === "get_page") {
      const page = await store.readPage(args.slug, { withBody: true });
      return { url: pageUrl(studio, page), page, threads: foldFeedback(await store.listEvents(args.slug)) };
    }
    if (name === "wait_for_feedback") {
      const sessionCursor = sessionState.cursors.get(studio.id);
      const since = Number.isFinite(args.since) ? args.since : sessionCursor ?? 0;
      // A session's first wait picks up the open backlog, not the page's whole history.
      const skipResolved = !Number.isFinite(args.since) && sessionCursor === undefined;
      const seconds = Math.min(Math.max(Number(args.timeout_seconds) || DEFAULT_WAIT_SECONDS, 1), MAX_WAIT_SECONDS);
      const done = presence.listen(sessionState.id, studio.id, args.slugs);
      let events;
      let timedOut;
      try {
        ({ events, timedOut } = await store.waitForReviewerEvents({
          slugs: args.slugs,
          since,
          timeoutMs: seconds * 1000,
          signal,
          skipResolved,
        }));
      } finally {
        done({ timedOut: timedOut ?? signal?.aborted ?? false });
      }
      const cursor = events.reduce((max, event) => Math.max(max, event.seq), since);
      sessionState.cursors.set(studio.id, cursor);
      return {
        cursor,
        timedOut,
        events,
        hint: timedOut ? "No feedback yet. Call wait_for_feedback again to keep listening." : undefined,
      };
    }
    if (name === "list_feedback") {
      const slugs = args.slugs?.length ? args.slugs : (await store.listPages()).map((page) => page.slug);
      const threads = {};
      for (const slug of slugs) {
        const folded = foldFeedback(await store.listEvents(slug));
        threads[slug] = args.open_only ? folded.filter((thread) => thread.status === "open") : folded;
      }
      return { threads };
    }
    if (name === "reply") {
      const page = await store.readPage(args.slug);
      const event = await store.addAgentEvent(args.slug, {
        kind: args.feedback_id ? "reply" : "chat",
        parentId: args.feedback_id,
        body: args.body,
        author: page.owner?.name,
      });
      return { id: event.id, seq: event.seq };
    }
    if (name === "ask") {
      const page = await store.readPage(args.slug);
      const event = await store.addAgentEvent(args.slug, {
        kind: "question",
        body: args.question,
        choices: args.choices,
        author: page.owner?.name,
      });
      return { id: event.id, url: pageUrl(studio, page), next: "The answer arrives through wait_for_feedback." };
    }
    if (name === "resolve_feedback") {
      const page = await store.readPage(args.slug);
      const event = await store.setResolved(args.slug, args.feedback_id, args.resolved !== false, {
        name: page.owner?.name ?? "agent",
        role: "agent",
      });
      return { id: event.id, status: event.kind === "resolve" ? "resolved" : "open" };
    }
    if (name.startsWith("artifact_")) {
      const sync = new StudioArtifactSync({ store, repoRoot: studio.repoRoot });
      if (name === "artifact_sync_plan") return sync.plan();
      if (name === "artifact_link") return sync.link({ study: args.study, url: args.url, sourceHash: args.source_hash });
      if (name === "artifact_import_comments") return sync.importComments({ study: args.study, comments: args.comments });
      if (name === "artifact_mark_mirrored") {
        return sync.markMirrored({ study: args.study, eventId: args.event_id, threadId: args.thread_id, text: args.text });
      }
    }
    throw new FeedbackError(404, `Unknown tool ${name}.`);
  }

  async function handleMcp(request, response) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }
    if (request.method === "GET") {
      sendJson(response, 405, { error: "This server does not open a GET stream. POST JSON-RPC to /mcp." }, {
        ...cors,
        allow: "POST",
      });
      return;
    }
    if (request.method === "DELETE") {
      const id = request.headers["mcp-session-id"];
      if (id) sessions.delete(id);
      response.writeHead(204, cors);
      response.end();
      return;
    }
    if (request.method !== "POST") throw new RequestError(405, "Method not allowed.");
    if (!String(request.headers["content-type"] || "").includes("application/json")) {
      throw new RequestError(415, "MCP requests must be application/json.");
    }
    const message = await readBody(request);
    if (Array.isArray(message)) throw new RequestError(400, "JSON-RPC batches are not supported.");
    const method = String(message.method || "");
    const id = message.id ?? null;
    const sessionId = request.headers["mcp-session-id"] || randomUUID();
    const sessionState = session(sessionId);
    const headers = { ...cors, "mcp-session-id": sessionId };

    if (method.startsWith("notifications/") || (message.result !== undefined || message.error !== undefined)) {
      response.writeHead(202, headers);
      response.end();
      return;
    }
    if (method === "initialize") {
      sessionState.client = message.params?.clientInfo;
      sendSseMessage(response, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "studio", version: "0.1.0" },
          instructions: MCP_INSTRUCTIONS,
        },
      }, headers);
      return;
    }
    if (method === "ping") {
      sendSseMessage(response, { jsonrpc: "2.0", id, result: {} }, headers);
      return;
    }
    if (method === "tools/list") {
      sendSseMessage(response, { jsonrpc: "2.0", id, result: { tools: STUDIO_MCP_TOOLS } }, headers);
      return;
    }
    if (method === "tools/call") {
      const name = String(message.params?.name || "");
      const args = message.params?.arguments && typeof message.params.arguments === "object"
        ? message.params.arguments
        : {};
      const abort = new AbortController();
      response.once("close", () => abort.abort());
      let result;
      try {
        result = textResult(await callTool(sessionState, name, args, abort.signal));
      } catch (error) {
        if (!(error instanceof FeedbackError)) log(`studio mcp ${name} failed: ${error.stack || error.message}`);
        result = textResult(error.message || String(error), true);
      }
      if (!response.destroyed) sendSseMessage(response, { jsonrpc: "2.0", id, result }, headers);
      return;
    }
    sendSseMessage(response, {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    }, headers);
  }

  function streamEvents(response, store, slug, headers) {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      ...headers,
    });
    response.write("retry: 2000\n\n");
    const onEvent = (event) => {
      if (slug && event.page !== slug) return;
      response.write(`event: feedback\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const onPages = (change) => {
      response.write(`event: pages\ndata: ${JSON.stringify(change)}\n\n`);
    };
    const onPresence = (studioId) => {
      if (studioId === store.studioId) response.write(`event: presence\ndata: {}\n\n`);
    };
    const keepalive = setInterval(() => response.write(": keepalive\n\n"), SSE_KEEPALIVE_MS);
    store.emitter.on("event", onEvent);
    store.emitter.on("pages", onPages);
    presence.emitter.on("change", onPresence);
    response.once("close", () => {
      clearInterval(keepalive);
      store.emitter.off("event", onEvent);
      store.emitter.off("pages", onPages);
      presence.emitter.off("change", onPresence);
    });
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {string | undefined} hostStudioId studio implied by the Host header, if any
   */
  async function handleApi(request, response, hostStudioId) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }
    const url = new URL(request.url, "http://studio.local");
    const rest = url.pathname.slice(STUDIO_API_PREFIX.length);
    const studio = resolveStudio(url.searchParams.get("studio") || hostStudioId);
    const store = storeFor(studio);

    if (request.method === "GET" && rest === "/events") {
      streamEvents(response, store, url.searchParams.get("page") || undefined, cors);
      return;
    }
    if (request.method === "GET" && rest === "/pages") {
      const agents = presence.agents(studio.id);
      const pages = await Promise.all((await store.listPages()).map(async (page) => ({
        ...page,
        presence: pagePresence(page, agents),
        attention: pageAttention(page, foldFeedback(await store.listEvents(page.slug))),
      })));
      sendJson(response, 200, { ok: true, studio: studio.id, pages, agents }, cors);
      return;
    }
    const pageMatch = rest.match(/^\/pages\/([a-z0-9-]+)(\/feedback(?:\/([0-9a-f-]+)\/resolve)?)?$/);
    if (!pageMatch) throw new RequestError(404, "Studio API endpoint not found.");
    const [, slug, feedbackPath, feedbackId] = pageMatch;

    if (request.method === "GET" && !feedbackPath) {
      const page = await store.readPage(slug, { withBody: true });
      const events = await store.listEvents(slug);
      sendJson(response, 200, { ok: true, page, threads: foldFeedback(events), cursor: events.at(-1)?.seq ?? 0 }, cors);
      return;
    }
    if (request.method !== "POST" || !feedbackPath) throw new RequestError(405, "Method not allowed.");
    if (!String(request.headers["content-type"] || "").includes("application/json")) {
      throw new RequestError(415, "Feedback must be sent as application/json.");
    }
    const body = await readBody(request);
    if (feedbackId) {
      const event = await store.setResolved(slug, feedbackId, body.resolved !== false, {
        name: body.author?.name ?? body.author,
        role: "reviewer",
      });
      sendJson(response, 201, { ok: true, event }, cors);
      return;
    }
    // `source` marks mirrored feedback; only the host sets it, never a page.
    const { source: _source, ...input } = body;
    const event = await store.addReviewerEvent(slug, input);
    sendJson(response, 201, { ok: true, event }, cors);
  }

  /** Dispatches a request on the loopback MCP port or through the proxy. */
  async function handle(request, response, { hostStudioId } = {}) {
    try {
      if (!isTrustedHost(request.headers.host)) throw new RequestError(421, "Untrusted Host header.");
      if (!isTrustedOrigin(request.headers.origin)) throw new RequestError(403, "Untrusted Origin.");
      const pathname = new URL(request.url, "http://studio.local").pathname;
      if (pathname === STUDIO_MCP_PATH || pathname === `/__studio${STUDIO_MCP_PATH}`) {
        await handleMcp(request, response);
      } else if (pathname.startsWith(`${STUDIO_API_PREFIX}/`)) {
        await handleApi(request, response, hostStudioId);
      } else if (request.method === "GET" && pathname === "/health") {
        sendJson(response, 200, { ok: true, name: "studio-mcp", mcp: STUDIO_MCP_PATH, studios: listStudios().length });
      } else {
        throw new RequestError(404, "Not found.");
      }
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof RequestError || error instanceof FeedbackError ? error.status : 500;
      if (status === 500) log(`studio api failed: ${error.stack || error.message}`);
      sendJson(response, status, { ok: false, error: error.message || String(error) }, corsHeaders(request));
    }
  }

  return { handle, callTool, resolveStudio, summarizePages, sessions, stores, presence };
}

export function isStudioServicePath(url) {
  const pathname = String(url || "").split("?")[0];
  return pathname.startsWith(`${STUDIO_API_PREFIX}/`) || pathname === `/__studio${STUDIO_MCP_PATH}`;
}
