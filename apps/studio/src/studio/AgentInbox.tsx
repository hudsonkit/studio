"use client";

import { ArrowRight, CircleHelp, MessageSquare, Reply } from "lucide-react";
import type { ReactNode } from "react";
import {
  AgentPresenceChip,
  formatAge,
  useAgentPages,
  usePresenceClock,
  type AttentionKind,
} from "studio/feedback";
import { useStudioRouter } from "studio/router";
import { feedbackClient, needsLabel } from "@/studio/agentPages";

const eyebrow = "font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint";

const KIND: Record<AttentionKind, { icon: ReactNode; label: string }> = {
  question: { icon: <CircleHelp size={14} />, label: "asks" },
  reply: { icon: <Reply size={14} />, label: "replied" },
  chat: { icon: <MessageSquare size={14} />, label: "said in chat" },
};

/**
 * Everything across agent pages that waits on the reviewer: unanswered
 * questions, threads where the agent spoke last, and chat the agent left open.
 */
export function AgentInbox() {
  const { Link } = useStudioRouter();
  const { status, pages, agents } = useAgentPages(feedbackClient);
  const now = usePresenceClock() || Date.now();
  const items = pages
    .flatMap((page) => (page.attention?.items ?? []).map((item) => ({ ...item, href: page.href })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const withAgents = pages.reduce((sum, page) => sum + (page.attention?.waitingOnAgent ?? 0), 0);

  return (
    <main className="w-full px-6 py-10 lg:px-7">
      <header className="max-w-[980px] border-b border-studio-rule pb-7">
        <div className={eyebrow}>Agent pages / inbox</div>
        <h1 className="mt-4 text-[38px] font-light leading-tight text-studio-ink-strong">
          {items.length === 0 ? "Nothing waits on you." : `${items.length} waiting on you`}
        </h1>
        <p className="mt-3 text-[14px] text-studio-ink">
          {items.length > 0 ? `${needsLabel(items.map((item) => item.kind))}. ` : ""}
          {withAgents > 0
            ? `${withAgents} ${withAgents === 1 ? "thread is" : "threads are"} with the agents.`
            : status === "offline"
              ? "The host daemon is offline. Run studio dev."
              : "Nothing is waiting on the agents either."}
        </p>
        {agents.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {agents.map((agent) => <AgentPresenceChip key={agent.session} presence={agent} />)}
          </div>
        ) : null}
      </header>

      {items.length > 0 ? (
        <ol className="flex max-w-[980px] flex-col gap-3 py-8">
          {items.map((item) => (
            <li key={`${item.slug}:${item.kind}:${item.id}`}>
              <Link
                href={`${item.href}#thread-${item.id}`}
                className="studio-glass studio-glass-interactive group grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-studio-rule px-5 py-4"
              >
                <span className="mt-0.5 text-amber-300">{KIND[item.kind].icon}</span>
                <span className="min-w-0">
                  <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink-faint">
                    {item.author ?? "agent"} {KIND[item.kind].label} · {item.title}
                  </span>
                  <span className="mt-1.5 block text-[15px] leading-snug text-studio-ink-strong">
                    {item.excerpt || "(no text)"}
                  </span>
                </span>
                <span className="flex items-center gap-3 font-mono text-[10px] text-studio-ink-faint">
                  {formatAge(now - Date.parse(item.createdAt))}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
    </main>
  );
}
