/**
 * Wire types for the study live view. The client posts the pages it can
 * render; the host route streams back which of them each file change touches.
 */

/** What the live view tells the host about one registered page. */
export interface LivePageRef {
  href: string;
  /** Repo-relative source files from the registry entry. */
  source?: string[];
}

export interface LiveSubscribeRequest {
  pages: LivePageRef[];
  /** Replay changes at or after this epoch-ms time (the view's session start). */
  since?: number;
}

/** A page a changed file belongs to, `hops` imports away from the page's entry. */
export interface LiveCandidate {
  href: string;
  hops: number;
}

export interface LiveChange {
  /** Monotonic per host process. */
  id: number;
  /** Epoch ms when the host saw the change. */
  at: number;
  /** Repo-relative path, forward slashes. */
  file: string;
  removed?: boolean;
  /** Pages the file belongs to, nearest first. Empty when it belongs to none. */
  pages: LiveCandidate[];
}

export type LiveServerEvent =
  | {
      type: "hello";
      /** Epoch ms on the host. */
      now: number;
      /** Files the host watches for these pages. */
      watching: number;
      /** Pages with at least one file found. */
      resolved: number;
      root: string;
    }
  | { type: "change"; change: LiveChange }
  | { type: "ping"; now: number };
