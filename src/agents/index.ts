/**
 * Agent dispatch: target types, the `createAgentRegistry` factory, and pure
 * HUD-011-aligned mapping helpers. Browser-safe — this barrel imports no
 * `node:*`; target resolution against Scout lives in `studio/scout/server`.
 */

export { annotationPassToCapabilityRequest, ANNOTATIONS_DISPATCH_OPERATION, receiptToCapabilityResult } from "./dispatch";
export { createAgentRegistry } from "./registry";
export type { AgentRegistry, CreateAgentRegistryOptions } from "./registry";
export type {
  StudioAgentIntent,
  StudioAgentTarget,
  StudioCapabilityRequest,
  StudioCapabilityResult,
  StudioCapabilitySource,
} from "./types";
