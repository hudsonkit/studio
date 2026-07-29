import type { ReactNode } from "react";
import type { StudioPage, StudioRegistry } from "./index";
import { createRegistry, type CreateRegistryOptions } from "./index";
import type { BucketSpec } from "../shell/RegistryNav";
import {
  createStatusPalette,
  type StatusEntry,
  type StatusPalette,
} from "../atoms/StatusPill";
import {
  annotationsToDecisions,
  createTurnDecision,
  createWinnerDecision,
  getActiveTreatment,
  persistAnnotations,
  fetchPersistedAnnotations,
  getDefaultSidecarPath,
} from "../doc";
import { createStudioIterationCommands } from "../app-shell";
import type { StudioCommandContext } from "../app-shell/commands";
import type { CommandOption } from "hudsonkit"; // for the commands factory return type
import type { TreatmentDecision } from "../doc/decisions";

/**
 * High-level factory for defining a studio with minimal boilerplate.
 *
 * Takes a declarative config (pages + taxonomy + status map) and returns
 * everything you typically need to wire StudioHudsonApp or StudioShell:
 * - the typed registry
 * - a ready-to-use `buckets` array for the sidebar
 * - statusColors + a bound StatusPill + renderStatusPill helper
 *
 * This is the recommended way to create new studios. It replaces the
 * previous pattern of manually creating taxonomy files, label maps,
 * createStatusPalette calls, STATUS_COLORS objects, and BUCKETS arrays.
 */
export interface DefineStudioOptions<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  /** All pages in the studio. */
  pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;

  /** Order in which surfaces are displayed inside a bucket. */
  surfaceOrder: ReadonlyArray<Surface>;

  /** Surface to assign to pages that don't specify one. */
  defaultSurface: Surface;

  /**
   * Order of buckets in the sidebar (and which buckets exist).
   * Can be a simple list of keys, or a full BucketSpec array if you need
   * custom titles, surface grouping, or per-bucket render functions.
   *
   * If omitted, buckets are derived from the pages in first-seen order.
   */
  buckets?: ReadonlyArray<Bucket | BucketSpec<Bucket, Surface, Status>>;

  /**
   * Status palette definition. Maps each status value to a tone + display label.
   * Tones control the visual treatment (ok / warn / error / neutral / info).
   */
  statuses: Record<Status, StatusEntry>;

  /**
   * Optional: wire the iteration / decisions layer (treatments, winners, turns,
   * annotation persistence) into the studio definition.
   *
   * When provided, the returned object will include pre-bound helpers for
   * persisting annotations/decisions to sidecars (perfect for local agents)
   * and generating commands for the in-app hudson assistant.
   */
  iteration?: {
    /** Default sidecar directory convention (passed to persist helpers). */
    sidecarRoot?: string;
    /** Initial decisions (e.g. loaded from disk on startup). */
    initialDecisions?: ReadonlyArray<TreatmentDecision>;
  };

  /**
   * Optional explicit labels for buckets. If omitted, keys are title-cased.
   * You can also provide per-bucket `title` inside a BucketSpec.
   */
  bucketLabels?: Partial<Record<Bucket, string>>;

  /**
   * Optional explicit labels for surfaces. If omitted, keys are title-cased.
   */
  surfaceLabels?: Partial<Record<Surface, string>>;
}

export interface DefinedStudio<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  /** The fully configured registry (use with RegistryNav, PageStrip, etc). */
  registry: StudioRegistry<Bucket, Surface, Status>;

  /** Ready-to-pass `buckets` prop for StudioSidebar / StudioHudsonApp / RegistryNav. */
  buckets: ReadonlyArray<BucketSpec<Bucket, Surface, Status>>;

  /** Status → color (CSS var) map, useful for custom dots or styling. */
  statusColors: Record<Status, string>;

  /** Pre-bound StatusPill component for this studio's status union. */
  StatusPill: StatusPalette<Status>["StatusPill"];

  /** Convenience renderer for use with PageStrip `renderStatusPill`. */
  renderStatusPill: (status: Status) => ReactNode;

  /** Raw palette (advanced use). */
  palette: StatusPalette<Status>;

  /** The original pages for reference / extraPages merging. */
  pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;

  // --- Iteration / decisions / local agent layer (new in turnkey path) ---
  /** Generate hudsonkit CommandOptions for winners, turns, listing decisions, etc. */
  createIterationCommands: (
    ctx: Partial<Omit<StudioCommandContext<Bucket, Surface, Status>, "registry">>,
  ) => CommandOption[];

  /** Persist annotations + decisions to sidecars (via the convention). */
  persistAnnotations: (payload: {
    persistKey?: string;
    slug: string;
    annotations: any[];
    decisions?: TreatmentDecision[];
  }) => Promise<any>;

  fetchPersistedAnnotations: typeof fetchPersistedAnnotations;
  getDefaultSidecarPath: (key: string) => string;

  // Re-exported decision primitives, pre-bound to this studio's pages where useful
  annotationsToDecisions: typeof annotationsToDecisions;
  createWinnerDecision: typeof createWinnerDecision;
  createTurnDecision: typeof createTurnDecision;
  getActiveTreatment: typeof getActiveTreatment;

  /** Decisions passed in via options.iteration.initialDecisions (for bootstrapping). */
  initialDecisions: TreatmentDecision[];
}

function defaultLabel(key: string): string {
  return key
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function defineStudio<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>(
  options: DefineStudioOptions<Bucket, Surface, Status>,
): DefinedStudio<Bucket, Surface, Status> {
  const {
    pages,
    surfaceOrder,
    defaultSurface,
    buckets: bucketInput,
    statuses,
  } = options;

  const bucketLabels: Partial<Record<Bucket, string>> = options.bucketLabels ?? {};
  const surfaceLabels: Partial<Record<Surface, string>> = options.surfaceLabels ?? {};

  // Build label functions with sensible fallbacks
  const bucketLabel = (b: Bucket): string =>
    bucketLabels?.[b] ?? (typeof b === "string" ? defaultLabel(b) : String(b));

  const surfaceLabel = (s: Surface): string =>
    surfaceLabels?.[s] ?? (typeof s === "string" ? defaultLabel(s) : String(s));

  // Create the core registry
  const registry = createRegistry<Bucket, Surface, Status>({
    pages,
    surfaceOrder,
    defaultSurface,
    bucketLabel,
    surfaceLabel,
  } as CreateRegistryOptions<Bucket, Surface, Status>);

  // Status palette + derived artifacts
  const palette = createStatusPalette<Status>(statuses);

  const statusColors = {} as Record<Status, string>;
  for (const status of Object.keys(statuses) as Status[]) {
    statusColors[status] = palette.statusToColor(status);
  }

  const renderStatusPill = (status: Status): ReactNode =>
    palette.StatusPill({ status });

  // Normalize bucket input into full BucketSpec array.
  // If caller didn't supply buckets, derive from pages (first appearance order).
  const rawBuckets =
    bucketInput ??
    Array.from(new Set(pages.map((p) => p.bucket))) as Bucket[];

  const normalizedBuckets: BucketSpec<Bucket, Surface, Status>[] =
    rawBuckets.map((b) => {
      if (typeof b === "string" || typeof b === "number") {
        return { key: b as Bucket };
      }
      return b;
    });

  // --- Iteration / decisions layer (local agents + in-app assistant) ---
  const iterationConfig = options.iteration;
  const sidecarRoot = iterationConfig?.sidecarRoot ?? ".studio/annotations";

  const initialDecisions = [...(iterationConfig?.initialDecisions ?? [])];

  // Pre-bound command factory for StudioHudsonApp / hudsonkit assistant.
  // Callers can do: useCommands={() => studio.createIterationCommands({ currentPage, decisions, onDecision })}
  function createIterationCommands(
    ctx: Partial<
      Omit<StudioCommandContext<Bucket, Surface, Status>, "registry">
    >,
  ): CommandOption[] {
    return createStudioIterationCommands({
      registry,
      currentPage: ctx.currentPage,
      decisions: ctx.decisions ?? initialDecisions,
      onDecision: ctx.onDecision,
    });
  }

  // Convenience persister bound to this studio's convention.
  // Use from onAnnotationsChange or your decision handlers.
  async function persistDecisionsAndAnnotations(payload: {
    persistKey?: string;
    slug: string;
    annotations: any[];
    decisions?: TreatmentDecision[];
  }) {
    // Also persist the structured decisions alongside annotations.
    return persistAnnotations(
      {
        ...payload,
        decisions: payload.decisions ?? [],
      },
      // We use the default endpoint pattern; consumers can override.
    );
  }

  return {
    registry,
    buckets: normalizedBuckets,
    statusColors,
    StatusPill: palette.StatusPill,
    renderStatusPill,
    palette,
    pages,

    // Iteration / local-agent layer
    createIterationCommands,
    persistAnnotations: persistDecisionsAndAnnotations,
    fetchPersistedAnnotations,
    getDefaultSidecarPath: (key: string) =>
      getDefaultSidecarPath(key), // re-export for convenience
    annotationsToDecisions,
    createWinnerDecision,
    createTurnDecision,
    getActiveTreatment,
    initialDecisions,
  };
}
