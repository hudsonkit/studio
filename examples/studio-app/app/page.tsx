import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Code2, FileText, Layers3 } from "lucide-react";

const studioSections = [
  { label: "Foundations", count: "2" },
  { label: "Proposals", count: "1" },
  { label: "Package", count: "9", active: true },
  { label: "Studies", count: "3" },
];

export default function RootPage() {
  return (
    <main className="studio-landing min-h-screen bg-studio-canvas text-studio-ink">
      <nav className="border-b border-studio-rule-strong">
        <div className="mx-auto flex h-18 max-w-[1200px] items-center justify-between px-6">
          <Link
            href="/"
            className="font-mono text-[12px] font-medium uppercase tracking-[0.2em] text-studio-ink-strong"
          >
            Studio / A-01
          </Link>
          <Link
            href="/studio"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-studio-ink-strong transition-opacity hover:opacity-60"
          >
            Open Studio
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      <section className="landing-hero-grid mx-auto grid max-w-[1200px] px-6 pb-24 pt-12 lg:items-start">
        <div className="landing-frame landing-sheet landing-sheet--paper relative h-[480px] border border-studio-rule-strong p-6">
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
            Sheet 01 / Premise
          </div>
          <h1 className="mt-6 max-w-[620px] text-[48px] font-medium leading-[1.125] tracking-[-0.035em] text-studio-ink-strong sm:text-[60px] lg:text-[64px]">
            Give product thinking a place to live.
          </h1>
          <p
            className="mt-6 max-w-[54ch] text-[16px] leading-6 text-studio-ink"
            style={{ fontFamily: "var(--studio-font-serif)" }}
          >
            Studio keeps design notes, proposals, and working UI studies beside
            the code they shape. It runs locally and stays specific to the
            product.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/studio"
              className="inline-flex h-12 items-center gap-2 border border-studio-ink-strong bg-studio-chip-bg px-5 font-mono text-[11px] uppercase tracking-wider text-studio-ink-strong transition-colors hover:bg-studio-surface"
            >
              Enter Studio
              <ArrowRight size={14} />
            </Link>
            <Link
              href="/studio/recipes/adoption"
              className="inline-flex h-12 items-center gap-2 border border-dashed border-studio-rule-strong px-5 font-mono text-[11px] uppercase tracking-wider text-studio-ink-strong transition-colors hover:bg-studio-chip-bg"
            >
              Add it to a repo
            </Link>
          </div>
        </div>

        <StudioPreview />
      </section>

      <section className="border-y border-studio-rule-strong bg-studio-canvas-alt">
        <div className="mx-auto grid min-h-[408px] max-w-[1200px] px-6 lg:grid-cols-2">
          <LandingPoint
            sheet="03A"
            icon={<FileText size={16} />}
            title="Make the argument"
            body="Keep the reasoning, references, and decisions close enough to change with the product."
          >
            <DecisionNotePreview />
          </LandingPoint>
          <LandingPoint
            sheet="03B"
            icon={<Code2 size={16} />}
            title="Try it for real"
            body="Render live studies inside the product surface instead of stopping at a static mockup."
          >
            <LiveStudyPreview />
          </LandingPoint>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="landing-frame landing-sheet landing-sheet--paper grid min-h-[336px] gap-12 border border-studio-rule-strong p-12 lg:grid-cols-[480px_1fr] lg:items-center">
          <LocalFlowDiagram />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
              Sheet 04 / Local address
            </div>
            <h2 className="mt-6 max-w-[600px] text-[30px] font-medium leading-tight tracking-[-0.02em] text-studio-ink-strong sm:text-[36px]">
              Every product gets its own Studio at a stable local address.
            </h2>
            <code className="mt-6 block w-fit border border-dashed border-studio-rule-strong bg-studio-canvas px-4 py-3 font-mono text-[12px] text-studio-ink">
              your-product.studio.local
            </code>
          </div>
        </div>
      </section>

      <footer className="border-t border-studio-rule-strong">
        <div className="mx-auto flex h-18 max-w-[1200px] items-center justify-between px-6 font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
          <span>Studio</span>
          <span>Built on Hudson</span>
        </div>
      </footer>
    </main>
  );
}

function StudioPreview() {
  return (
    <div className="landing-frame relative">
      <div className="absolute -top-6 left-0 font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
        Detail 02 / Working surface
      </div>
      <div className="absolute -top-6 right-0 font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
        Scale 1:1 / NTS
      </div>
      <div className="landing-sheet landing-sheet--glass h-[480px] overflow-hidden border border-studio-rule-strong">
      <div className="flex h-12 items-center justify-between border-b border-studio-rule-strong px-6">
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-studio-ink-faint opacity-40" />
          <span className="h-1.5 w-1.5 rounded-full bg-studio-ink-faint opacity-40" />
          <span className="h-1.5 w-1.5 rounded-full bg-studio-ink-faint opacity-40" />
        </div>
        <span className="font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
          studio.studio.local
        </span>
        <span className="w-[30px]" />
      </div>

      <div className="grid h-[432px] grid-cols-[144px_1fr]">
        <aside className="border-r border-studio-rule-strong bg-studio-canvas-alt p-4">
          <div className="mb-5 flex items-center gap-2 px-2">
            <Layers3 size={13} className="text-studio-ink-faint" />
            <span className="font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
              Registry
            </span>
          </div>
          <div className="space-y-1">
            {studioSections.map((section) => (
              <div
                key={section.label}
                className={`flex items-center justify-between px-2 py-2 text-[11px] ${
                  section.active
                    ? "border border-dashed border-studio-rule-strong bg-studio-chip-bg text-studio-ink-strong"
                    : "text-studio-ink-faint"
                }`}
              >
                <span>{section.label}</span>
                <span className="font-mono text-[9px]">{section.count}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="p-6">
          <div className="font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
            Package / Registry
          </div>
          <h3 className="mt-3 text-[24px] font-medium tracking-[-0.02em] text-studio-ink-strong sm:text-[28px]">
            Typed page registry
          </h3>
          <p className="mt-3 max-w-[42ch] text-[12px] leading-relaxed text-studio-ink-faint sm:text-[13px]">
            Pages, studies, source files, and insertion points in one product-owned map.
          </p>

          <div className="mt-7 border-y border-dashed border-studio-rule-strong">
            {[
              ["Surface", "API"],
              ["Status", "Stable"],
              ["Source", "src/registry/index.ts"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid grid-cols-[72px_1fr] border-b border-dashed border-studio-rule py-3 text-[10px] last:border-b-0 sm:grid-cols-[90px_1fr] sm:text-[11px]"
              >
                <span className="font-mono uppercase tracking-wider text-studio-ink-faint">
                  {label}
                </span>
                <span className="truncate text-studio-ink">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-7 h-16 border border-dashed border-studio-rule-strong bg-studio-canvas-alt p-3">
            <div className="h-1.5 w-2/3 bg-studio-ink-faint opacity-20" />
            <div className="mt-2 h-1.5 w-5/6 bg-studio-ink-faint opacity-10" />
            <div className="mt-2 h-1.5 w-1/2 bg-studio-ink-faint opacity-10" />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function LandingPoint({
  sheet,
  icon,
  title,
  body,
  children,
}: {
  sheet: string;
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="border-studio-rule py-12 lg:border-r lg:border-studio-rule-strong lg:px-12 lg:first:pl-0 lg:last:border-r-0 lg:last:pr-0">
      <div className="text-studio-ink-faint">{icon}</div>
      <div className="mt-5 font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
        {sheet} / Note
      </div>
      <h2 className="mt-2 text-[20px] font-medium text-studio-ink-strong">{title}</h2>
      <p
        className="mt-3 max-w-[46ch] text-[14px] leading-[1.7] text-studio-ink"
        style={{ fontFamily: "var(--studio-font-serif)" }}
      >
        {body}
      </p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function DecisionNotePreview() {
  return (
    <div className="landing-sheet landing-sheet--tint h-36 border border-studio-rule-strong p-4">
      <div className="flex items-center justify-between border-b border-dashed border-studio-rule pb-3 font-mono text-[9px] uppercase tracking-wider text-studio-ink-faint">
        <span>DEC-014 / Navigation density</span>
        <span>Accepted</span>
      </div>
      <div className="mt-4 grid grid-cols-[72px_1fr] gap-y-2 text-[10px]">
        <span className="font-mono uppercase text-studio-ink-faint">Decision</span>
        <span className="text-studio-ink">Keep one persistent rail across product studies.</span>
        <span className="font-mono uppercase text-studio-ink-faint">Source</span>
        <span className="font-mono text-studio-ink">docs/decisions/014.md</span>
      </div>
    </div>
  );
}

function LiveStudyPreview() {
  return (
    <div className="landing-sheet landing-sheet--glass grid h-36 grid-cols-2 border border-studio-rule-strong">
      <div className="border-r border-dashed border-studio-rule p-3">
        <div className="font-mono text-[8px] uppercase tracking-wider text-studio-ink-faint">
          Before
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-2 w-3/4 bg-studio-rule-strong" />
          <div className="h-6 border border-studio-rule" />
          <div className="h-6 border border-studio-rule" />
        </div>
      </div>
      <div className="p-3">
        <div className="font-mono text-[8px] uppercase tracking-wider text-studio-ink-faint">
          Study / Live
        </div>
        <div className="mt-4 border border-studio-rule-strong bg-studio-chip-bg p-2">
          <div className="h-2 w-1/2 bg-studio-ink-faint opacity-40" />
          <div className="mt-3 h-8 border border-dashed border-studio-rule-strong" />
        </div>
      </div>
    </div>
  );
}

function LocalFlowDiagram() {
  const steps = ["Product repo", "studio.local", "Live study"];

  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
        Detail 04A / Runtime path
      </div>
      <div className="mt-6 flex items-center justify-center">
        {steps.map((step, index) => (
          <div key={step} className="contents">
            <div className="landing-sheet landing-sheet--tint flex h-20 w-24 items-center justify-center border border-studio-rule-strong px-3 text-center font-mono text-[9px] uppercase tracking-wider text-studio-ink">
              {step}
            </div>
            {index < steps.length - 1 ? (
              <div className="relative h-px w-12 bg-studio-rule-strong after:absolute after:-right-px after:-top-[3px] after:h-[7px] after:w-[7px] after:rotate-45 after:border-r after:border-t after:border-studio-rule-strong" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
