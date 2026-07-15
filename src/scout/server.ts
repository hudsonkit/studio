import { findStudioProjectRoot, readStudioProjectManifest } from "../local/manifest";
import {
  normalizeScoutWebBaseUrl,
  scoutWebApiUrl,
  STUDIO_SCOUT_WEB_BASE_URL_ENV,
  studioScoutPaths,
} from "./paths";
import type {
  StudioScoutAgentSummary,
  StudioScoutConnection,
  StudioScoutManifestConfig,
  StudioScoutMessageContext,
  StudioScoutMessageInput,
  StudioScoutMessageIntent,
  StudioScoutReceipt,
} from "./types";

type FetchLike = typeof fetch;

interface ScoutAgentRecord {
  id?: unknown;
  definitionId?: unknown;
  name?: unknown;
  displayName?: unknown;
  handle?: unknown;
  isOnline?: unknown;
  online?: unknown;
  status?: unknown;
}

interface ResolvedScoutRuntime {
  repo: string;
  studioId: string;
  studioLabel: string;
  config: StudioScoutManifestConfig;
  agent: StudioScoutAgentSummary;
}

type StudioScoutEnvironment = Record<string, string | undefined>;

export function resolveStudioScoutConfig(
  config: StudioScoutManifestConfig,
  env: StudioScoutEnvironment = process.env,
): StudioScoutManifestConfig {
  const webBaseUrl = env[STUDIO_SCOUT_WEB_BASE_URL_ENV]?.trim();
  if (!webBaseUrl) return config;
  return {
    ...config,
    webBaseUrl: normalizeScoutWebBaseUrl(webBaseUrl),
  };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSelector(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function onlineState(agent: ScoutAgentRecord): boolean | null {
  if (typeof agent.isOnline === "boolean") return agent.isOnline;
  if (typeof agent.online === "boolean") return agent.online;
  const status = text(agent.status)?.toLowerCase();
  if (!status) return null;
  if (["online", "live", "running", "ready"].includes(status)) return true;
  if (["offline", "idle", "stopped", "unavailable"].includes(status)) return false;
  return null;
}

function agentSummary(agent: ScoutAgentRecord): StudioScoutAgentSummary | null {
  const id = text(agent.id);
  if (!id) return null;
  return {
    id,
    definitionId: text(agent.definitionId),
    name: text(agent.name) ?? text(agent.displayName),
    handle: text(agent.handle),
    online: onlineState(agent),
  };
}

async function scoutJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<T> {
  const response = await fetchImpl(scoutWebApiUrl(baseUrl, path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(5_000),
  });
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: unknown }
    | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "error" in payload
        ? String(payload.error)
        : `HTTP ${response.status}`;
    throw new Error(`Scout web request failed: ${detail}`);
  }
  return payload as T;
}

export async function resolveStudioScoutAgent(
  config: StudioScoutManifestConfig,
  fetchImpl: FetchLike = fetch,
): Promise<StudioScoutAgentSummary> {
  const records = await scoutJson<ScoutAgentRecord[]>(
    config.webBaseUrl,
    studioScoutPaths.scoutWebApi.agents,
    { method: "GET", cache: "no-store" },
    fetchImpl,
  );
  if (!Array.isArray(records)) {
    throw new Error("Scout web returned an invalid agent list.");
  }

  const selector = normalizeSelector(config.identity.agent);
  const matches = records
    .filter((record) => {
      const candidates = [
        text(record.id),
        text(record.definitionId),
        text(record.handle),
        text(record.name),
        text(record.displayName),
      ];
      return candidates.some(
        (candidate) => candidate && normalizeSelector(candidate) === selector,
      );
    })
    .map(agentSummary)
    .filter((agent): agent is StudioScoutAgentSummary => agent !== null);

  const exact = matches.find(
    (agent) => normalizeSelector(agent.id) === selector,
  );
  if (exact) return exact;
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`Scout agent ${config.identity.agent} was not found.`);
  }
  throw new Error(
    `Scout agent selector ${config.identity.agent} is ambiguous (${matches
      .map((agent) => agent.id)
      .join(", ")}).`,
  );
}

async function resolveRuntime(
  startDirectory: string,
  fetchImpl: FetchLike,
): Promise<ResolvedScoutRuntime> {
  const repo = await findStudioProjectRoot(startDirectory);
  const manifest = await readStudioProjectManifest(repo);
  if (!manifest.scout) {
    throw new Error("This Studio has no Scout configuration.");
  }
  const config = resolveStudioScoutConfig(manifest.scout);
  const agent = await resolveStudioScoutAgent(config, fetchImpl);
  return {
    repo,
    studioId: manifest.id,
    studioLabel: manifest.label ?? manifest.id,
    config,
    agent,
  };
}

export async function inspectStudioScoutConnection(
  startDirectory = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<StudioScoutConnection> {
  const repo = await findStudioProjectRoot(startDirectory);
  const manifest = await readStudioProjectManifest(repo);
  const studio = { id: manifest.id, label: manifest.label ?? manifest.id };
  if (!manifest.scout) {
    return {
      configured: false,
      connected: false,
      studio,
      identity: null,
      webBaseUrl: null,
      error: "Add a scout block to .studio/project.json.",
    };
  }

  const config = resolveStudioScoutConfig(manifest.scout);

  try {
    const agent = await resolveStudioScoutAgent(config, fetchImpl);
    return {
      configured: true,
      connected: true,
      studio,
      identity: {
        selector: config.identity.agent,
        label: config.identity.label ?? agent.name ?? agent.handle ?? agent.id,
        agent,
      },
      webBaseUrl: config.webBaseUrl,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      studio,
      identity: {
        selector: config.identity.agent,
        label: config.identity.label ?? config.identity.agent,
        agent: null,
      },
      webBaseUrl: config.webBaseUrl,
      error: connectionError(error, config.webBaseUrl),
    };
  }
}

function formatContext(
  runtime: ResolvedScoutRuntime,
  body: string,
  context: StudioScoutMessageContext | undefined,
): string {
  const details = [
    `Studio: ${runtime.studioLabel}`,
    context?.title?.trim() ? `Surface: ${context.title.trim()}` : null,
    context?.url?.trim() ? `Source: ${context.url.trim()}` : null,
  ].filter((line): line is string => Boolean(line));
  return `${body.trim()}\n\n---\n${details.join("\n")}`;
}

function receiptValue(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function connectionError(error: unknown, webBaseUrl: string): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      message.includes("fetch failed") ||
      message.includes("aborted due to timeout")
    ) {
      return `Scout web is not reachable at ${webBaseUrl}.`;
    }
    return error.message;
  }
  return String(error);
}

export async function postStudioScoutMessage(
  input: StudioScoutMessageInput,
  startDirectory = process.cwd(),
  fetchImpl: FetchLike = fetch,
): Promise<StudioScoutReceipt> {
  const body = input.body?.trim();
  if (!body) throw new Error("Message body is required.");
  const intent: StudioScoutMessageIntent =
    input.intent === "request" ? "request" : "message";
  const runtime = await resolveRuntime(startDirectory, fetchImpl);
  const routedBody = formatContext(runtime, body, input.context);

  let payload: unknown;
  if (intent === "request") {
    payload = await scoutJson<unknown>(
      runtime.config.webBaseUrl,
      studioScoutPaths.scoutWebApi.ask,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: routedBody,
          targetAgentId: runtime.agent.id,
          metadata: {
            source: "studio-web",
            studioId: runtime.studioId,
          },
        }),
      },
      fetchImpl,
    );
  } else {
    const direct = await scoutJson<Record<string, unknown>>(
      runtime.config.webBaseUrl,
      studioScoutPaths.scoutWebApi.directConversation,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: runtime.agent.id,
          targetLabel: runtime.config.identity.label,
          projectPath: runtime.repo,
        }),
      },
      fetchImpl,
    );
    const conversationId =
      receiptValue(direct, "conversationId") ??
      receiptValue(direct, "chatId") ??
      receiptValue(direct, "id");
    if (!conversationId) {
      throw new Error("Scout web did not return a direct conversation id.");
    }
    payload = await scoutJson<unknown>(
      runtime.config.webBaseUrl,
      studioScoutPaths.scoutWebApi.send,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: routedBody,
          conversationId,
          intent: "tell",
        }),
      },
      fetchImpl,
    );
    if (
      payload &&
      typeof payload === "object" &&
      !("conversationId" in payload)
    ) {
      payload = { ...(payload as Record<string, unknown>), conversationId };
    }
  }

  return {
    ok: true,
    intent,
    agentId: runtime.agent.id,
    conversationId: receiptValue(payload, "conversationId"),
    messageId: receiptValue(payload, "messageId"),
    flightId: receiptValue(payload, "flightId"),
    webBaseUrl: runtime.config.webBaseUrl,
  };
}
