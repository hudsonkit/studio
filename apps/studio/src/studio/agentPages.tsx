"use client";

import { useMemo } from "react";
import {
  createFeedbackClient,
  describePresence,
  PresenceDot,
  useAgentPages,
  usePresenceClock,
  type AgentPageStatus,
  type AgentPresence,
  type PresenceDescription,
} from "studio/feedback";
import { SidebarLink, type SidebarRenderContext } from "studio/shell";
import type { Bucket, Status, StudioAppPage, Surface } from "@/studio/studioRegistry";

export const AGENT_PAGES_HREF_PREFIX = "/studio/agents/";
/** Everything across agent pages that waits on the reviewer. */
export const AGENT_INBOX_HREF = "/studio/agents";

/** Talks to the host daemon; NEXT_PUBLIC_STUDIO_ID is set by `studio dev`. */
export const feedbackClient = createFeedbackClient({
  studioId: process.env.NEXT_PUBLIC_STUDIO_ID,
});

const STATUS_FOR_AGENT_PAGE: Record<AgentPageStatus, Status> = {
  draft: "wip",
  review: "preview",
  done: "stable",
  archived: "stable",
};

/** Agent pages from the host daemon, shaped as registry pages. */
export function useAgentRegistryPages(): ReadonlyArray<StudioAppPage> {
  const { pages } = useAgentPages(feedbackClient);
  return useMemo(
    () => pages.map((page) => ({
      id: `agent:${page.slug}`,
      href: page.href,
      label: page.title,
      bucket: "agents" as const,
      surface: "runtime" as const,
      status: STATUS_FOR_AGENT_PAGE[page.status],
      blurb: page.blurb ?? (page.owner?.name ? `Published by ${page.owner.name}.` : undefined),
      updatedAt: page.updatedAt,
    })),
    [pages],
  );
}

export function agentSlugFromPath(pathname: string): string | undefined {
  if (!pathname.startsWith(AGENT_PAGES_HREF_PREFIX)) return undefined;
  return pathname.slice(AGENT_PAGES_HREF_PREFIX.length) || undefined;
}

const PRESENCE_RANK = { listening: 0, working: 1, idle: 2 } as const;

/** The most present agent first: listening, then working, then most recently idle. */
export function rankAgents(agents: readonly AgentPresence[], now: number): PresenceDescription[] {
  return agents
    .map((agent) => describePresence(agent, now))
    .sort((a, b) => PRESENCE_RANK[a.state] - PRESENCE_RANK[b.state]);
}

/**
 * Status bar: who is listening and what waits on you, e.g. "atlas listening ·
 * 2 need you". Amber while anything needs you. Without a host daemon (the
 * static site) it stays the shell's quiet "Ready".
 */
export function useAgentStatus(): { label: string; color: "emerald" | "amber" | "neutral" } {
  const { pages, agents } = useAgentPages(feedbackClient);
  const now = usePresenceClock() || Date.now();
  const needs = pages.reduce((sum, page) => sum + (page.attention?.needsYou ?? 0), 0);
  const ranked = rankAgents(agents, now);
  const listening = ranked.filter((agent) => agent.state === "listening");
  const lead = ranked[0];
  const parts: string[] = [];
  if (listening.length > 1) parts.push(`${listening.length} agents listening`);
  else if (lead) parts.push(`${lead.name} ${lead.label}`);
  if (needs > 0) parts.push(`${needs} need${needs === 1 ? "s" : ""} you`);
  if (parts.length === 0) return { label: "Ready", color: "emerald" };
  return {
    label: parts.join(" · "),
    color: needs > 0 ? "amber" : listening.length > 0 ? "emerald" : "neutral",
  };
}

/** Sidebar section: the inbox, then agent pages newest first, or how to get the first one. */
export function AgentPagesNav({
  pathname,
  registry,
  extraPages,
}: SidebarRenderContext<Bucket, Surface, Status>) {
  const { status, pages: summaries } = useAgentPages(feedbackClient);
  const now = usePresenceClock() || Date.now();
  const pages = [...registry.pagesIn("agents", extraPages)].sort(
    (a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  if (pages.length === 0) {
    return (
      <p className="px-2 text-[11px] leading-relaxed text-studio-ink-faint">
        {status === "offline"
          ? "Host daemon offline. Run studio dev."
          : "None yet. Run `studio mcp` and connect your agent."}
      </p>
    );
  }
  const totalNeeds = summaries.reduce((sum, page) => sum + (page.attention?.needsYou ?? 0), 0);
  return (
    <div className="flex flex-col">
      <SidebarLink href={AGENT_INBOX_HREF} active={pathname === AGENT_INBOX_HREF}>
        <span className="flex-1 truncate">Inbox</span>
        <NeedsBadge count={totalNeeds} />
      </SidebarLink>
      {pages.map((page) => {
        const summary = summaries.find((entry) => entry.href === page.href);
        const presence = summary?.presence ? describePresence(summary.presence, now) : undefined;
        const needs = summary?.attention?.needsYou ?? 0;
        return (
          <SidebarLink key={page.href} href={page.href} active={page.href === pathname}>
            <span
              className="flex w-3 shrink-0 justify-center"
              title={presence ? `${presence.name} ${presence.label}` : "No agent connected"}
            >
              <PresenceDot state={presence?.state ?? "none"} />
            </span>
            <span className="flex-1 truncate">{page.label}</span>
            <NeedsBadge count={needs} label={needsLabel(summary?.attention?.items.map((item) => item.kind) ?? [])} />
          </SidebarLink>
        );
      })}
    </div>
  );
}

function NeedsBadge({ count, label }: { count: number; label?: string }) {
  if (count === 0) return null;
  return (
    <span
      title={label}
      className="min-w-[18px] rounded-full bg-amber-300/90 px-1.5 text-center font-mono text-[10px] leading-[16px] text-black/80"
    >
      {count}
    </span>
  );
}

const NOUNS: Record<string, [string, string]> = {
  question: ["question", "questions"],
  reply: ["reply", "replies"],
  chat: ["chat message", "chat messages"],
};

/** "2 questions, 1 reply", for the badge's tooltip and the inbox. */
export function needsLabel(kinds: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, n]) => `${n} ${(NOUNS[kind] ?? [kind, kind])[n === 1 ? 0 : 1]}`)
    .join(", ");
}
