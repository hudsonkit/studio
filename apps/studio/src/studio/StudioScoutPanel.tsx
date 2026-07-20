"use client";

import { ArrowUpRight, CircleDot, MessageSquareText } from "lucide-react";
import { DataRow, EngDocSheet } from "studio/doc";
import { useStudioScout } from "@/studio/StudioScoutProvider";

export function StudioScoutPanel() {
  const { connection, loading, openScout, refreshConnection } = useStudioScout();
  const connected = connection?.connected === true;

  return (
    <section className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="border border-studio-rule bg-studio-surface p-6 sm:p-8">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
          studio / scout
        </div>
        <h2 className="mt-3 max-w-xl text-[26px] font-medium leading-tight text-studio-ink-strong">
          Bring the page with you when you talk to Scout.
        </h2>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-studio-ink">
          The Scout drawer is available throughout Studio. It carries the current page, selected
          text, and any notes you add into Scout’s native composer—along with its agent picker and
          capture tools.
        </p>
        <button
          type="button"
          onClick={openScout}
          className="mt-6 inline-flex items-center gap-2 border border-studio-ink-strong bg-studio-ink-strong px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-studio-canvas transition hover:opacity-85"
        >
          Open Scout drawer
          <MessageSquareText size={13} />
        </button>
      </div>

      <EngDocSheet className="self-start">
        <div className="flex items-center justify-between border-b border-studio-rule px-4 py-3 sm:px-6">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-eyebrow text-studio-ink-faint">
            Scout connection
          </span>
          <button
            type="button"
            onClick={() => void refreshConnection()}
            className="font-mono text-[9px] uppercase tracking-[0.12em] text-studio-ink-faint hover:text-studio-ink-strong"
          >
            Refresh
          </button>
        </div>
        <DataRow label="status">
          <span className="inline-flex items-center gap-2">
            <CircleDot size={12} className={connected ? "text-scout-accent" : "text-studio-ink-faint"} />
            {loading ? "Checking" : connected ? "Connected" : "Unavailable"}
          </span>
        </DataRow>
        <DataRow label="identity">{connection?.identity?.label ?? "—"}</DataRow>
        <DataRow label="selector">
          <span className="font-mono text-[11px]">
            {connection?.identity ? `@${connection.identity.selector.replace(/^@/, "")}` : "—"}
          </span>
        </DataRow>
        {connection?.webBaseUrl ? (
          <a
            href={connection.webBaseUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between border-t border-studio-rule px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-studio-ink-faint transition hover:text-studio-ink-strong sm:px-6"
          >
            Open Scout
            <ArrowUpRight size={12} />
          </a>
        ) : null}
      </EngDocSheet>
    </section>
  );
}
