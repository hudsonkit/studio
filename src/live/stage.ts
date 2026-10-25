import type { LiveChange } from "./types";

/**
 * What the live view puts on stage, folded from the session's changes.
 * Pure so the rules stay testable without a watcher or a browser.
 */

/** Files shared by more pages than this, at equal distance, are shared infrastructure. */
const SHARED_LIMIT = 2;

export interface LivePin {
  href: string;
  /** Epoch ms when the person pinned; a newer change releases the pin. */
  at: number;
}

export interface LiveTouch {
  href: string;
  change: LiveChange;
  /** Changes attributed to this page this session. */
  count: number;
}

export interface LiveStage {
  /** Page on stage, or undefined when nothing has changed and nothing is pinned. */
  href?: string;
  /** Latest change attributed to the staged page. */
  change?: LiveChange;
  pinned: boolean;
  /** Page the latest change belongs to — where the stage goes when unpinned. */
  latest?: string;
  /** Pages touched this session, most recent first. */
  touched: LiveTouch[];
  /** Changes to files that belong to no single study (registry, shared libs). */
  unattributed: number;
}

/**
 * Which page a change belongs to. The nearest page wins; a tie keeps the page
 * already on stage, a two-way tie takes the first, and a file shared more
 * widely than that moves nothing.
 */
export function attributeChange(change: LiveChange, current: string | undefined): string | undefined {
  const first = change.pages[0];
  if (!first) return undefined;
  const nearest = change.pages.filter((page) => page.hops === first.hops);
  if (nearest.length === 1) return first.href;
  if (current && nearest.some((page) => page.href === current)) return current;
  if (nearest.length <= SHARED_LIMIT) return first.href;
  return undefined;
}

export function foldStage(changes: readonly LiveChange[], pin: LivePin | undefined): LiveStage {
  const ordered = [...changes].sort((a, b) => a.at - b.at || a.id - b.id);
  const touched = new Map<string, LiveTouch>();
  let followed: string | undefined;
  let latestAt = 0;
  let unattributed = 0;
  for (const change of ordered) {
    const href = attributeChange(change, followed);
    if (!href) {
      unattributed += 1;
      continue;
    }
    followed = href;
    latestAt = change.at;
    const prior = touched.get(href);
    touched.set(href, { href, change, count: (prior?.count ?? 0) + 1 });
  }

  const pinHolds = pin !== undefined && latestAt <= pin.at;
  const href = pinHolds ? pin.href : followed;
  return {
    href,
    change: href ? touched.get(href)?.change : undefined,
    pinned: pinHolds,
    latest: followed,
    touched: [...touched.values()].sort((a, b) => b.change.at - a.change.at),
    unattributed,
  };
}
