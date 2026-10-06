"use client";

import { useState, type ReactNode } from "react";
import type {
  FamilyGroup,
  StudioPage,
  StudioRegistry,
} from "../registry";
import { useStudioRouter } from "../router";
import { cn } from "./cn";

export interface BucketSpec<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  /** Bucket key from the consumer's Bucket union. */
  key: Bucket;
  /** Section title. Defaults to `registry.bucketLabel(key)`. */
  title?: string;
  /** Group pages inside this bucket by surface. */
  surfaceGrouped?: boolean;
  /**
   * Full custom renderer for this bucket. Receives the bucket key and
   * the sidebar context; return whatever JSX you want under the section
   * title. Use this for one-off layouts (e.g. "Recent N" lists).
   * When provided, `surfaceGrouped` is ignored.
   */
  render?: (ctx: SidebarRenderContext<Bucket, Surface, Status>) => ReactNode;
}

export interface SidebarRenderContext<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  bucket: Bucket;
  pathname: string | null;
  registry: StudioRegistry<Bucket, Surface, Status>;
  extraPages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  statusColors: Record<Status, string>;
}

export interface RegistryNavProps<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  registry: StudioRegistry<Bucket, Surface, Status>;
  buckets: ReadonlyArray<BucketSpec<Bucket, Surface, Status>>;
  /** Pages added at request time (e.g. dynamic plans on disk). */
  extraPages?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  /** Status → color (CSS value or var) for the status dot. */
  statusColors: Record<Status, string>;
  /** Wrapper className override. */
  className?: string;
}

/**
 * Pure bucket-list renderer for a studio registry. Has no panel chrome
 * (no fixed positioning, no width, no header/footer slots, no scroll
 * container) — just the buckets, surface groups, and page items.
 *
 * Use inside any container that owns its own chrome: `StudioSidebar`
 * (panel + resize), Hudson `AppShell.slots.LeftPanel` (panel from SidePanel),
 * a custom drawer, etc.
 */
export function RegistryNav<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  registry,
  buckets,
  extraPages = [],
  statusColors,
  className,
}: RegistryNavProps<Bucket, Surface, Status>) {
  const pathname = useStudioRouter().usePathname();

  return (
    <nav
      className={cn(
        "flex flex-col gap-7 px-4 pb-10 pt-3 font-mono text-[10.5px]",
        className,
      )}
    >
      {buckets.map((spec) => (
        <BucketSection
          key={spec.key}
          spec={spec}
          pathname={pathname}
          registry={registry}
          extraPages={extraPages}
          statusColors={statusColors}
        />
      ))}
    </nav>
  );
}

function BucketSection<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  spec,
  pathname,
  registry,
  extraPages,
  statusColors,
}: {
  spec: BucketSpec<Bucket, Surface, Status>;
  pathname: string | null;
  registry: StudioRegistry<Bucket, Surface, Status>;
  extraPages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  statusColors: Record<Status, string>;
}) {
  const title = spec.title ?? registry.bucketLabel(spec.key);

  if (spec.render) {
    return (
      <section>
        <SectionTitle>{title}</SectionTitle>
        <div className="mt-1.5 flex flex-col gap-3">
          {spec.render({
            bucket: spec.key,
            pathname,
            registry,
            extraPages,
            statusColors,
          })}
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="mt-1.5 flex flex-col gap-3">
        {spec.surfaceGrouped ? (
          registry
            .pagesBySurface(spec.key, extraPages)
            .map(({ surface, pages }) => (
              <SurfaceBlock
                key={surface}
                label={registry.surfaceLabel(surface)}
                groups={registry.familyGroups(pages)}
                pathname={pathname}
                statusColors={statusColors}
              />
            ))
        ) : (
          <div className="flex flex-col">
            {registry
              .familyGroups(registry.pagesIn(spec.key, extraPages))
              .map((group) => (
                <PageItem
                  key={group.primary.href}
                  group={group}
                  pathname={pathname}
                  statusColors={statusColors}
                />
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function SidebarSectionTitle({ children }: { children: ReactNode }) {
  return <SectionTitle>{children}</SectionTitle>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-mono text-[9px] font-light uppercase tracking-[0.22em] text-studio-ink-faint">
      · {children}
    </h2>
  );
}

function SurfaceBlock<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  label,
  groups,
  pathname,
  statusColors,
}: {
  label: string;
  groups: FamilyGroup<Bucket, Surface, Status>[];
  pathname: string | null;
  statusColors: Record<Status, string>;
}) {
  return (
    <div>
      <h3 className="mb-1 font-mono text-[8.5px] uppercase tracking-[0.20em] text-studio-ink-faint">
        {label}
      </h3>
      <div className="flex flex-col">
        {groups.map((group) => (
          <PageItem
            key={group.primary.href}
            group={group}
            pathname={pathname}
            statusColors={statusColors}
          />
        ))}
      </div>
    </div>
  );
}

function PageItem<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  group,
  pathname,
  statusColors,
}: {
  group: FamilyGroup<Bucket, Surface, Status>;
  pathname: string | null;
  statusColors: Record<Status, string>;
}) {
  const { primary, variants } = group;
  const hasVariants = variants.length > 0;
  const activeHere = primary.href === pathname;
  const variantActive = variants.some((v) => v.href === pathname);
  const [expanded, setExpanded] = useState(activeHere || variantActive);

  return (
    <div>
      <div className="flex items-center">
        <SidebarLink href={primary.href} active={activeHere} className="flex-1">
          <span className="flex-1 truncate">{primary.label}</span>
          {primary.status ? (
            <StatusDot status={primary.status} colors={statusColors} />
          ) : null}
        </SidebarLink>
        {hasVariants ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(
              "ml-1 grid h-5 w-5 place-items-center rounded-[3px]",
              "text-studio-ink-faint hover:text-studio-ink hover:bg-studio-canvas-alt",
            )}
            aria-label={expanded ? "Collapse variants" : "Expand variants"}
          >
            <span className="text-[9px]">{expanded ? "−" : "+"}</span>
          </button>
        ) : null}
      </div>
      {hasVariants && expanded ? (
        <div className="ml-3 flex flex-col border-l border-studio-edge pl-2.5">
          {variants.map((v) => (
            <SidebarLink
              key={v.href}
              href={v.href}
              active={v.href === pathname}
              muted
            >
              <span className="flex-1 truncate">{v.label}</span>
              {v.status ? (
                <StatusDot status={v.status} colors={statusColors} />
              ) : null}
            </SidebarLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface SidebarLinkProps {
  href: string;
  active: boolean;
  muted?: boolean;
  className?: string;
  children: ReactNode;
}

export function SidebarLink({
  href,
  active,
  muted,
  className,
  children,
}: SidebarLinkProps) {
  const { Link } = useStudioRouter();
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring flex items-center gap-1.5 rounded-[3px] px-2 py-1 transition-colors",
        active
          ? "bg-studio-canvas-alt text-studio-ink"
          : muted
            ? "text-studio-ink-faint hover:bg-studio-canvas-alt hover:text-studio-ink"
            : "text-studio-ink-faint hover:bg-studio-canvas-alt hover:text-studio-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function StatusDot<Status extends string>({
  status,
  colors,
}: {
  status: Status;
  colors: Record<Status, string>;
}) {
  return (
    <span
      aria-label={status}
      title={status}
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: colors[status] }}
    />
  );
}
