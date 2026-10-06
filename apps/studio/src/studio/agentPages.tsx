"use client";

import { useMemo } from "react";
import { createFeedbackClient, useAgentPages, type AgentPageStatus } from "studio/feedback";
import { SidebarLink, StatusDot, type SidebarRenderContext } from "studio/shell";
import type { Bucket, Status, StudioAppPage, Surface } from "@/studio/studioRegistry";

export const AGENT_PAGES_HREF_PREFIX = "/studio/agents/";

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

/** Sidebar section: agent pages newest first, or how to get the first one. */
export function AgentPagesNav({
  pathname,
  registry,
  extraPages,
  statusColors,
}: SidebarRenderContext<Bucket, Surface, Status>) {
  const { status } = useAgentPages(feedbackClient);
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
  return (
    <div className="flex flex-col">
      {pages.map((page) => (
        <SidebarLink key={page.href} href={page.href} active={page.href === pathname}>
          <span className="flex-1 truncate">{page.label}</span>
          {page.status ? <StatusDot status={page.status} colors={statusColors} /> : null}
        </SidebarLink>
      ))}
    </div>
  );
}
