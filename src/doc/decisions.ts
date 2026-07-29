import type { Annotation } from "./AnnotatableDoc";

/**
 * Structured decisions / iteration events that can be recorded against a
 * studio page (or a specific treatment/variant inside a page).
 *
 * These can be:
 * - Derived from pinned annotations (free-form human/agent notes that have
 *   decision semantics).
 * - Created directly via UI affordances or agent commands.
 * - Stored alongside the page (e.g. in a sidecar JSON, frontmatter, or the
 *   registry's extra data) so they are versioned and visible to agents that
 *   read the workspace.
 */

export type TreatmentId = string;

export type DecisionKind =
  | "winner"           // This treatment/variant is chosen
  | "turn"             // An iteration / refinement on a treatment
  | "proposal"         // A new treatment variant is being suggested
  | "rejection"        // Explicitly ruling a treatment out (with reason)
  | "comparison";      // A note comparing several treatments

export interface TreatmentDecision {
  id: string;
  kind: DecisionKind;
  /** Which page this decision belongs to (the studio href / slug). */
  pageHref: string;
  /** Optional: which specific treatment/variant inside the page. */
  treatmentId?: TreatmentId;
  /** Human or agent readable summary. */
  summary: string;
  /** Richer detail (can be the original annotation body, or a formatted diff, etc.). */
  detail?: string;
  /** Who / what created it. */
  author?: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Link back to the source annotation if this was derived from one. */
  sourceAnnotationId?: string;
  /** Optional structured payload for machine consumption. */
  meta?: Record<string, unknown>;
}

/**
 * A lightweight view of a treatment (alternative design) that is being
 * tracked inside a studio page or across a family of pages.
 */
export interface Treatment {
  id: TreatmentId;
  label: string;
  /** Optional link to a more detailed page or section for this variant. */
  href?: string;
  status?: "proposed" | "active" | "winner" | "rejected";
}

/**
 * Extract or synthesize decisions from a set of (pinned) annotations.
 * This is a starting heuristic — consumers can replace it with custom logic.
 */
export function annotationsToDecisions(
  pageHref: string,
  annotations: Annotation[],
): TreatmentDecision[] {
  return annotations
    .filter((a) => a.pinned)
    .map((a) => {
      const body = a.body.trim();
      const lower = body.toLowerCase();

      let kind: DecisionKind = "turn";
      if (lower.includes("winner") || lower.includes("choose") || lower.includes("pick this")) {
        kind = "winner";
      } else if (lower.includes("reject") || lower.includes("no") || lower.includes("don't")) {
        kind = "rejection";
      } else if (lower.includes("compare") || lower.includes("vs") || lower.includes("versus")) {
        kind = "comparison";
      } else if (lower.includes("proposal") || lower.includes("alternative") || lower.includes("try")) {
        kind = "proposal";
      }

      return {
        id: a.id,
        kind,
        pageHref,
        summary: body.length > 120 ? body.slice(0, 117) + "..." : body,
        detail: body,
        createdAt: new Date(a.createdAt).toISOString(),
        sourceAnnotationId: a.id,
        meta: {
          anchor: a.anchorPreview,
          location: a.location,
          span: a.spanText,
        },
      } satisfies TreatmentDecision;
    });
}

/**
 * Create a structured "winner" decision.
 */
export function createWinnerDecision(params: {
  pageHref: string;
  treatmentId?: TreatmentId;
  summary: string;
  detail?: string;
  author?: string;
}): TreatmentDecision {
  return {
    id: `win-${Date.now()}`,
    kind: "winner",
    pageHref: params.pageHref,
    treatmentId: params.treatmentId,
    summary: params.summary,
    detail: params.detail,
    author: params.author,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create an iteration "turn" on a treatment.
 */
export function createTurnDecision(params: {
  pageHref: string;
  treatmentId: TreatmentId;
  summary: string;
  detail?: string;
  author?: string;
  meta?: Record<string, unknown>;
}): TreatmentDecision {
  return {
    id: `turn-${Date.now()}`,
    kind: "turn",
    pageHref: params.pageHref,
    treatmentId: params.treatmentId,
    summary: params.summary,
    detail: params.detail,
    author: params.author,
    createdAt: new Date().toISOString(),
    meta: params.meta,
  };
}

/**
 * Convenience: given the current page and a list of decisions, figure out
 * the "active" treatment (last winner, or most recent turn's treatment).
 */
export function getActiveTreatment(
  decisions: TreatmentDecision[],
): TreatmentId | undefined {
  // Last explicit winner wins
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i];
    if (d.kind === "winner" && d.treatmentId) return d.treatmentId;
  }
  // Otherwise the treatment from the most recent turn
  for (let i = decisions.length - 1; i >= 0; i--) {
    const d = decisions[i];
    if (d.kind === "turn" && d.treatmentId) return d.treatmentId;
  }
  return undefined;
}
