"use client";

import { useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  GitBranch,
  MessageSquare,
  Plus,
  Radio,
  Settings,
  Terminal,
} from "lucide-react";
import { DataRow, EngDocSheet } from "studio/doc";
import { CodeViewer } from "studio/code";
import type { StudioAppPage } from "@/studio/studioRegistry";
import "./scoutShellAtoms.css";

/**
 * SCO-PROTO-001 — Scout shell atoms.
 *
 * Prototype-only. Lives entirely under .scout-atoms so the rest of Studio
 * styling is unaffected. The four atoms (elevation, selection, page header,
 * inspector rhythm) are defined as CSS custom properties in
 * scoutShellAtoms.css; the same DOM renders twice — `baseline` (current
 * Scout) vs `prototype` (proposed) — so reviewers can A/B in one frame.
 *
 * Port-back contract (what OpenScout copies):
 *   - 3-step surface elevation: rail / content / inspector
 *   - .scoutSelectionHighlight() solid-lift (no left bar, no white-alpha)
 *   - PageHeader: title + count-chip + trailing actions, fixed 52pt height
 *   - Inspector section: section-gap 20 / label-gap 8 / row-gap 6
 */

type Mode = "baseline" | "prototype";

export function ScoutShellAtomsStudy({ page }: { page: StudioAppPage }) {
  return (
    <main className="w-full px-6 py-10 lg:px-7">
      <StudyHeader page={page} />

      <section className="mt-10 flex flex-col gap-10 max-w-[1100px]">
        <ShellFrame mode="baseline" />
        <ShellFrame mode="prototype" />
      </section>

      <section className="mt-12 max-w-[1100px]">
        <SectionTitle>Token decisions to port back</SectionTitle>
        <TokenTable />
      </section>

      <section className="mt-10 max-w-[1100px]">
        <SectionTitle>scoutShellAtoms.css (canonical token sheet)</SectionTitle>
        <p className="mb-3 text-[12.5px] leading-relaxed text-studio-ink-faint max-w-[72ch]">
          These are CSS custom properties under <code>.scout-atoms</code>.
          OpenScout should mirror the same shape in <code>ScoutThemeColors</code>{" "}
          / <code>ScoutPalette</code>; all values are derived from the existing
          <code> --hud-bg</code> / <code>--hud-ink</code> so they re-resolve per
          theme preset (Paper / Mist / Graphite / Nocturne) and stay
          alpha-tolerant under the Window Material opacity slider.
        </p>
        <CodeViewer
          content={TOKEN_SAMPLE}
          filename="ScoutShellAtoms.tokens.css"
          themeDetection={{ mode: "data-attribute", attr: "data-hudson-theme" }}
        />
      </section>

      <section className="mt-10 max-w-[900px]">
        <SectionTitle>Cross-references</SectionTitle>
        <EngDocSheet>
          <DataRow label="comparison capture">
            docs/artifacts/sco-proto-001/baseline-vs-prototype-dark.png
          </DataRow>
          <DataRow label="full-page capture">
            docs/artifacts/sco-proto-001/full-page-dark.png
          </DataRow>
          <DataRow label="port-back targets">
            apps/macos/Sources/Scout/ScoutTheme.swift · ScoutHUD/HUDChrome.swift ·
            ScoutAgentInspector · ScoutColumnHeader · ScoutCommsView/AgentsTree/ReposView selection
          </DataRow>
        </EngDocSheet>
      </section>
    </main>
  );
}

/* -------------------------------------------------------------- */
/* The shell                                                       */
/* -------------------------------------------------------------- */

function ShellFrame({ mode }: { mode: Mode }) {
  return (
    <div>
      <FrameCaption mode={mode} />
      <div className="scout-atoms" data-mode={mode}>
        <div className="shell">
          <Rail />
          <Content />
          <Inspector />
        </div>
      </div>
    </div>
  );
}

function FrameCaption({ mode }: { mode: Mode }) {
  const meta =
    mode === "baseline"
      ? {
          label: "Baseline · today",
          note: "uniform near-black fill, 2pt accent bar + alpha wash on selection, faint eyebrows",
        }
      : {
          label: "Prototype · proposed",
          note: "3-step elevation, solid-lift selection anchored on the leading dot, readable eyebrows, normalized header",
        };
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <span className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
        {meta.label}
      </span>
      <span className="text-[11.5px] text-studio-ink-faint">{meta.note}</span>
    </div>
  );
}

function Rail() {
  return (
    <div className="shell-rail">
      <RailIcon icon={<MessageSquare size={14} />} />
      <RailIcon icon={<Bot size={14} />} />
      <RailIcon icon={<GitBranch size={14} />} active />
      <RailIcon icon={<Terminal size={14} />} />
      <div className="shell-rail-spacer" />
      <RailIcon icon={<Settings size={14} />} />
    </div>
  );
}

function RailIcon({ icon, active }: { icon: ReactNode; active?: boolean }) {
  return <div className="rail-icon" data-active={active ? "true" : "false"}>{icon}</div>;
}

/* -------------------------------------------------------------- */
/* Content (normalized page header + agent list)                   */
/* -------------------------------------------------------------- */

const ROWS = [
  { id: "action",         name: "action",         status: "warn" as const, branch: "main",   touched: "+2,639 / −287",  agents: "1 idle" },
  { id: "hudsonos",       name: "hudsonos",       status: "live" as const, branch: "main",   touched: "+19 / −36",     agents: "1 live" },
  { id: "missionwriter",  name: "missionwriter",  status: "live" as const, branch: "master", touched: "+1,140 / −48",  agents: "2 idle" },
  { id: "narrative-studio", name: "narrative-studio", status: "live" as const, branch: "main", touched: "+600 / −238", agents: "1 live" },
  { id: "openscout",      name: "openscout",      status: "live" as const, branch: "main",   touched: "+4,576 / −3,306", agents: "218 idle" },
  { id: "lattices",       name: "lattices",       status: "idle" as const, branch: "main",   touched: "—",              agents: "16 idle" },
];

function Content() {
  const [selectedId, setSelectedId] = useState("action");
  const [filter, setFilter] = useState<"all" | "live">("all");

  return (
    <div className="shell-content">
      <PageHeader
        title="Repos"
        count="6 REPOS"
        actions={
          <>
            <div className="action-segmented">
              <button
                type="button"
                data-active={filter === "all" ? "true" : "false"}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                type="button"
                data-active={filter === "live" ? "true" : "false"}
                onClick={() => setFilter("live")}
              >
                Live
              </button>
            </div>
            <button type="button" className="action-button">
              <Radio size={12} />
              Refresh
            </button>
            <button type="button" className="action-button">
              <Plus size={12} />
              New
            </button>
          </>
        }
      />

      <div className="list">
        <div className="list-col-headers">
          <span />
          <span>Repo · Branch</span>
          <span style={{ textAlign: "right" }}>Agents</span>
        </div>
        {ROWS.map((row) => (
          <Row
            key={row.id}
            row={row}
            selected={row.id === selectedId}
            onSelect={() => setSelectedId(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PageHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <span className="page-header-title">{title}</span>
      {count ? <span className="count-chip">{count}</span> : null}
      <div className="page-header-spacer" />
      {actions ? <div className="action-group">{actions}</div> : null}
    </header>
  );
}

function Row({
  row,
  selected,
  onSelect,
}: {
  row: (typeof ROWS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="row"
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      style={{ width: "100%", textAlign: "left", border: 0 }}
    >
      <span className={`row-dot row-status-${row.status}`} />
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <ChevronRight size={11} style={{ opacity: 0.45, flexShrink: 0 }} />
        <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {row.name}
        </span>
        <span
          style={{
            fontFamily: "var(--studio-font-mono)",
            fontSize: 10.5,
            color: "color-mix(in oklab, var(--hud-ink) 55%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          ./{row.branch}
        </span>
        <span
          style={{
            fontFamily: "var(--studio-font-mono)",
            fontSize: 10.5,
            color: row.touched.startsWith("+") ? "var(--hud-status-ok)" : "color-mix(in oklab, var(--hud-ink) 45%, transparent)",
            whiteSpace: "nowrap",
          }}
        >
          {row.touched}
        </span>
      </span>
      <span className="row-meta">{row.agents}</span>
    </button>
  );
}

/* -------------------------------------------------------------- */
/* Inspector (normalized section rhythm)                           */
/* -------------------------------------------------------------- */

function Inspector() {
  return (
    <aside className="shell-inspector">
      <div className="inspector-header">
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--scout-eyebrow-fg)",
          }}
        >
          Repo
        </span>
        <div style={{ flex: 1 }} />
        <span className="attention-pill">● Attention</span>
      </div>

      <div className="inspector-body">
        <div className="inspector-section">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--hud-status-warn)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--hud-ink)" }}>action</span>
          </div>
          <span style={{ fontSize: 11, fontFamily: "var(--studio-font-mono)", color: "color-mix(in oklab, var(--hud-ink) 55%, transparent)" }}>
            /Users/arach/dev/action
          </span>
        </div>

        <Section eyebrow="Why">
          <div style={{ fontSize: 12, color: "var(--hud-ink)" }}>· Dirty main</div>
        </Section>

        <Section eyebrow="Worktrees">
          <KV label="Total" value="1" />
          <KV label="Dirty" value="1" />
        </Section>

        <Section eyebrow="Changes">
          <KV label="Staged" value="0" />
          <KV label="Unstaged" value="17" />
          <KV label="Untracked" value="44" />
        </Section>

        <Section eyebrow="Activity · Context · 74%">
          <div className="stat-grid">
            <Stat value="1" label="Turns" />
            <Stat value="31" label="Tools" />
            <Stat value="0" label="Edits" />
          </div>
          <div className="context-bar" style={{ marginTop: 8 }}>
            <div className="context-bar-fill" style={{ width: "74%" }} />
          </div>
        </Section>

        <Section eyebrow="Runtime">
          <dl className="kv-grid">
            <dt>Harness</dt><dd>codex</dd>
            <dt>Branch</dt><dd>main</dd>
            <dt>Transport</dt><dd>codex_app_server</dd>
            <dt>Role</dt><dd>Relay agent</dd>
          </dl>
        </Section>
      </div>
    </aside>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="inspector-section">
      <span className="eyebrow">{eyebrow}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--scout-inspector-row-gap)" }}>
        {children}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
      <span style={{ color: "color-mix(in oklab, var(--hud-ink) 60%, transparent)" }}>{label}</span>
      <span style={{ color: "var(--hud-ink)", fontFamily: "var(--studio-font-mono)" }}>{value}</span>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Headers, doc bits                                               */
/* -------------------------------------------------------------- */

function StudyHeader({ page }: { page: StudioAppPage }) {
  return (
    <header className="max-w-[980px] border-b border-studio-rule pb-7">
      <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
        {page.bucket} / {page.surface}
      </div>
      <h1 className="mt-4 text-[34px] font-medium leading-tight text-studio-ink-strong">
        {page.label}
      </h1>
      <p
        className="mt-4 max-w-[68ch] text-[15px] leading-[1.7] text-studio-ink"
        style={{ fontFamily: "var(--studio-font-serif)" }}
      >
        Prototype the four shared Scout shell atoms — surface elevation,
        unified selected-row, normalized page header, inspector section
        rhythm — in Studio before they get ported back into the
        SwiftUI <code>ScoutTheme</code> / <code>ScoutColumnHeader</code> /
        <code> ScoutAgentInspector</code> stack. Same DOM renders twice
        (baseline vs prototype) for fair A/B.
      </p>
    </header>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
      <ChevronDown size={11} />
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- */
/* Token decisions table                                           */
/* -------------------------------------------------------------- */

const TOKEN_ROWS: Array<{
  atom: string;
  token: string;
  value: string;
  port: string;
}> = [
  {
    atom: "Elevation",
    token: "--scout-surface-rail",
    value: "mix(--hud-bg 96%, black 4%)",
    port: "ScoutSurface.rail",
  },
  {
    atom: "Elevation",
    token: "--scout-surface-content",
    value: "--hud-bg (baseline)",
    port: "ScoutSurface.content",
  },
  {
    atom: "Elevation",
    token: "--scout-surface-inspector",
    value: "mix(--hud-bg 94%, --hud-ink 6%)",
    port: "ScoutSurface.inspector",
  },
  {
    atom: "Elevation",
    token: "--scout-surface-divider",
    value: "mix(--hud-ink 14%, transparent)",
    port: "ScoutPalette.surfaceDivider",
  },
  {
    atom: "Selection",
    token: "--scout-row-selected-bg",
    value: "mix(content 90%, --hud-ink 10%)",
    port: ".scoutSelectionHighlight() solid lift, no left bar, no white-alpha",
  },
  {
    atom: "Selection",
    token: "row[selected] .row-dot",
    value: "--scout-accent + 3pt halo",
    port: "Anchor selection on leading status dot (R2)",
  },
  {
    atom: "Page header",
    token: "--scout-header-height",
    value: "52px (matches existing ScoutColumnHeader 64pt minus title slack)",
    port: "ScoutColumnHeader fixed height",
  },
  {
    atom: "Page header",
    token: "--scout-header-title-size / weight",
    value: "14px / 600",
    port: "One title scale across all surfaces (R3)",
  },
  {
    atom: "Page header",
    token: ".count-chip",
    value: "uppercase mono 9.5px / chip-bg / no accent",
    port: "Canonical count chip — replaces 98 AGENTS / 32 logs · 61 procs / Action",
  },
  {
    atom: "Inspector rhythm",
    token: "--scout-inspector-section-gap",
    value: "20px",
    port: "One token across Agents / Repos / Comms inspectors (R4)",
  },
  {
    atom: "Inspector rhythm",
    token: "--scout-inspector-label-gap",
    value: "8px",
    port: "Eyebrow → content spacing",
  },
  {
    atom: "Inspector rhythm",
    token: "--scout-inspector-row-gap",
    value: "6px",
    port: "KV row spacing inside a section",
  },
  {
    atom: "Eyebrow",
    token: "--scout-eyebrow-fg",
    value: "mix(--hud-ink 62%, transparent)",
    port: "HUDEyebrow default — lift off .inkFaint (R1)",
  },
];

function TokenTable() {
  return (
    <div className="overflow-hidden border border-studio-rule">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-studio-rule bg-studio-chip-bg/40 text-left font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
            <th className="py-2.5 px-3 w-[110px]">Atom</th>
            <th className="py-2.5 px-3 w-[260px]">Token</th>
            <th className="py-2.5 px-3 w-[280px]">Value</th>
            <th className="py-2.5 px-3">Port back into</th>
          </tr>
        </thead>
        <tbody>
          {TOKEN_ROWS.map((row, i) => (
            <tr
              key={`${row.atom}-${row.token}-${i}`}
              className="border-b border-studio-rule last:border-b-0 align-top"
            >
              <td className="py-2 px-3 font-mono text-[10.5px] uppercase tracking-eyebrow text-studio-ink-faint">
                {row.atom}
              </td>
              <td className="py-2 px-3 font-mono text-[11px] text-studio-ink-strong">
                {row.token}
              </td>
              <td className="py-2 px-3 font-mono text-[11px] text-studio-ink">
                {row.value}
              </td>
              <td className="py-2 px-3 text-[12px] text-studio-ink">{row.port}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOKEN_SAMPLE = `.scout-atoms {
  /* Surface elevation — 3 deliberate luminance steps off the canvas. */
  --scout-surface-rail:      color-mix(in oklab, var(--hud-bg) 96%, black 4%);
  --scout-surface-content:   var(--hud-bg);
  --scout-surface-inspector: color-mix(in oklab, var(--hud-bg) 94%, var(--hud-ink) 6%);
  --scout-surface-divider:   color-mix(in oklab, var(--hud-ink) 14%, transparent);

  /* Selection — solid same-hue lift, no left bar, no white-alpha. */
  --scout-row-selected-bg:    color-mix(in oklab, var(--scout-surface-content) 90%, var(--hud-ink) 10%);
  --scout-row-selected-stroke:color-mix(in oklab, var(--hud-ink) 18%, transparent);
  --scout-row-hover-bg:       color-mix(in oklab, var(--scout-surface-content) 95%, var(--hud-ink) 5%);

  /* Page header — one title scale, one chip, one action lane. */
  --scout-header-title-size:  14px;
  --scout-header-title-weight:600;
  --scout-header-height:      52px;
  --scout-header-pad-x:       16px;

  /* Count chip — canonical "98 AGENTS" pill. */
  --scout-chip-bg:     color-mix(in oklab, var(--hud-ink) 8%, transparent);
  --scout-chip-border: color-mix(in oklab, var(--hud-ink) 14%, transparent);
  --scout-chip-fg:     color-mix(in oklab, var(--hud-ink) 78%, transparent);

  /* Inspector section rhythm — one set of spacing tokens across all inspectors. */
  --scout-inspector-section-gap: 20px;
  --scout-inspector-label-gap:    8px;
  --scout-inspector-row-gap:      6px;
  --scout-inspector-pad-x:       16px;
  --scout-inspector-pad-y:       16px;

  /* Eyebrows — lift off .inkFaint (R1). Hierarchy via size+weight+tracking. */
  --scout-eyebrow-fg:      color-mix(in oklab, var(--hud-ink) 62%, transparent);
  --scout-eyebrow-size:    9px;
  --scout-eyebrow-tracking:0.18em;
}
`;
