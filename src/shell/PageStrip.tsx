"use client";

import type { ReactNode } from "react";
import type {
  StudioPage,
  StudioRegistry,
} from "../registry";
import { useStudioRouter } from "../router";

export interface PageStripProps<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  registry: StudioRegistry<Bucket, Surface, Status>;
  extraPages?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  /**
   * Render the status pill for a page's status value. Provided by the
   * consumer so the shell stays unaware of the pill atom.
   */
  renderStatusPill?: (status: Status) => ReactNode;
}

/**
 * Per-page header strip — breadcrumbs · status pill · source files ·
 * blurb. Reads the registry entry for the current pathname; routes
 * not in the registry render nothing.
 */
export function PageStrip<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  registry,
  extraPages = [],
  renderStatusPill,
}: PageStripProps<Bucket, Surface, Status>) {
  const pathname = useStudioRouter().usePathname();
  const page = registry.pageForPath(pathname, extraPages);
  if (!page) return null;

  const statusNode = page.status && renderStatusPill
    ? renderStatusPill(page.status)
    : null;

  return (
    <div className="studio-page-strip border-b border-studio-edge bg-studio-canvas px-7 py-2.5 font-mono text-[10px]">
      <div className="flex flex-wrap items-baseline gap-3">
        <Crumbs page={page} registry={registry} />
        <Sep />
        {statusNode}
        {page.source && page.source.length > 0 ? (
          <>
            <Sep />
            <SourceRefs files={page.source} />
          </>
        ) : null}
        {page.blurb ? (
          <>
            <span className="mx-1 text-studio-ink-faint">·</span>
            <span className="font-sans text-[11px] italic text-studio-ink-faint">
              {page.blurb}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Crumbs<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  page,
  registry,
}: {
  page: StudioPage<Bucket, Surface, Status>;
  registry: StudioRegistry<Bucket, Surface, Status>;
}) {
  const surface = page.surface ? registry.surfaceLabel(page.surface) : null;
  const family =
    page.family && page.family !== page.label.toLowerCase()
      ? page.family
      : null;

  return (
    <div className="flex items-baseline gap-1.5 uppercase tracking-eyebrow text-studio-ink-faint">
      <span>{registry.bucketLabel(page.bucket)}</span>
      {surface ? (
        <>
          <Chevron />
          <span>{surface}</span>
        </>
      ) : null}
      {family ? (
        <>
          <Chevron />
          <span>{family}</span>
        </>
      ) : null}
      <Chevron />
      <span className="text-studio-ink">{page.label}</span>
    </div>
  );
}

function SourceRefs({ files }: { files: string[] }) {
  return (
    <div className="flex items-baseline gap-1.5 text-studio-ink-faint">
      <span className="text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
        source
      </span>
      {files.map((file, i) => (
        <span key={file} className="inline-flex items-baseline gap-1">
          <code className="rounded-[2px] bg-studio-canvas-alt px-1 py-px text-[9.5px] text-studio-ink">
            {basename(file)}
          </code>
          {i < files.length - 1 ? (
            <span className="text-studio-ink-faint">,</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

function Sep() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-studio-edge" />;
}

function Chevron() {
  return (
    <span aria-hidden className="text-studio-ink-faint">
      ›
    </span>
  );
}
