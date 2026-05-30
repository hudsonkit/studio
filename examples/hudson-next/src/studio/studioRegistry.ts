import { createRegistry, type StudioPage } from "studio/registry";
import { createStatusPalette } from "studio/atoms";

export type Bucket = "foundations" | "presentations" | "studies";
export type Surface = "vision" | "engineering" | "design";
export type Status = "active" | "draft" | "study";
export type SamplePage = StudioPage<Bucket, Surface, Status>;

export const HOME_HREF = "/studio";

export const pages: readonly SamplePage[] = [
  {
    href: HOME_HREF,
    label: "North Star",
    bucket: "foundations",
    surface: "vision",
    status: "active",
    blurb: "The product boundary and operating thesis.",
  },
  {
    href: "/studio/cth-001",
    label: "CTH-001 - Context Cartridge Artifact",
    bucket: "presentations",
    surface: "engineering",
    status: "draft",
    blurb: "A numbered engineering presentation.",
    source: ["docs/CTH-001-context-cartridge.md"],
  },
  {
    href: "/studio/studies/planner",
    label: "Planner Workbench",
    bucket: "studies",
    surface: "design",
    status: "study",
    blurb: "A product-specific design study route.",
  },
];

export const registry = createRegistry<Bucket, Surface, Status>({
  pages,
  surfaceOrder: ["vision", "engineering", "design"],
  defaultSurface: "engineering",
  bucketLabel: (bucket) =>
    ({
      foundations: "Foundations",
      presentations: "Presentations",
      studies: "Studies",
    })[bucket],
  surfaceLabel: (surface) =>
    ({
      vision: "Vision",
      engineering: "Engineering",
      design: "Design",
    })[surface],
});

export const statusPalette = createStatusPalette<Status>({
  active: { tone: "ok", label: "ACTIVE" },
  draft: { tone: "warn", label: "DRAFT" },
  study: { tone: "info", label: "STUDY" },
});

export const STATUS_COLORS: Record<Status, string> = {
  active: statusPalette.statusToColor("active"),
  draft: statusPalette.statusToColor("draft"),
  study: statusPalette.statusToColor("study"),
};

export const BUCKETS = [
  { key: "foundations" },
  { key: "presentations", title: "CTH Presentations" },
  { key: "studies" },
] as const;
