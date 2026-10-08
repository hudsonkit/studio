"use client";

import { describePresence, usePresenceClock, type PresenceState } from "./presence";
import type { AgentPresence } from "./types";

const DOT: Record<PresenceState | "none", string> = {
  listening: "bg-emerald-400",
  working: "bg-amber-300",
  idle: "bg-studio-ink-faint/60",
  none: "border border-studio-ink-faint/60",
};

/** A presence dot; it pulses while the agent is listening. */
export function PresenceDot({ state, className = "" }: { state: PresenceState | "none"; className?: string }) {
  return (
    <span className={`relative inline-flex size-[7px] shrink-0 ${className}`} aria-hidden>
      {state === "listening" ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
      ) : null}
      <span className={`relative inline-flex size-full rounded-full ${DOT[state]}`} />
    </span>
  );
}

export interface AgentPresenceChipProps {
  presence?: AgentPresence | null;
  /** Shown when the host hasn't seen the agent since it started, e.g. the page owner. */
  fallbackName?: string;
  className?: string;
}

/** "atlas · listening": who speaks for a page and whether they hear you right now. */
export function AgentPresenceChip({ presence, fallbackName, className = "" }: AgentPresenceChipProps) {
  const now = usePresenceClock() || Date.now();
  const described = presence ? describePresence(presence, now) : undefined;
  const name = described?.name ?? fallbackName ?? "agent";
  const label = described?.label ?? "not connected";
  const title = described?.state === "listening"
    ? `${name} is waiting in wait_for_feedback. What you post reaches it now.`
    : described?.state === "working"
      ? `${name} called Studio in the last few minutes and isn't listening right now.`
      : described
        ? `${name} hasn't called Studio for a while. Feedback waits for its next wait_for_feedback.`
        : "No agent session has touched this page since the host started.";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-2 rounded-full border border-studio-chip-border bg-studio-chip-bg px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink ${className}`}
    >
      <PresenceDot state={described?.state ?? "none"} />
      <span className="text-studio-ink-strong normal-case tracking-normal">{name}</span>
      <span className={described?.state === "listening" ? "text-emerald-300" : "text-studio-ink-faint"}>{label}</span>
    </span>
  );
}
