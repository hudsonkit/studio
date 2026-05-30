"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  Code2,
  FileText,
  Layers,
  Palette,
  Route,
  Shell,
} from "lucide-react";
import { CodeViewer } from "studio/code";
import { DataRow, EngDocSheet, EngMarkdown } from "studio/doc";
import type { StudioHudsonRenderContext } from "studio/app-shell";
import { useStudioRouter } from "studio/router";
import {
  ADOPTION_RECIPE,
  CODE_SAMPLE,
  DOC_SAMPLE,
  REGISTRY_SAMPLE,
  ROUTER_SAMPLE,
  SHELL_SAMPLE,
  STATUS_SAMPLE,
  THEME_SAMPLE,
} from "@/studio/content/codeSamples";
import {
  HOME_HREF,
  pages,
  registry,
  type Bucket,
  type Status,
  type StudioAppPage,
  type Surface,
} from "@/studio/studioRegistry";

type RenderContext = StudioHudsonRenderContext<Bucket, Surface, Status>;

const referenceSamples: Record<
  string,
  {
    filename: string;
    title: string;
    body: string;
  }
> = {
  "/studio/package/registry": {
    filename: "studioRegistry.ts",
    title: "Typed registry",
    body: REGISTRY_SAMPLE,
  },
  "/studio/package/shell": {
    filename: "StudioShell.tsx",
    title: "Shell composition",
    body: SHELL_SAMPLE,
  },
  "/studio/package/doc": {
    filename: "DocPage.tsx",
    title: "Markdown docs",
    body: DOC_SAMPLE,
  },
  "/studio/package/code": {
    filename: "CodeViewer.tsx",
    title: "Code viewer",
    body: CODE_SAMPLE,
  },
  "/studio/package/atoms": {
    filename: "StatusPill.tsx",
    title: "Status palette",
    body: STATUS_SAMPLE,
  },
  "/studio/package/router": {
    filename: "layout.tsx",
    title: "Router adapter",
    body: ROUTER_SAMPLE,
  },
  "/studio/package/theme": {
    filename: "layout.tsx",
    title: "Theme wiring",
    body: THEME_SAMPLE,
  },
  "/studio/package/app-shell": {
    filename: "StudioApp.tsx",
    title: "Hudson app-shell adapter",
    body: SHELL_SAMPLE,
  },
};

export function renderStudioPage({ pathname, page }: RenderContext) {
  if (pathname === HOME_HREF) return <HomePage />;
  if (page?.href === "/studio/recipes/adoption") {
    return <MarkdownPage page={page} body={ADOPTION_RECIPE} />;
  }
  if (page?.href === "/studio/recipes/hudson-shell") {
    return <ReferencePage page={page} sample={referenceSamples["/studio/package/app-shell"]} />;
  }
  if (page?.href === "/studio/samples/code-viewer") {
    return <CodeViewerSamplePage page={page} />;
  }
  if (page?.href === "/studio/samples/doc-viewer") {
    return <MarkdownPage page={page} body={DOC_SAMPLE} />;
  }
  if (page) return <ReferencePage page={page} sample={referenceSamples[page.href]} />;
  return <NotFoundPage />;
}

function HomePage() {
  const { Link } = useStudioRouter();
  const packagePages = pages.filter((page) => page.bucket === "package");
  const recipePages = pages.filter((page) => page.bucket === "recipes");

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
      <header className="grid gap-8 border-b border-studio-rule pb-8 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
            studio / package map
          </div>
          <h1 className="mt-4 max-w-[760px] text-[44px] font-medium leading-tight text-studio-ink-strong">
            Shared primitives for internal design studios.
          </h1>
          <p
            className="mt-5 max-w-[64ch] text-[15px] leading-[1.7] text-studio-ink"
            style={{ fontFamily: "var(--studio-font-serif)" }}
          >
            The package owns the shell, registry, router adapter, theme alias
            layer, status treatment, markdown renderer, and CodeMirror viewer.
            Product repos keep their own taxonomy and route content.
          </p>
        </div>

        <EngDocSheet className="self-start">
          <DataRow label="subpaths">{packagePages.length}</DataRow>
          <DataRow label="recipes">{recipePages.length}</DataRow>
          <DataRow label="runtime">Next + Hudson</DataRow>
        </EngDocSheet>
      </header>

      <section className="grid gap-8 py-8 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionHeading icon={<Boxes size={14} />} title="Package Surface" />
          <ul className="mt-4 divide-y divide-studio-rule border-y border-studio-rule">
            {packagePages.map((entry) => (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  className="group grid gap-3 py-4 transition-colors hover:bg-studio-chip-bg md:grid-cols-[140px_1fr_20px]"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-studio-ink-faint">
                    {entry.surface}
                  </span>
                  <span>
                    <span className="block text-[15px] font-medium text-studio-ink-strong">
                      {entry.label}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-studio-ink-faint">
                      {entry.blurb}
                    </span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="self-center text-studio-ink-faint transition-transform group-hover:translate-x-1"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <aside>
          <SectionHeading icon={<FileText size={14} />} title="Runtime Recipes" />
          <div className="mt-4 border-y border-studio-rule">
            {recipePages.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="block border-b border-studio-rule py-4 last:border-b-0 hover:bg-studio-chip-bg"
              >
                <span className="block text-[14px] font-medium text-studio-ink-strong">
                  {entry.label}
                </span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-studio-ink-faint">
                  {entry.blurb}
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function ReferencePage({
  page,
  sample,
}: {
  page: StudioAppPage;
  sample?: (typeof referenceSamples)[string];
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <PageHeader page={page} />
      <section className="grid gap-6 py-8 lg:grid-cols-[240px_1fr]">
        <EngDocSheet className="self-start">
          <DataRow label="bucket">{registry.bucketLabel(page.bucket)}</DataRow>
          <DataRow label="surface">
            {page.surface ? registry.surfaceLabel(page.surface) : "Default"}
          </DataRow>
          <DataRow label="source">
            {page.source?.join(", ") ?? "Example-owned"}
          </DataRow>
        </EngDocSheet>

        {sample ? (
          <CodeBlock title={sample.title} filename={sample.filename}>
            {sample.body}
          </CodeBlock>
        ) : (
          <EngMarkdown body={page.blurb ?? page.label} />
        )}
      </section>
    </main>
  );
}

function MarkdownPage({ page, body }: { page: StudioAppPage; body: string }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <PageHeader page={page} />
      <section className="py-8">
        <EngMarkdown body={body} />
      </section>
    </main>
  );
}

function CodeViewerSamplePage({ page }: { page: StudioAppPage }) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <PageHeader page={page} />
      <section className="py-8">
        <CodeBlock title="Rendered through CodeViewer" filename="CodeViewer.tsx">
          {CODE_SAMPLE}
        </CodeBlock>
      </section>
    </main>
  );
}

function PageHeader({ page }: { page: StudioAppPage }) {
  return (
    <header className="border-b border-studio-rule pb-7">
      <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
        {page.bucket} / {page.surface}
      </div>
      <h1 className="mt-4 text-[38px] font-medium leading-tight text-studio-ink-strong">
        {page.label}
      </h1>
      {page.blurb ? (
        <p
          className="mt-4 max-w-[66ch] text-[15px] leading-[1.7] text-studio-ink"
          style={{ fontFamily: "var(--studio-font-serif)" }}
        >
          {page.blurb}
        </p>
      ) : null}
    </header>
  );
}

function CodeBlock({
  title,
  filename,
  children,
}: {
  title: string;
  filename: string;
  children: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
        <Code2 size={13} />
        {title}
      </div>
      <CodeViewer
        content={children}
        filename={filename}
        themeDetection={{ mode: "data-attribute", attr: "data-hudson-theme" }}
      />
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
      {icon}
      {title}
    </div>
  );
}

function NotFoundPage() {
  const { Link } = useStudioRouter();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
      <div className="mb-5 flex gap-2 text-studio-ink-faint">
        <Shell size={16} />
        <Layers size={16} />
        <Route size={16} />
        <Palette size={16} />
      </div>
      <h1 className="text-[34px] font-medium text-studio-ink-strong">
        Page not found.
      </h1>
      <Link
        href={HOME_HREF}
        className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-studio-ink-faint hover:text-studio-ink"
      >
        Back to Studio
        <ArrowRight size={13} />
      </Link>
    </main>
  );
}
