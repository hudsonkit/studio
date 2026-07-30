import type { StudioAgentTarget } from "../agents/types";

export type StudioScoutMessageIntent = "message" | "request";

export interface StudioScoutIdentityConfig {
  /**
   * Portable Scout agent selector. The server resolves this against exact ids,
   * definition ids, handles, and names exposed by Scout's web API.
   */
  agent: string;
  label?: string;
}

export interface StudioScoutManifestConfig {
  /** Configurable origin for the local Scout web server. */
  webBaseUrl: string;
  /** The Scout identity this Studio belongs to and sends work toward. */
  identity: StudioScoutIdentityConfig;
}

export interface StudioScoutAgentSummary {
  id: string;
  definitionId?: string;
  name?: string;
  handle?: string;
  online: boolean | null;
}

export interface StudioScoutConnection {
  configured: boolean;
  connected: boolean;
  studio: {
    id: string;
    label: string;
  };
  identity: {
    selector: string;
    label: string;
    agent: StudioScoutAgentSummary | null;
  } | null;
  webBaseUrl: string | null;
  error: string | null;
}

export interface StudioScoutMessageContext {
  title?: string;
  url?: string;
}

export interface StudioScoutContextItem {
  label: string;
  value: string;
}

export interface StudioScoutComposerInput {
  agentId?: string;
  conversationId?: string;
  message?: string;
  context?: readonly StudioScoutContextItem[];
  preferExistingChat?: boolean;
}

export interface StudioScoutMessageInput {
  body: string;
  intent?: StudioScoutMessageIntent;
  context?: StudioScoutMessageContext;
  /**
   * Registered agent to send toward. Absent → the Studio's own
   * `scout.identity`, so single-agent callers keep working unchanged.
   */
  target?: StudioAgentTarget;
}

/**
 * One registered dispatch target as the Studio API reports it: the manifest
 * entry plus live resolution against Scout's `/api/agents`. `online` and
 * `agent` are `null` when Scout is unreachable or the selector does not
 * resolve — the list still loads, the target just shows as offline.
 */
export interface StudioScoutAgentOption {
  selector: string;
  label: string;
  intent: StudioScoutMessageIntent;
  blurb?: string;
  online: boolean | null;
  agent: StudioScoutAgentSummary | null;
}

export interface StudioScoutAgentsResponse {
  ok: boolean;
  agents: StudioScoutAgentOption[];
}

export interface StudioScoutReceipt {
  ok: true;
  intent: StudioScoutMessageIntent;
  /** The Studio's own resolved identity agent (the sender). */
  agentId: string;
  /** The resolved recipient — equals `agentId` unless a `target` override routed the send elsewhere. */
  targetAgentId: string;
  conversationId: string | null;
  messageId: string | null;
  flightId: string | null;
  webBaseUrl: string;
}
