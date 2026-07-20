import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  FileText,
  Github,
  PanelsTopLeft,
  Workflow,
} from "lucide-react";

const journeys = [
  { label: "Discover", pages: ["Entry", "Context", "Decision"] },
  { label: "Create", pages: ["Draft", "Review", "Ship"], active: 1 },
  { label: "Return", pages: ["Activity", "Follow-up"] },
];

export default function RootPage() {
  return (
    <main className="studio-landing min-h-screen bg-studio-canvas text-studio-ink">
      <nav className="border-b border-studio-rule">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-3 text-studio-ink-strong"
          >
            <span className="grid h-6 w-6 grid-cols-2 gap-[2px]">
              <i className="bg-studio-ink-strong" />
              <i className="border border-studio-rule-strong" />
              <i className="border border-studio-rule-strong" />
              <i className="bg-studio-ink-strong" />
            </span>
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em]">
              Studio
            </span>
          </Link>

          <div className="flex items-center gap-5">
            <a
              href="https://github.com/arach/studio"
              className="text-studio-ink-faint transition-colors hover:text-studio-ink-strong"
              aria-label="Studio on GitHub"
            >
              <Github size={16} strokeWidth={1.7} />
            </a>
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-studio-ink-strong"
            >
              Open Studio
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto grid max-w-[1180px] gap-14 px-6 pb-24 pt-20 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:pb-32 lg:pt-28">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-studio-ink-faint">
            A local space for product thinking
          </p>
          <h1 className="mt-6 max-w-[700px] text-[52px] font-medium leading-[0.98] tracking-[-0.055em] text-studio-ink-strong sm:text-[68px] lg:text-[72px]">
            See the whole product. Work the details.
          </h1>
          <p className="mt-7 max-w-[49ch] text-[16px] leading-7 text-studio-ink sm:text-[17px]">
            Studio brings product flows, live interface studies, and the
            decisions behind them into one place beside your code.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/studio"
              className="inline-flex h-12 items-center gap-3 bg-studio-ink-strong px-5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-studio-canvas transition-transform hover:-translate-y-0.5"
            >
              Open Studio
              <ArrowRight size={14} />
            </Link>
            <a
              href="https://github.com/arach/studio"
              className="inline-flex h-12 items-center gap-3 border border-studio-rule-strong px-5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-studio-ink-strong transition-colors hover:bg-studio-chip-bg"
            >
              View source
              <Github size={14} />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-studio-rule pt-5 font-mono text-[9px] uppercase tracking-[0.16em] text-studio-ink-faint">
            <span>Local-first</span>
            <span>Repo-native</span>
            <span>Built on Hudson</span>
          </div>
        </div>

        <FlowPreview />
      </section>

      <section className="border-y border-studio-rule bg-studio-surface/70">
        <div className="mx-auto grid max-w-[1180px] px-6 md:grid-cols-3">
          <Capability
            icon={<Workflow size={17} />}
            index="01"
            title="Map the experience"
          >
            Lay out whole journeys on a spatial canvas and keep every screen in
            context.
          </Capability>
          <Capability
            icon={<PanelsTopLeft size={17} />}
            index="02"
            title="Make it real"
          >
            Put live product surfaces on the map instead of stopping at static
            mockups.
          </Capability>
          <Capability
            icon={<FileText size={17} />}
            index="03"
            title="Keep the why"
          >
            Store proposals, notes, and source references next to the work they
            shape.
          </Capability>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 py-24 lg:py-32">
        <div className="grid gap-10 border border-studio-rule-strong bg-studio-surface p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center lg:p-14">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-studio-ink-faint">
              One address per product
            </p>
            <h2 className="mt-4 max-w-[760px] text-[32px] font-medium leading-[1.1] tracking-[-0.035em] text-studio-ink-strong sm:text-[42px]">
              It runs beside the repo and stays close to the work.
            </h2>
            <p className="mt-5 max-w-[58ch] text-[15px] leading-7 text-studio-ink">
              Give any project a stable local Studio without remembering ports
              or building another design system around it.
            </p>
          </div>
          <div className="min-w-0 border border-studio-rule-strong bg-studio-canvas p-5 lg:min-w-[330px]">
            <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-studio-ink-faint">
              Terminal
            </div>
            <code className="mt-3 block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-studio-ink-strong">
              $ bun run local ensure .
            </code>
            <div className="mt-5 border-t border-studio-rule pt-4 font-mono text-[10px] text-studio-ink-faint">
              your-product.studio.local
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-studio-rule">
        <div className="mx-auto flex min-h-20 max-w-[1180px] flex-col justify-center gap-2 px-6 py-5 font-mono text-[9px] uppercase tracking-[0.16em] text-studio-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <span>Studio — product thinking with somewhere to live</span>
          <span>Open source · local-first</span>
        </div>
      </footer>
    </main>
  );
}

function FlowPreview() {
  return (
    <div className="landing-preview-shell relative overflow-hidden border border-studio-rule-strong bg-studio-surface shadow-[0_32px_80px_rgba(31,36,32,0.08)]">
      <div className="flex h-11 items-center justify-between border-b border-studio-rule px-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-studio-ink-faint">
          Studio Flows
        </span>
        <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-studio-ink-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4f8569]" />
          Live
        </div>
      </div>

      <div className="grid min-h-[440px] grid-cols-[96px_1fr] sm:grid-cols-[116px_1fr]">
        <aside className="border-r border-studio-rule bg-studio-canvas-alt/60 px-3 py-5">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-studio-ink-faint">
            Journeys
          </p>
          <div className="mt-5 space-y-4">
            {journeys.map((journey, index) => (
              <div key={journey.label}>
                <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-[0.1em] text-studio-ink-faint">
                  <span>{journey.label}</span>
                  <span>{journey.pages.length}</span>
                </div>
                <div className="mt-2 h-px bg-studio-rule" />
                {index === 1 ? (
                  <div className="mt-2 border-l border-studio-ink-strong pl-2 text-[9px] text-studio-ink-strong">
                    Review
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        <div className="landing-dot-grid relative overflow-hidden p-5 sm:p-7">
          <div className="absolute right-4 top-4 border border-studio-rule bg-studio-surface/80 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.14em] text-studio-ink-faint backdrop-blur">
            42%
          </div>

          <div className="space-y-9 pt-5">
            {journeys.map((journey) => (
              <div key={journey.label}>
                <div className="mb-2 font-mono text-[7px] uppercase tracking-[0.16em] text-studio-ink-faint">
                  {journey.label}
                </div>
                <div className="flex items-center gap-3">
                  {journey.pages.map((page, index) => (
                    <div key={page} className="contents">
                      <FlowCard label={page} active={journey.active === index} />
                      {index < journey.pages.length - 1 ? (
                        <span className="h-px w-3 shrink-0 bg-studio-rule-strong" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute bottom-4 right-4 flex border border-studio-rule bg-studio-surface/85 font-mono text-[10px] text-studio-ink-faint backdrop-blur">
            <span className="border-r border-studio-rule px-2 py-1">−</span>
            <span className="px-2 py-1">+</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowCard({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className={`landing-flow-card w-[76px] shrink-0 border p-2 sm:w-[94px] ${
        active
          ? "border-studio-ink-strong bg-studio-ink-strong text-studio-canvas"
          : "border-studio-rule-strong bg-studio-surface text-studio-ink"
      }`}
    >
      <div className="font-mono text-[7px] uppercase tracking-[0.1em] opacity-70">
        {label}
      </div>
      <div
        className={`mt-4 h-1 w-3/4 ${active ? "bg-studio-canvas/40" : "bg-studio-rule-strong"}`}
      />
      <div
        className={`mt-1.5 h-1 w-1/2 ${active ? "bg-studio-canvas/20" : "bg-studio-rule"}`}
      />
      <div
        className={`mt-4 h-4 border ${active ? "border-studio-canvas/30" : "border-studio-rule"}`}
      />
    </div>
  );
}

function Capability({
  icon,
  index,
  title,
  children,
}: {
  icon: ReactNode;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="border-b border-studio-rule py-12 last:border-b-0 md:border-b-0 md:border-r md:px-10 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
      <div className="flex items-center justify-between text-studio-ink-faint">
        {icon}
        <span className="font-mono text-[9px] tracking-[0.16em]">{index}</span>
      </div>
      <h2 className="mt-8 text-[21px] font-medium tracking-[-0.02em] text-studio-ink-strong">
        {title}
      </h2>
      <p className="mt-3 max-w-[38ch] text-[14px] leading-6 text-studio-ink">
        {children}
      </p>
    </article>
  );
}
