/**
 * Wire types for agent pages and their feedback log, as served by the Studio
 * host daemon under `/__studio/api` (see bin/local-agent-api.mjs).
 */

export type AgentPageStatus = "draft" | "review" | "done" | "archived";

export type AgentFormFieldType = "text" | "textarea" | "choice" | "rating" | "boolean";

export interface AgentFormField {
  name: string;
  label: string;
  type: AgentFormFieldType;
  required: boolean;
  options?: string[];
  max?: number;
}

export type AgentPageWidget =
  | { id: string; kind: "comments" }
  | { id: string; kind: "chat" }
  | { id: string; kind: "form"; title?: string; fields: AgentFormField[] };

export interface AgentPageOwner {
  name: string;
  client?: string;
  session?: string;
}

export interface AgentPageMeta {
  slug: string;
  href: string;
  title: string;
  blurb?: string;
  status: AgentPageStatus;
  owner?: AgentPageOwner;
  widgets: AgentPageWidget[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * An agent session the host has seen, as raw facts. `describePresence` turns
 * them into listening / working / idle against the page's own clock.
 */
export interface AgentPresence {
  session: string;
  name: string;
  client?: string;
  /** Blocked in wait_for_feedback right now. */
  listening: boolean;
  /** Pages its current or last wait covers; null means every page. */
  slugs: string[] | null;
  lastSeenAt: string;
  lastWaitEndedAt?: string;
  lastWaitTimedOut: boolean;
}

export type AttentionKind = "question" | "reply" | "chat";

/** Something on a page that waits on the reviewer. `id` is the thread root. */
export interface AttentionItem {
  slug: string;
  title: string;
  kind: AttentionKind;
  id: string;
  excerpt: string;
  author?: string;
  createdAt: string;
}

export interface PageAttention {
  needsYou: number;
  waitingOnAgent: number;
  items: AttentionItem[];
}

/** A page as the list endpoint serves it: meta plus who speaks for it and what it waits on. */
export interface AgentPageSummary extends AgentPageMeta {
  presence?: AgentPresence | null;
  attention?: PageAttention;
}

export interface AgentPagesOverview {
  pages: AgentPageSummary[];
  agents: AgentPresence[];
}

export interface AgentPageWithBody extends AgentPageMeta {
  body: string;
}

export type FeedbackRole = "reviewer" | "agent";

export type FeedbackKind =
  | "comment"
  | "chat"
  | "form_response"
  | "answer"
  | "reply"
  | "question"
  | "resolve"
  | "reopen"
  | "page_updated";

export interface FeedbackEvent {
  id: string;
  seq: number;
  page: string;
  createdAt: string;
  kind: FeedbackKind;
  author: { name: string; role: FeedbackRole };
  body?: string;
  data?: Record<string, unknown>;
  widgetId?: string;
  parentId?: string;
  anchor?: unknown;
  targetId?: string;
}

/** A feedback item folded with its replies; reviewer items carry open/resolved. */
export interface FeedbackThread extends FeedbackEvent {
  replies: FeedbackThread[];
  status?: "open" | "resolved";
}

export interface AgentPageDetail {
  page: AgentPageWithBody;
  threads: FeedbackThread[];
  cursor: number;
}

export type ReviewerFeedbackInput =
  | { kind: "comment"; body: string; parentId?: string; anchor?: unknown }
  | { kind: "chat"; body: string; parentId?: string }
  | { kind: "form_response"; widgetId: string; data: Record<string, unknown>; body?: string }
  | { kind: "answer"; parentId: string; choice?: string; body?: string };
