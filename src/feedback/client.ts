import type {
  AgentPageDetail,
  AgentPageMeta,
  AgentPagesOverview,
  FeedbackEvent,
  ReviewerFeedbackInput,
} from "./types";

export const STUDIO_FEEDBACK_API_PREFIX = "/__studio/api";
export const DEFAULT_STUDIO_MCP_ORIGIN = "http://127.0.0.1:43148";

export interface FeedbackClientOptions {
  /**
   * Studio id the host daemon registered this repo under. Needed when the app
   * is opened on its raw dev port instead of `<repo>.studio.local`.
   */
  studioId?: string;
  /**
   * Explicit API origin. Defaults to same-origin on `*.studio.local` (the host
   * proxy serves the API there) and to the daemon's loopback port elsewhere.
   */
  origin?: string;
}

export interface FeedbackStreamHandlers {
  onFeedback?: (event: FeedbackEvent) => void;
  onPages?: (change: { type: string; slug: string }) => void;
  /** An agent started or stopped listening, or was seen for the first time. */
  onPresence?: () => void;
  onError?: () => void;
}

export interface FeedbackClient {
  readonly studioId?: string;
  listPages(): Promise<AgentPageMeta[]>;
  /** Pages with presence and attention, plus every agent seen in this studio. */
  getOverview(): Promise<AgentPagesOverview>;
  getPage(slug: string): Promise<AgentPageDetail>;
  postFeedback(slug: string, input: ReviewerFeedbackInput, reviewer: string): Promise<FeedbackEvent>;
  setResolved(slug: string, feedbackId: string, resolved: boolean, reviewer: string): Promise<FeedbackEvent>;
  /** Opens the SSE stream. Returns a function that closes it. */
  subscribe(handlers: FeedbackStreamHandlers): () => void;
}

export class FeedbackRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "FeedbackRequestError";
  }
}

export function createFeedbackClient(options: FeedbackClientOptions = {}): FeedbackClient {
  const { studioId } = options;

  function apiUrl(path: string): string {
    const sameOrigin = !options.origin
      && typeof window !== "undefined"
      && window.location.hostname.endsWith(".studio.local");
    const origin = sameOrigin ? "" : (options.origin ?? DEFAULT_STUDIO_MCP_ORIGIN);
    const url = `${origin}${STUDIO_FEEDBACK_API_PREFIX}${path}`;
    // On the proxy the Host header names the studio; elsewhere the query does.
    if (sameOrigin || !studioId) return url;
    return `${url}${url.includes("?") ? "&" : "?"}studio=${encodeURIComponent(studioId)}`;
  }

  async function request<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
    let response: Response;
    try {
      response = await fetch(apiUrl(path), init
        ? { method: init.method, headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }
        : undefined);
    } catch {
      throw new FeedbackRequestError(0, "The Studio host daemon is not reachable. Start it with `studio dev`.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new FeedbackRequestError(response.status, payload.error ?? `Request failed (${response.status}).`);
    }
    return payload as T;
  }

  const slugPath = (slug: string) => `/pages/${encodeURIComponent(slug)}`;

  return {
    studioId,
    async listPages() {
      return (await request<{ pages: AgentPageMeta[] }>("/pages")).pages;
    },
    async getOverview() {
      const { pages, agents } = await request<Partial<AgentPagesOverview>>("/pages");
      return { pages: pages ?? [], agents: agents ?? [] };
    },
    async getPage(slug) {
      return request<AgentPageDetail>(slugPath(slug));
    },
    async postFeedback(slug, input, reviewer) {
      const result = await request<{ event: FeedbackEvent }>(`${slugPath(slug)}/feedback`, {
        method: "POST",
        body: { ...input, author: { name: reviewer } },
      });
      return result.event;
    },
    async setResolved(slug, feedbackId, resolved, reviewer) {
      const result = await request<{ event: FeedbackEvent }>(
        `${slugPath(slug)}/feedback/${encodeURIComponent(feedbackId)}/resolve`,
        { method: "POST", body: { resolved, author: { name: reviewer } } },
      );
      return result.event;
    },
    subscribe(handlers) {
      if (typeof EventSource === "undefined") return () => {};
      const source = new EventSource(apiUrl("/events"));
      source.addEventListener("feedback", (message) => {
        handlers.onFeedback?.(JSON.parse((message as MessageEvent<string>).data));
      });
      source.addEventListener("pages", (message) => {
        handlers.onPages?.(JSON.parse((message as MessageEvent<string>).data));
      });
      source.addEventListener("presence", () => handlers.onPresence?.());
      source.onerror = () => handlers.onError?.();
      return () => source.close();
    },
  };
}
