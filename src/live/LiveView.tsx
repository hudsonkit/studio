"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { StudioPage, StudioRegistry } from "../registry";
import { StudioRouterProvider, useStudioRouter, type StudioRouter } from "../router";
import { cn } from "../shell/cn";
import { foldStage, type LiveTouch } from "./stage";
import type { LiveChange, LivePageRef } from "./types";
import { useLiveFeed, type LiveFeedStatus } from "./useLiveFeed";

/** Default path of the host route that streams file changes. */
export const STUDIO_LIVE_ENDPOINT = "/api/studio/live";

const SESSION_LIST_LIMIT = 6;
/** Files the stage reloads for: content fetched at mount, which hot reload never sees. */
const CONTENT_FILE = /\.(?:mdx?|html?|svg|txt)$/i;

export interface StudioLiveViewProps<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  registry: StudioRegistry<Bucket, Surface, Status>;
  extraPages?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  /** The host's page renderer — the stage renders a study exactly as its route does. */
  renderStage: (page: StudioPage<Bucket, Surface, Status>) => ReactNode;
  /** Pages never put on stage (the home page, the live view itself). */
  excludeHrefs?: readonly string[];
  endpoint?: string;
}

/**
 * The study live view: whichever study's files changed last is on stage,
 * rendered as its own route renders it. The person stays on this route; a
 * file change swaps the stage, never the location.
 */
export function StudioLiveView<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  registry,
  extraPages = [],
  renderStage,
  excludeHrefs = [],
  endpoint = STUDIO_LIVE_ENDPOINT,
}: StudioLiveViewProps<Bucket, Surface, Status>) {
  const pages = useMemo(
    () =>
      [...registry.pages, ...extraPages].filter((page) => !excludeHrefs.includes(page.href)),
    [registry.pages, extraPages, excludeHrefs],
  );
  const refs = useMemo<LivePageRef[]>(
    () => pages.map((page) => ({ href: page.href, source: page.source })),
    [pages],
  );
  const feed = useLiveFeed(endpoint, refs);
  const stage = useMemo(() => foldStage(feed.changes, feed.pin), [feed.changes, feed.pin]);
  const page = stage.href ? pages.find((entry) => entry.href === stage.href) : undefined;
  const now = useNow(5000);

  const pick = (href: string) => {
    if (!stage.pinned && href === stage.latest) return;
    feed.setPin(href === stage.latest ? undefined : { href, at: Date.now() });
  };

  return (
    <div className="studio-live flex min-h-full flex-col">
      <LiveStrip
        status={feed.status}
        label={page?.label}
        change={stage.change}
        pinned={stage.pinned}
        touched={stage.touched}
        stagedHref={stage.href}
        pages={pages}
        now={now}
        onPick={pick}
        onUnpin={() => feed.setPin(undefined)}
      />
      {page ? (
        <Stage page={page} change={stage.change}>
          {renderStage(page)}
        </Stage>
      ) : (
        <EmptyStage
          status={feed.status}
          pages={pages}
          watching={feed.watching}
          endpoint={endpoint}
          onPick={(href) => feed.setPin({ href, at: Date.now() })}
        />
      )}
    </div>
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Studies read their route from the studio router. Inside the stage the
 * router answers with the study's own href, so a study renders as it would
 * on its route while the browser stays on the live view.
 */
function StageRouter({ href, children }: { href: string; children: ReactNode }) {
  const parent = useStudioRouter();
  const router = useMemo<StudioRouter>(
    () => ({ ...parent, usePathname: () => href }),
    [parent, href],
  );
  return <StudioRouterProvider router={router}>{children}</StudioRouterProvider>;
}

function Stage<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  page,
  change,
  children,
}: {
  page: StudioPage<Bucket, Surface, Status>;
  change: LiveChange | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Modules hot-reload in place and keep the study's state. Content the study
  // fetched at mount (a markdown doc, an iframed board) only shows its edit
  // after a remount.
  const [generation, setGeneration] = useState(0);
  const contentAt = change && CONTENT_FILE.test(change.file) ? change.at : undefined;
  const seenContentAt = useRef(contentAt);
  useEffect(() => {
    if (contentAt === seenContentAt.current) return;
    seenContentAt.current = contentAt;
    if (contentAt !== undefined) setGeneration((n) => n + 1);
  }, [contentAt]);

  // A new study starts at its top, not at the last study's scroll offset.
  useEffect(() => {
    let node: HTMLElement | null = ref.current?.parentElement ?? null;
    while (node) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        node.scrollTop = 0;
        return;
      }
      node = node.parentElement;
    }
    window.scrollTo({ top: 0 });
  }, [page.href]);

  return (
    <div ref={ref} className="flex-1">
      <StageRouter key={`${page.href}:${generation}`} href={page.href}>
        {children}
      </StageRouter>
    </div>
  );
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function splitPath(file: string): { dir: string; base: string } {
  const i = file.lastIndexOf("/");
  return i >= 0 ? { dir: file.slice(0, i + 1), base: file.slice(i + 1) } : { dir: "", base: file };
}

const STATUS_COPY: Record<LiveFeedStatus, string> = {
  connecting: "connecting",
  live: "live",
  missing: "no live route",
  offline: "reconnecting",
};

function LiveDot({ status }: { status: LiveFeedStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        status === "live" && "animate-pulse bg-[var(--status-ok-fg)]",
        status === "connecting" && "bg-studio-ink-faint",
        (status === "offline" || status === "missing") && "bg-[var(--status-warn-fg)]",
      )}
    />
  );
}

function Sep() {
  return <span aria-hidden className="h-3 w-px shrink-0 bg-studio-edge" />;
}

function LiveStrip<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  status,
  label,
  change,
  pinned,
  touched,
  stagedHref,
  pages,
  now,
  onPick,
  onUnpin,
}: {
  status: LiveFeedStatus;
  label: string | undefined;
  change: LiveChange | undefined;
  pinned: boolean;
  touched: LiveTouch[];
  stagedHref: string | undefined;
  pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  now: number;
  onPick(href: string): void;
  onUnpin(): void;
}) {
  const { Link } = useStudioRouter();
  const labelFor = (href: string) => pages.find((page) => page.href === href)?.label ?? href;
  const file = change ? splitPath(change.file) : undefined;
  const showSession = touched.length > 1 || (pinned && touched.length > 0);

  return (
    <div className="studio-page-strip sticky top-0 z-10 border-b border-studio-edge bg-studio-canvas px-7 py-2.5 font-mono text-[10px]">
      <div className="flex flex-wrap items-baseline gap-3">
        <span
          className="inline-flex items-center gap-1.5 self-center uppercase tracking-eyebrow text-studio-ink-faint"
          aria-live="polite"
        >
          <LiveDot status={status} />
          {STATUS_COPY[status]}
        </span>
        <Sep />
        {label ? (
          <span className="text-[11px] text-studio-ink-strong">{label}</span>
        ) : (
          <span className="text-studio-ink-faint">Waiting for a study to change</span>
        )}
        {file && change ? (
          <>
            <Sep />
            <span className="inline-flex min-w-0 items-baseline gap-1 text-studio-ink-faint" title={change.file}>
              <span className="hidden truncate md:inline">{file.dir}</span>
              <code className="rounded-[2px] bg-studio-canvas-alt px-1 py-px text-[9.5px] text-studio-ink">
                {file.base}
              </code>
              {change.removed ? <span className="uppercase tracking-eyebrow">removed</span> : null}
            </span>
            <Sep />
            <time
              dateTime={new Date(change.at).toISOString()}
              className="tabular-nums text-studio-ink"
            >
              {clock(change.at)}
            </time>
            <span className="text-studio-ink-faint">{ago(change.at, now)}</span>
          </>
        ) : label ? (
          <>
            <Sep />
            <span className="text-studio-ink-faint">no changes this session</span>
          </>
        ) : null}
        <span className="ml-auto inline-flex items-baseline gap-3">
          {pinned ? (
            <button
              type="button"
              onClick={onUnpin}
              className="focus-ring uppercase tracking-eyebrow text-studio-ink-faint transition-colors hover:text-studio-ink"
            >
              Pinned · follow changes
            </button>
          ) : null}
          {stagedHref ? (
            <Link
              href={stagedHref}
              className="focus-ring uppercase tracking-eyebrow text-studio-ink-faint transition-colors hover:text-studio-ink"
            >
              Open route →
            </Link>
          ) : null}
        </span>
      </div>
      {showSession ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1 gap-y-1">
          <span className="mr-2 text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">
            this session
          </span>
          {touched.slice(0, SESSION_LIST_LIMIT).map((touch) => {
            const active = touch.href === stagedHref;
            return (
              <button
                key={touch.href}
                type="button"
                onClick={() => onPick(touch.href)}
                aria-pressed={active}
                title={touch.change.file}
                className={cn(
                  "focus-ring inline-flex items-baseline gap-1.5 rounded-[3px] px-2 py-0.5 transition-colors",
                  active
                    ? "bg-studio-canvas-alt text-studio-ink"
                    : "text-studio-ink-faint hover:bg-studio-canvas-alt hover:text-studio-ink",
                )}
              >
                <span className="max-w-[24ch] truncate">{labelFor(touch.href)}</span>
                <span className="text-[9px] text-studio-ink-faint">{ago(touch.change.at, now)}</span>
              </button>
            );
          })}
          {touched.length > SESSION_LIST_LIMIT ? (
            <span className="text-studio-ink-faint">+{touched.length - SESSION_LIST_LIMIT}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyStage<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  status,
  pages,
  watching,
  endpoint,
  onPick,
}: {
  status: LiveFeedStatus;
  pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  watching?: { files: number; pages: number; root: string };
  endpoint: string;
  onPick(href: string): void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10 lg:px-8">
      <header className="border-b border-studio-rule pb-8">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
          live / waiting
        </div>
        <h1 className="mt-4 max-w-[760px] text-[32px] font-medium leading-tight text-studio-ink-strong">
          Nothing has changed since you opened this view.
        </h1>
        <p className="mt-5 max-w-[64ch] text-[15px] leading-[1.7] text-studio-ink">
          When an agent writes or edits a study, that study comes on stage here, rendered as its
          route renders it, and the stage follows the work from study to study. You stay on this
          page.
        </p>
        {status === "missing" ? (
          <p className="mt-5 max-w-[64ch] font-mono text-[11px] leading-relaxed text-studio-ink-faint">
            This host has no live route yet. Add{" "}
            <code className="rounded-[2px] bg-studio-canvas-alt px-1 py-px text-studio-ink">
              app{endpoint}/route.ts
            </code>{" "}
            containing{" "}
            <code className="rounded-[2px] bg-studio-canvas-alt px-1 py-px text-studio-ink">
              export {"{ POST }"} from &quot;studio/live/server&quot;;
            </code>
          </p>
        ) : watching ? (
          <p className="mt-5 font-mono text-[11px] text-studio-ink-faint">
            Watching {watching.files} files behind {watching.pages} of {pages.length} studies in{" "}
            <code className="text-studio-ink">{watching.root}</code>
          </p>
        ) : null}
      </header>

      <section className="py-8">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint">
          Studies · choose one to put it on stage
        </div>
        <ul className="mt-4 divide-y divide-studio-rule border-y border-studio-rule">
          {pages.map((page) => (
            <li key={page.href}>
              <button
                type="button"
                onClick={() => onPick(page.href)}
                className="focus-ring group grid w-full gap-3 py-4 text-left transition-colors hover:bg-studio-chip-bg md:grid-cols-[140px_1fr]"
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-studio-ink-faint">
                  {page.surface ?? page.bucket}
                </span>
                <span>
                  <span className="block text-[15px] font-medium text-studio-ink-strong">
                    {page.label}
                  </span>
                  {page.blurb ? (
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-studio-ink-faint">
                      {page.blurb}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
