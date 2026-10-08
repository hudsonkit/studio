/**
 * Agent pages and reviewer feedback. Agents publish pages through the Studio
 * MCP on the host daemon; these pieces render them and send feedback back.
 */

export { AgentPage } from "./AgentPage";
export type { AgentPageProps } from "./AgentPage";
export { AgentPresenceChip, PresenceDot } from "./AgentPresence";
export type { AgentPresenceChipProps } from "./AgentPresence";
export {
  createFeedbackClient,
  DEFAULT_STUDIO_MCP_ORIGIN,
  FeedbackRequestError,
  STUDIO_FEEDBACK_API_PREFIX,
} from "./client";
export type { FeedbackClient, FeedbackClientOptions, FeedbackStreamHandlers } from "./client";
export { describePresence, formatAge, usePresenceClock } from "./presence";
export type { PresenceDescription, PresenceState } from "./presence";
export { useAgentPage, useAgentPages, useReviewerName } from "./store";
export type { AgentPageState, AgentPagesState } from "./store";
export type {
  AgentFormField,
  AgentFormFieldType,
  AgentPageDetail,
  AgentPageMeta,
  AgentPageOwner,
  AgentPagesOverview,
  AgentPageSummary,
  AgentPresence,
  AgentPageStatus,
  AgentPageWidget,
  AgentPageWithBody,
  AttentionItem,
  AttentionKind,
  FeedbackEvent,
  FeedbackKind,
  FeedbackRole,
  FeedbackThread,
  PageAttention,
  ReviewerFeedbackInput,
} from "./types";
