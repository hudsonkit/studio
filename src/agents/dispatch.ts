/**
 * Dispatch mapping — pure translators between Studio's own shapes and the
 * HUD-011-aligned capability contract.
 *
 * These functions never touch the network. They exist so the seam between
 * "what the UI produced" (an annotation pass) and "what the transport
 * carries" (a Scout message, today) is one testable mapping — the same seam
 * a future Hudson-mediated dispatch bus would sit on.
 */

import type { SendPassPayload } from "../doc";
import type { StudioScoutReceipt } from "../scout/types";
import type {
  StudioAgentTarget,
  StudioCapabilityRequest,
  StudioCapabilityResult,
} from "./types";

/** The operation an annotation review pass dispatches as. */
export const ANNOTATIONS_DISPATCH_OPERATION = "annotations:dispatch";

/**
 * Shape an annotation pass (from `AnnotatableDoc`'s `onSendPass`) as a
 * HUD-011-style capability request addressed at one registered target.
 */
export function annotationPassToCapabilityRequest(
  pass: SendPassPayload,
  target: StudioAgentTarget,
): StudioCapabilityRequest {
  return {
    appId: "studio",
    operation: ANNOTATIONS_DISPATCH_OPERATION,
    params: {
      target: target.agent,
      intent: target.intent ?? "message",
      docTitle: pass.docTitle,
      slug: pass.slug,
      annotations: pass.annotations,
      formatted: pass.formatted,
    },
    source: "studio-ui",
  };
}

/**
 * Fold a Scout send receipt back into a capability result. `ok` always
 * mirrors the receipt — Scout transport failures throw before a receipt
 * exists, so a result here means the message was accepted.
 */
export function receiptToCapabilityResult(
  receipt: StudioScoutReceipt,
): StudioCapabilityResult {
  return {
    ok: receipt.ok,
    summary: `Delivered to ${receipt.targetAgentId} via Scout (${receipt.intent}).`,
    data: {
      agentId: receipt.agentId,
      targetAgentId: receipt.targetAgentId,
      conversationId: receipt.conversationId,
      messageId: receipt.messageId,
      flightId: receipt.flightId,
    },
  };
}
