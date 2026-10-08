"use client";

import { useSyncExternalStore } from "react";
import type { AgentPresence } from "./types";

export type PresenceState = "listening" | "working" | "idle";

export interface PresenceDescription {
  state: PresenceState;
  name: string;
  /** "listening", "working", "idle 12m". */
  label: string;
}

/** An agent re-calls wait_for_feedback right after a timeout; don't flicker in between. */
const RELISTEN_GRACE_MS = 20_000;
/** Seen this recently without listening: it is acting on feedback. */
const WORKING_MS = 3 * 60_000;

/**
 * Reads an agent's raw presence facts against `now`. Listening while blocked
 * in wait_for_feedback (or just between two waits), working when it called a
 * tool in the last few minutes, idle otherwise.
 */
export function describePresence(presence: AgentPresence, now: number): PresenceDescription {
  const name = presence.name;
  const seen = Date.parse(presence.lastSeenAt);
  const waitEnded = presence.lastWaitEndedAt ? Date.parse(presence.lastWaitEndedAt) : Number.NaN;
  if (presence.listening || (presence.lastWaitTimedOut && now - waitEnded < RELISTEN_GRACE_MS)) {
    return { state: "listening", name, label: "listening" };
  }
  if (now - seen < WORKING_MS) return { state: "working", name, label: "working" };
  return { state: "idle", name, label: `idle ${formatAge(now - seen)}` };
}

export function formatAge(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const TICK_MS = 15_000;
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** A shared clock that ticks every 15s, so idle ages and grace windows move on their own. */
export function usePresenceClock(): number {
  return useSyncExternalStore(subscribeClock, () => now, () => 0);
}
