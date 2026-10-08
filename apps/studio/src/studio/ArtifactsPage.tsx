"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  CornerDownLeft,
  Hammer,
  Inbox,
  Lock,
  MessageSquare,
  Reply,
  Send,
} from "lucide-react";
import { DataRow, EngDocSheet } from "studio/doc";
import { useStudioRouter } from "studio/router";
import { artifactStudies } from "@/studio/artifactStudies";
import { pages, type StudioAppPage } from "@/studio/studioRegistry";

export const ARTIFACTS_GUIDE_URL = "https://hudsonkit.com/studio/docs/docs/claude-artifacts.html";

const prose = { fontFamily: "var(--studio-font-prose)", fontWeight: "var(--studio-font-prose-weight)" };

const LOOP: { icon: ReactNode; who: string; title: string; detail: string; chip: string }[] = [
  {
    icon: <Hammer size={15} />,
    who: "you",
    title: "Build",
    detail: "The study, React, compiled CSS and fonts become one HTML page that renders with no network.",
    chip: "bun src/artifacts/cli.ts build --all",
  },
  {
    icon: <Send size={15} />,
    who: "agent",
    title: "Publish",
    detail: "Your agent publishes the page as a private Claude artifact and records the link.",
    chip: "artifact_sync_plan → artifact_link",
  },
  {
    icon: <MessageSquare size={15} />,
    who: "reviewers",
    title: "Comment",
    detail: "Anyone you share the link with comments on the study itself, without cloning the repo.",
    chip: "claude.ai/artifact/…",
  },
  {
    icon: <Inbox size={15} />,
    who: "agent",
    title: "Import",
    detail: "Comments land as threaded feedback on the study. Duplicates and Claude's own replies are skipped.",
    chip: "artifact_import_comments",
  },
  {
    icon: <Reply size={15} />,
    who: "you",
    title: "Reply in Studio",
    detail: "Answer where the work lives, next to the source the comment is about.",
    chip: "Studio feedback",
  },
  {
    icon: <CornerDownLeft size={15} />,
    who: "agent",
    title: "Mirror back",
    detail: "Replies are posted to the same artifact thread, so the reviewer sees the answer where they asked.",
    chip: "artifact_mark_mirrored",
  },
];

const GUARANTEES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Lock size={14} />,
    title: "Private by default",
    body: "An artifact is visible only to its publisher until they share it. Links live in the gitignored .studio/artifacts/, never in the repo.",
  },
  {
    icon: <Send size={14} />,
    title: "The host stays offline",
    body: "Studio never calls claude.ai. It keeps the bookkeeping and hands your agent a plan; the agent's own Artifact tools do the publishing.",
  },
  {
    icon: <Hammer size={14} />,
    title: "Republish on change",
    body: "Each build hashes the study's sources. When they change, the plan marks the study for republish to the same link.",
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
      <header className="grid max-w-[1100px] gap-8 border-b border-studio-rule pb-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
            {page.bucket} / {page.surface}
          </div>
          <h1 className="mt-4 max-w-[720px] text-[40px] font-light leading-tight text-studio-ink-strong">
            Share a study as a Claude artifact. Keep the conversation in Studio.
          </h1>
          <p className="mt-5 max-w-[62ch] text-[15px] leading-[1.7] text-studio-ink" style={prose}>
            Most reviewers don&apos;t have your repo running. Studio bundles any study into a
            single self-contained page, your agent publishes it as a private Claude artifact,
            and the comments people leave there come back as feedback on the study.
            Replies you write in Studio go back to the same thread.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={ARTIFACTS_GUIDE_URL}
              className="inline-flex items-center gap-2 border border-studio-rule px-4 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-studio-ink-strong transition-colors hover:bg-studio-chip-bg"
            >
              Read the guide <ArrowRight size={13} />
            </a>
          </div>
        </div>

        <EngDocSheet className="self-start">
          <DataRow label="shared studies">{artifactStudies.length}</DataRow>
          <DataRow label="page">one HTML file</DataRow>
          <DataRow label="network">none needed</DataRow>
          <DataRow label="host → claude.ai">never</DataRow>
          <DataRow label="visibility">private until shared</DataRow>
        </EngDocSheet>
      </header>

      <section className="max-w-[1100px] py-8">
        <SectionLabel>The loop</SectionLabel>
        <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {LOOP.map((step, index) => (
            <li key={step.title} className="studio-glass studio-glass-interactive flex flex-col gap-3 rounded-md border border-studio-rule bg-studio-canvas p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-studio-ink-strong">
                  <span className="font-mono text-[10px] text-studio-ink-faint">{String(index + 1).padStart(2, "0")}</span>
                  {step.icon}
                  <span className="text-[15px] font-medium">{step.title}</span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-studio-ink-faint">{step.who}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-studio-ink" style={prose}>
                {step.detail}
              </p>
              <code className="mt-auto self-start bg-studio-chip-bg px-2 py-1 font-mono text-[11px] text-studio-ink-strong">
                {step.chip}
              </code>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid max-w-[1100px] gap-8 pb-8 lg:grid-cols-[1fr_1fr]">
        <div>
          <SectionLabel>Shared from this studio</SectionLabel>
          <ul className="mt-4 border-y border-studio-rule">
            {shared.map(({ study, page: target }) => (
              <li key={study.id} className="border-b border-studio-rule last:border-b-0">
                {target ? (
                  <Link href={target.href} className="group flex items-center justify-between gap-4 py-4 hover:bg-studio-chip-bg">
                    <span>
                      <span className="block text-[14px] font-medium text-studio-ink-strong">{target.label}</span>
                      <span className="mt-1 block font-mono text-[11px] text-studio-ink-faint">{study.entry}</span>
                    </span>
                    <ArrowRight size={15} className="shrink-0 text-studio-ink-faint transition-transform group-hover:translate-x-1" />
                  </Link>
                ) : (
                  <span className="block py-4 font-mono text-[12px] text-studio-ink">{study.id}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] leading-relaxed text-studio-ink-faint">
            Listed in <code className="font-mono">apps/studio/src/studio/artifactStudies.ts</code>. Add an entry to share another study.
          </p>
        </div>

        <div>
          <SectionLabel>What you can count on</SectionLabel>
          <ul className="mt-4 space-y-5">
            {GUARANTEES.map((item) => (
              <li key={item.title} className="grid grid-cols-[20px_1fr] gap-3">
                <span className="mt-0.5 text-studio-ink-faint">{item.icon}</span>
                <span>
                  <span className="block text-[14px] font-medium text-studio-ink-strong">{item.title}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-studio-ink" style={prose}>
                    {item.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">{children}</h2>
  );
}
