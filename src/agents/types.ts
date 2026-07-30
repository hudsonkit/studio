/**
 * Agent dispatch types — who a Studio can send work to, and the contract a
 * dispatch rides on.
 *
 * A `StudioAgentTarget` is a portable pointer at a Scout agent: a selector
 * (exact id, definition id, handle, or name — the same vocabulary
 * `resolveStudioScoutAgent` accepts), never a machine-specific id, so the
 * project manifest survives moving between machines.
 *
 * The `StudioCapabilityRequest` / `StudioCapabilityResult` pair mirrors
 * Hudson's HUD-011 agent contract (`CapabilityRequest` /
 * `CapabilityResult`). Transport today is direct Scout HTTP; the shapes are
 * aligned so a future Hudson-mediated dispatch bus can slot in without
 * rewriting call sites.
 */

export type StudioAgentIntent = "message" | "request";

export interface StudioAgentTarget {
  /**
   * Portable Scout agent selector. Resolved against exact ids, definition
   * ids, handles, and names exposed by Scout's web API.
   */
  agent: string;
  /** Human-facing label for pickers; falls back to the selector. */
  label?: string;
  /** Send intent this target prefers. Defaults to `"message"`. */
  intent?: StudioAgentIntent;
  /** One-line description for pickers, e.g. what this agent is good at. */
  blurb?: string;
}

export type StudioCapabilitySource = "scout" | "api" | "studio-ui";

/** HUD-011-aligned: one unit of work routed to a capability owner. */
export interface StudioCapabilityRequest {
  /** The app asking for the capability — a Studio id, not an agent id. */
  appId: string;
  /** e.g. `"annotations:dispatch"`. */
  operation: string;
  params?: Record<string, unknown>;
  source: StudioCapabilitySource;
}

/** HUD-011-aligned: what the caller gets back, success or failure. */
export interface StudioCapabilityResult {
  ok: boolean;
  /** One sentence, human-readable — what happened. */
  summary: string;
  data?: Record<string, unknown>;
}
