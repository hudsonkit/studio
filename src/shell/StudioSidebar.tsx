"use client";

import { type ReactNode } from "react";
import type { StudioPage, StudioRegistry } from "../registry";
import { cn } from "./cn";
import {
  RegistryNav,
  type BucketSpec,
} from "./RegistryNav";
import {
  useResizableWidth,
  type UseResizableWidthOptions,
} from "./useResizableWidth";

export interface ResizableSidebarOptions
  extends Omit<UseResizableWidthOptions, "defaultWidth"> {
  /** Optional override for the initial width; defaults to StudioSidebar's `width`. */
  defaultWidth?: number;
}

export interface StudioSidebarProps<
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
  /**
   * Sidebar header. Consumers pass their own branding (logo, accent
   * dot, app name). Sticky at top of the column.
   */
  header: ReactNode;
  /**
   * Footer — typically theme toggle + a faint label. Sticky at the
   * bottom of the column via `mt-auto`.
   */
  footer?: ReactNode;
  /** Column width in px. Defaults to 220 to match `StudioShell`. When `resizable` is enabled this acts as the initial / default width. */
  width?: number;
  /**
   * Enable drag-to-resize. Pass `true` for sensible defaults (min 200, max
   * 480, persist under `studio:sidebar:width`, publish width to the
   * `--studio-sidebar-width` CSS var on `<html>`). Pass an options object
   * to fine-tune.
   *
   * When enabled, the sidebar publishes its live width via `--studio-sidebar-width`
   * — `StudioShell`'s content area reads that var so the layout reflows
   * during drag without extra wiring.
   */
  resizable?: boolean | ResizableSidebarOptions;
  className?: string;
}

const RESIZABLE_DEFAULTS = {
  minWidth: 200,
  maxWidth: 480,
  persistKey: "studio:sidebar:width",
  cssVar: "--studio-sidebar-width",
} as const;

/**
 * Persistent left sidebar (panel chrome + RegistryNav inside). Buckets
 * render in the order supplied; each bucket renders as a section. Variants
 * of the same `family` collapse under their primary entry — first one wins.
 */
export function StudioSidebar<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  registry,
  buckets,
  extraPages = [],
  statusColors,
  header,
  footer,
  width = 220,
  resizable,
  className,
}: StudioSidebarProps<Bucket, Surface, Status>) {
  const resizableOpts =
    resizable === true
      ? { ...RESIZABLE_DEFAULTS, defaultWidth: width }
      : resizable
        ? { ...RESIZABLE_DEFAULTS, defaultWidth: width, ...resizable }
        : null;

  // Always call the hook (rules of hooks) — when not resizable, run it with
  // a no-op shape that's never consulted.
  const resizableResult = useResizableWidth(
    resizableOpts ?? { defaultWidth: width, minWidth: width, maxWidth: width },
  );

  const liveWidth = resizableOpts ? resizableResult.width : width;

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col",
        "border-r border-studio-edge bg-studio-canvas",
        className,
      )}
      style={{ width: liveWidth }}
    >
      {header}

      <RegistryNav
        registry={registry}
        buckets={buckets}
        extraPages={extraPages}
        statusColors={statusColors}
        className="min-h-0 flex-1 overflow-y-auto"
      />

      {footer ? <div>{footer}</div> : null}

      {resizableOpts ? (
        <span className="studio-resize-handle" {...resizableResult.handleProps} />
      ) : null}
    </aside>
  );
}

// Re-exports for back-compat — these used to live here.
export {
  SidebarLink,
  SidebarSectionTitle,
  StatusDot,
} from "./RegistryNav";
export type {
  BucketSpec,
  SidebarRenderContext,
  SidebarLinkProps,
} from "./RegistryNav";
