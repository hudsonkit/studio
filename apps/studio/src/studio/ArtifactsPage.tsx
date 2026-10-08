"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CornerDownLeft,
  Hammer,
  Inbox,
  Lock,
  MessageSquare,
  Reply,
  Send,
  WifiOff,
  RefreshCw,
  Repeat,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useStudioRouter } from "studio/router";
import { artifactStudies } from "@/studio/artifactStudies";
import { pages, type StudioAppPage } from "@/studio/studioRegistry";

export const ARTIFACTS_GUIDE_URL = "https://hudsonkit.com/studio/docs/docs/claude-artifacts.html";

const eyebrow = "font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint";
const sectionHeading = `flex items-center gap-2 ${eyebrow}`;

type Lane = "artifact" | "agent" | "studio";

const LANES: { id: Lane; label: string; hint: string }[] = [
  { id: "artifact", label: "claude.ai", hint: "the artifact" },
  { id: "agent", label: "your agent", hint: "the only thing that crosses" },
  { id: "studio", label: "Studio", hint: "your repo" },
];

const LOOP: { icon: ReactNode; lane: Lane; title: string; detail: string; chip: string }[] = [
  {
    icon: <Hammer size={14} />,
    lane: "studio",
    title: "Build",
    detail: "The study, React, CSS and fonts become one HTML page that needs no network.",
    chip: "cli.ts build --all",
  },
  {
    icon: <Send size={14} />,
    lane: "agent",
    title: "Publish",
    detail: "Your agent publishes it as a private artifact and records the link.",
    chip: "artifact_sync_plan",
  },
  {
    icon: <MessageSquare size={14} />,
    lane: "artifact",
    title: "Comment",
    detail: "Reviewers comment on the study itself, without cloning anything.",
    chip: "claude.ai/artifact/…",
  },
  {
    icon: <Inbox size={14} />,
    lane: "agent",
    title: "Import",
    detail: "Comments land as threads on the study. Duplicates and Claude's own replies are skipped.",
    chip: "artifact_import_comments",
  },
  {
    icon: <Reply size={14} />,
    lane: "studio",
    title: "Reply",
    detail: "You answer in Studio, next to the source the comment is about.",
    chip: "Studio feedback",
  },
  {
    icon: <CornerDownLeft size={14} />,
    lane: "agent",
    title: "Mirror back",
    detail: "The reply is posted to the same artifact thread, where the reviewer asked.",
    chip: "artifact_mark_mirrored",
  },
];

const LANE_ROW: Record<Lane, number> = { artifact: 1, agent: 2, studio: 3 };

const GUARANTEES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Lock size={15} />,
    title: "Private by default",
    body: "Only you can see an artifact until you share it. Links live in the gitignored .studio/artifacts/, never in the repo.",
  },
  {
    icon: <WifiOff size={15} />,
    title: "The host stays offline",
    body: "Studio never calls claude.ai. It keeps the bookkeeping and hands your agent a plan; the agent's Artifact tools publish.",
  },
  {
    icon: <RefreshCw size={15} />,
    title: "Republish on change",
    body: "Each build hashes the study's sources. When they change, the study goes back out to the same link.",
  },
];

export function ArtifactsPage({ page }: { page: StudioAppPage }) {
  const { Link } = useStudioRouter();
  const shared = artifactStudies.map((study) => ({
    study,
    page: pages.find((entry) => entry.id === (study.page ?? study.id) || entry.href === study.page || entry.href.endsWith(`/${study.id}`)),
  }));

  return (
    <main className="w-full px-6 py-10 lg:px-7">
      <div className="max-w-[1180px]">
        {/* ── Hero ─────────────────────────────────────────────── */}
        <header className="grid items-center gap-10 border-b border-studio-rule pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <div>
            <div className={eyebrow}>
              {page.bucket} / {page.surface}
            </div>
            <h1 className="mt-4 text-[44px] font-light leading-tight text-studio-ink-strong">
              Share the study.
              <br />
              <span className="text-studio-ink-faint">Keep the conversation.</span>
            </h1>
            <p className="mt-5 max-w-[54ch] text-[15px] leading-[1.7] text-studio-ink">
              Most reviewers don&apos;t have your repo running. Studio turns any study into one
              self-contained page, your agent publishes it as a private Claude artifact, and every
              comment left there comes home as feedback on the study. Your replies go back to the
              same thread.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a
                href={ARTIFACTS_GUIDE_URL}
                className="group inline-flex items-center gap-2 rounded-md border border-studio-rule px-4 py-2 text-[13px] text-studio-ink-strong transition-colors hover:bg-studio-chip-bg"
              >
                Read the guide <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <span className="text-[12px] text-studio-ink-faint">
                {artifactStudies.length} {artifactStudies.length === 1 ? "study" : "studies"} shared · one HTML file each · no network
              </span>
            </div>
          </div>

          <ConversationPair />
        </header>

        {/* ── The loop, in lanes ───────────────────────────────── */}
        <section className="py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className={sectionHeading}>
              <Repeat size={14} /> The loop
            </h2>
              <p className="mt-3 max-w-[60ch] text-[22px] font-light leading-snug text-studio-ink-strong">
                Studio never talks to claude.ai. Your agent carries the work across, both ways.
              </p>
            </div>
          </div>
          <LoopLanes />
        </section>

        {/* ── Shared studies and guarantees ────────────────────── */}
        <section className="grid gap-10 border-t border-studio-rule py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 className={sectionHeading}>
              <Share2 size={14} /> Shared from this studio
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {shared.map(({ study, page: target }) => (
                <li key={study.id}>
                  {target ? (
                    <Link
                      href={target.href}
                      className="group grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-studio-rule p-3 transition-colors hover:bg-studio-chip-bg"
                    >
                      <StudyThumb />
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium text-studio-ink-strong">{target.label}</span>
                        <span className="mt-1 block truncate font-mono text-[11px] text-studio-ink-faint">{study.entry}</span>
                        <span className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-400" /> published
                        </span>
                      </span>
                      <ArrowRight size={16} className="mr-2 text-studio-ink-faint transition-transform group-hover:translate-x-1" />
                    </Link>
                  ) : (
                    <span className="block rounded-md border border-studio-rule p-4 font-mono text-[12px] text-studio-ink">{study.id}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-studio-ink-faint">
              To share another study, add it to{" "}
              <code className="font-mono text-studio-ink">apps/studio/src/studio/artifactStudies.ts</code>.
            </p>
          </div>

          <div>
            <h2 className={sectionHeading}>
              <ShieldCheck size={14} /> What you can count on
            </h2>
            <ul className="mt-5 divide-y divide-studio-rule border-y border-studio-rule">
              {GUARANTEES.map((item) => (
                <li key={item.title} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-4">
                  <span className="grid size-8 place-items-center rounded-full border border-studio-rule text-studio-ink-strong">
                    {item.icon}
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-studio-ink-strong">{item.title}</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-studio-ink">
                      {item.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * The hero picture: the published artifact with reviewer pins, and the same
 * comment as a Studio thread with the reply on its way back.
 */
function ConversationPair() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[520px] pb-24 pr-6 lg:pr-0">
      <div className="overflow-hidden rounded-lg border border-studio-rule bg-studio-canvas">
        <div className="flex items-center gap-2 border-b border-studio-rule px-3 py-2">
          <span className="flex gap-1.5">
            <span className="size-2 rounded-full bg-studio-rule-strong" />
            <span className="size-2 rounded-full bg-studio-rule-strong" />
            <span className="size-2 rounded-full bg-studio-rule-strong" />
          </span>
          <span className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded bg-studio-chip-bg px-2 py-1 font-mono text-[10px] text-studio-ink-faint">
            <Lock size={10} /> claude.ai/artifact/talkie-one-thought
          </span>
          <span className="rounded-full border border-studio-rule px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-studio-ink-faint">
            private
          </span>
        </div>
        <div className="relative h-[210px] bg-[#efe9dd] px-7 pt-8 text-[#1c1a17]">
          <div className="text-[9px] uppercase tracking-[0.16em] text-[#7a6f60]">The distance between noticing and acting</div>
          <div className="mt-3 text-[30px] font-light leading-[1.05] tracking-[-0.01em]">
            One thought,
            <br />
            all the way through.
          </div>
          <div className="mt-5 inline-flex items-center gap-2 bg-[#1c1a17] px-3 py-1.5 text-[10px] text-[#f4efe4]">
            Follow a thought ↓
          </div>
          <Pin className="left-[136px] top-[130px]" n={1} />
          <Pin className="left-[270px] top-[92px]" n={2} />
        </div>
      </div>

      <div className="absolute bottom-0 right-0 w-[78%] rounded-lg border border-studio-rule-strong bg-studio-canvas p-4 shadow-lg lg:-right-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-studio-ink-faint">Studio · thread 1</span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400">
            <Check size={10} /> mirrored
          </span>
        </div>
        <div className="mt-3 flex gap-2.5">
          <Avatar tone="amber">M</Avatar>
          <p className="text-[12.5px] leading-snug text-studio-ink">
            <span className="font-medium text-studio-ink-strong">Maya</span>{" "}Could the button say what happens next?
          </p>
        </div>
        <div className="mt-2.5 flex gap-2.5">
          <Avatar tone="ink">A</Avatar>
          <p className="text-[12.5px] leading-snug text-studio-ink">
            <span className="font-medium text-studio-ink-strong">You</span>{" "}Yes, it now reads &ldquo;Follow a thought&rdquo;. Republished.
          </p>
        </div>
      </div>
    </div>
  );
}

function Pin({ className, n }: { className: string; n: number }) {
  return (
    <span className={`absolute grid size-6 place-items-center rounded-full rounded-bl-none bg-amber-400 font-mono text-[10px] font-semibold text-[#1c1a17] ${className}`}>
      {n}
    </span>
  );
}

function Avatar({ tone, children }: { tone: "amber" | "ink"; children: ReactNode }) {
  const cls = tone === "amber" ? "bg-amber-400 text-[#1c1a17]" : "bg-studio-ink-strong text-studio-canvas";
  return <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${cls}`}>{children}</span>;
}

/**
 * Six steps across three lanes. Agent steps sit on the middle lane, the line
 * between Studio and claude.ai, which is the point: only the agent crosses it.
 */
function LoopLanes() {
  const points = LOOP.map((step, index) => `${((index + 0.5) / LOOP.length) * 100},${(LANE_ROW[step.lane] - 0.5) * (100 / 3)}`).join(" ");

  return (
    <div className="mt-8">
      {/* Wide: lanes */}
      <div className="max-lg:hidden lg:grid lg:grid-cols-[112px_repeat(6,minmax(0,1fr))] lg:grid-rows-[repeat(3,minmax(148px,auto))]">
        {LANES.map((lane) => (
          <div
            key={lane.id}
            className={`col-[1/-1] flex items-start pt-4 ${lane.id === "agent" ? "border-y border-dashed border-studio-rule-strong bg-studio-chip-bg" : ""}`}
            style={{ gridRow: LANE_ROW[lane.id] }}
          >
            <span className="w-[112px] pl-1 pr-3">
              <span className="block text-[13px] font-medium text-studio-ink-strong">{lane.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-studio-ink-faint">{lane.hint}</span>
            </span>
          </div>
        ))}

        <div className="pointer-events-none relative col-[2/-1] row-[1/-1]">
          <svg className="absolute inset-0 h-full w-full text-studio-ink-faint" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity="0.6" />
          </svg>
        </div>

        {LOOP.map((step, index) => (
          <div
            key={step.title}
            className="z-10 flex items-center px-1.5 py-3"
            style={{ gridColumn: index + 2, gridRow: LANE_ROW[step.lane] } as CSSProperties}
          >
            <StepCard step={step} index={index} />
          </div>
        ))}
      </div>

      {/* Narrow: one column with lane tags */}
      <ol className="space-y-3 lg:hidden">
        {LOOP.map((step, index) => (
          <li key={step.title}>
            <StepCard step={step} index={index} showLane />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepCard({ step, index, showLane = false }: { step: (typeof LOOP)[number]; index: number; showLane?: boolean }) {
  const agent = step.lane === "agent";
  return (
    <div
      className={`w-full rounded-md border bg-studio-canvas p-3.5 ${agent ? "border-sky-400/40" : "border-studio-rule"}`}
    >
      <div className="flex items-center gap-2 text-studio-ink-strong">
        <span className="font-mono text-[10px] text-studio-ink-faint">{String(index + 1).padStart(2, "0")}</span>
        <span className={agent ? "text-sky-300" : undefined}>{step.icon}</span>
        <span className="text-[14px] font-medium">{step.title}</span>
        {showLane ? (
          <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.14em] text-studio-ink-faint">
            {LANES.find((lane) => lane.id === step.lane)?.label}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[12.5px] leading-[1.5] text-studio-ink">
        {step.detail}
      </p>
      <code className="mt-2.5 block truncate font-mono text-[10px] text-studio-ink-faint">{step.chip}</code>
    </div>
  );
}

/** A miniature of the shared study, so the list reads as things you can open. */
function StudyThumb() {
  return (
    <span className="relative block h-[60px] overflow-hidden rounded bg-[#efe9dd] px-2 pt-2 text-[#1c1a17]">
      <span className="block text-[11px] font-light leading-[1.05]">
        One thought,
        <br />
        all the way
      </span>
      <span className="absolute bottom-1.5 left-2 h-1.5 w-8 bg-[#1c1a17]" />
    </span>
  );
}
