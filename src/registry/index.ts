/**
 * Generic page registry for design-studio surfaces.
 *
 * Each consumer (openscout, talkie, …) defines its own Bucket / Surface /
 * Status string unions and passes them as type parameters. `createRegistry`
 * binds those unions to the helper closures so the shell components can be
 * fully typed without the package knowing the taxonomy.
 *
 * The sidebar groups by `bucket`; inside a bucket, pages can be further
 * grouped by `surface` (e.g. web/ios/macos, or mac/iphone/cross). The
 * `family` field collapses variants of the same logical surface under one
 * primary entry — first one wins, the rest become variants.
 */

export interface StudioPage<
  Bucket extends string = string,
  Surface extends string = string,
  Status extends string = string,
> {
  /** Route. `/path` form, no trailing slash. */
  href: string;
  /** Sidebar label. */
  label: string;
  /** Top-level grouping in the sidebar. */
  bucket: Bucket;
  /**
   * Variants of the same logical surface. Pages sharing a family are
   * collapsed into one primary entry plus N variants in the sidebar.
   * First page added to a family is the primary.
   */
  family?: string;
  /** Sub-grouping inside a bucket. */
  surface?: Surface;
  /** Status pill in the page strip + dot in the sidebar. */
  status?: Status;
  /** Linked source file(s), relative to repo root. */
  source?: string[];
  /** Subtitle in the page strip. */
  blurb?: string;
  /** ISO mtime. Used by recency-sorted sidebar slices. */
  updatedAt?: string;
}

export interface SurfaceGroup<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  surface: Surface;
  pages: StudioPage<Bucket, Surface, Status>[];
}

export interface FamilyGroup<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  primary: StudioPage<Bucket, Surface, Status>;
  variants: StudioPage<Bucket, Surface, Status>[];
}

export interface StudioRegistry<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  readonly pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  readonly surfaceOrder: ReadonlyArray<Surface>;
  bucketLabel(bucket: Bucket): string;
  surfaceLabel(surface: Surface): string;
  pageForPath(
    pathname: string | null,
    extra?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>,
  ): StudioPage<Bucket, Surface, Status> | undefined;
  pagesIn(
    bucket: Bucket,
    extra?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>,
  ): StudioPage<Bucket, Surface, Status>[];
  pagesBySurface(
    bucket: Bucket,
    extra?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>,
  ): SurfaceGroup<Bucket, Surface, Status>[];
  familyGroups(
    pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>,
  ): FamilyGroup<Bucket, Surface, Status>[];
}

export interface CreateRegistryOptions<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  pages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  /** Order surfaces appear in inside a bucket, regardless of page order. */
  surfaceOrder: ReadonlyArray<Surface>;
  /** Surface assigned to pages with no `surface` field. */
  defaultSurface: Surface;
  bucketLabel(bucket: Bucket): string;
  surfaceLabel(surface: Surface): string;
}

export function createRegistry<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>(
  options: CreateRegistryOptions<Bucket, Surface, Status>,
): StudioRegistry<Bucket, Surface, Status> {
  const { pages, surfaceOrder, defaultSurface, bucketLabel, surfaceLabel } =
    options;

  type Page = StudioPage<Bucket, Surface, Status>;

  function merged(extra: ReadonlyArray<Page>): ReadonlyArray<Page> {
    return extra.length === 0 ? pages : [...pages, ...extra];
  }

  function pageForPath(
    pathname: string | null,
    extra: ReadonlyArray<Page> = [],
  ): Page | undefined {
    if (!pathname) return undefined;
    return merged(extra).find((p) => p.href === pathname);
  }

  function pagesIn(
    bucket: Bucket,
    extra: ReadonlyArray<Page> = [],
  ): Page[] {
    return merged(extra).filter((p) => p.bucket === bucket);
  }

  function pagesBySurface(
    bucket: Bucket,
    extra: ReadonlyArray<Page> = [],
  ): SurfaceGroup<Bucket, Surface, Status>[] {
    const bySurface = new Map<Surface, Page[]>();
    for (const p of pagesIn(bucket, extra)) {
      const s = (p.surface ?? defaultSurface) as Surface;
      const list = bySurface.get(s) ?? [];
      list.push(p);
      bySurface.set(s, list);
    }
    return surfaceOrder
      .map((surface) => ({ surface, pages: bySurface.get(surface) ?? [] }))
      .filter((g) => g.pages.length > 0);
  }

  function familyGroups(
    list: ReadonlyArray<Page>,
  ): FamilyGroup<Bucket, Surface, Status>[] {
    const groups: FamilyGroup<Bucket, Surface, Status>[] = [];
    const byFamily = new Map<string, number>();
    for (const p of list) {
      const fam = p.family ?? p.label;
      const existing = byFamily.get(fam);
      if (existing === undefined) {
        groups.push({ primary: p, variants: [] });
        byFamily.set(fam, groups.length - 1);
      } else {
        groups[existing]!.variants.push(p);
      }
    }
    return groups;
  }

  return {
    pages,
    surfaceOrder,
    bucketLabel,
    surfaceLabel,
    pageForPath,
    pagesIn,
    pagesBySurface,
    familyGroups,
  };
}
