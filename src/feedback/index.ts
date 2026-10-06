/**
 * Agent pages and reviewer feedback. Agents publish pages through the Studio
 * MCP on the host daemon; these pieces render them and send feedback back.
 */

export { AgentPage } from "./AgentPage";
export type { AgentPageProps } from "./AgentPage";
export {
  createFeedbackClient,
  DEFAULT_STUDIO_MCP_ORIGIN,
  FeedbackRequestError,
  STUDIO_FEEDBACK_API_PREFIX,
} from "./client";
export type { FeedbackClient, FeedbackClientOptions, FeedbackStreamHandlers } from "./client";
export { useAgentPage, useAgentPages, useReviewerName } from "./store";
export type { AgentPageState, AgentPagesState } from "./store";
export type {
  AgentFormField,
  AgentFormFieldType,
  AgentPageDetail,
  AgentPageMeta,
  AgentPageOwner,
  AgentPageStatus,
  AgentPageWidget,
  AgentPageWithBody,
  FeedbackEvent,
  FeedbackKind,
  FeedbackRole,
  FeedbackThread,
  ReviewerFeedbackInput,
} from "./types";
