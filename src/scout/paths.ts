import type { StudioScoutComposerInput } from "./types";

export const STUDIO_SCOUT_WEB_BASE_URL_ENV = "STUDIO_SCOUT_WEB_BASE_URL";

export const studioScoutPaths = {
  studioApi: {
    connection: "/api/scout",
    messages: "/api/scout/messages",
  },
  scoutWebApi: {
    agents: "/api/agents",
    directConversation: "/api/conversations/direct",
    send: "/api/send",
    ask: "/api/ask",
  },
  scoutWeb: {
    contextCapture: "/embed/context-capture",
  },
} as const;

export function normalizeScoutWebBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("scout.webBaseUrl must use http or https.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("scout.webBaseUrl cannot contain credentials, query, or hash data.");
  }
  if (url.pathname !== "/") {
    throw new Error("scout.webBaseUrl must be an origin without a path.");
  }
  return url.origin;
}

export function scoutWebApiUrl(baseUrl: string, path: string): URL {
  return new URL(path, `${normalizeScoutWebBaseUrl(baseUrl)}/`);
}

export function studioScoutComposerUrl(
  baseUrl: string,
  input: StudioScoutComposerInput = {},
): URL {
  const url = new URL(
    studioScoutPaths.scoutWeb.contextCapture,
    `${normalizeScoutWebBaseUrl(baseUrl)}/`,
  );
  if (input.agentId?.trim()) url.searchParams.set("agent", input.agentId.trim());
  if (input.conversationId?.trim()) {
    url.searchParams.set("conversation", input.conversationId.trim());
  }
  if (input.message) url.searchParams.set("message", input.message);
  if (input.context?.length) {
    url.searchParams.set("context", JSON.stringify(input.context));
  }
  if (input.preferExistingChat) url.searchParams.set("mode", "existing-chat");
  return url;
}
