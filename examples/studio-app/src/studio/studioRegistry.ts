import { createRegistry, type StudioPage } from "studio/registry";
import { createStatusPalette } from "studio/atoms";

/**
 * Studio's first-party registry. Each subpath of the `studio` package gets
 * its own page so the surface doubles as both a product landing and a
 * navigable API reference.
 */

export type Bucket =
  | "foundations"
  | "proposals"
  | "package"
  | "recipes"
  | "samples";
export type Surface = "vision" | "architecture" | "api" | "runtime";
export type Status = "stable" | "proposal" | "preview" | "wip";

export type StudioAppPage = StudioPage<Bucket, Surface, Status>;

export const HOME_HREF = "/studio";

export const pages: readonly StudioAppPage[] = [
  {
    href: HOME_HREF,
    label: "What Studio is",
    bucket: "foundations",
    surface: "vision",
    status: "stable",
    blurb: "The product boundary, the Hudson-backed app-shell pattern, and what each subpath owns.",
  },
  {
    href: "/studio/foundations/architecture",
    label: "Hudson-backed shell",
    bucket: "foundations",
    surface: "vision",
    status: "stable",
    blurb: "How StudioHudsonApp composes Hudson AppShell with a typed registry.",
    source: ["src/app-shell/StudioHudsonApp.tsx"],
  },
  {
    href: "/studio/proposals/stu-001-hudson-insertion-points",
    label: "STU-001 - Hudson insertion points",
    bucket: "proposals",
    surface: "architecture",
    status: "proposal",
    blurb: "A Hudson Kit insertion-point contract for Studio mode swaps across web and native surfaces.",
    source: ["examples/studio-app/src/studio/content/proposals.ts"],
  },
  {
    href: "/studio/package/registry",
    label: "studio/registry",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "Generic StudioPage<B, S, St> + createRegistry — taxonomy-agnostic page index.",
    source: ["src/registry/index.ts"],
  },
  {
    href: "/studio/package/shell",
    label: "studio/shell",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "StudioShell, StudioSidebar, RegistryNav, PageStrip — the layout primitives.",
    source: ["src/shell/index.ts"],
  },
  {
    href: "/studio/package/doc",
    label: "studio/doc",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "EngMarkdown + EngDocSheet — long-form engineering docs with highlight + linking.",
    source: ["src/doc/index.ts"],
  },
  {
    href: "/studio/package/code",
    label: "studio/code",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "CodeViewer with theme detection and a 17-language CodeMirror pack.",
    source: ["src/code/index.ts"],
  },
  {
    href: "/studio/package/atoms",
    label: "studio/atoms",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "StatusPill + createStatusPalette — bind tone/label maps to a typed status union.",
    source: ["src/atoms/index.ts"],
  },
  {
    href: "/studio/package/router",
    label: "studio/router",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "StudioRouterProvider + Next adapter — Link/usePathname/useSearchParams indirection.",
    source: ["src/router/index.ts", "src/router/next.tsx"],
  },
  {
    href: "/studio/package/theme",
    label: "studio/theme",
    bucket: "package",
    surface: "api",
    status: "stable",
    blurb: "Re-exports HudsonThemeScript + ThemeProvider, plus aliases.css for --studio-* tokens.",
    source: ["src/theme/index.ts", "src/theme/aliases.css"],
  },
  {
    href: "/studio/package/app-shell",
    label: "studio/app-shell",
    bucket: "package",
    surface: "api",
    status: "preview",
    blurb: "StudioHudsonApp adapter + StudioContentOutlet for framework-owned layouts.",
    source: ["src/app-shell/StudioHudsonApp.tsx", "src/app-shell/ContentOutlet.tsx"],
  },
  {
    href: "/studio/recipes/adoption",
    label: "Adoption recipe",
    bucket: "recipes",
    surface: "runtime",
    status: "stable",
    blurb: "The ten-step path from zero to a wired Hudson-backed studio.",
    source: ["README.md"],
  },
  {
    href: "/studio/recipes/hudson-shell",
    label: "Hudson app-shell pattern",
    bucket: "recipes",
    surface: "runtime",
    status: "preview",
    blurb: "How StudioHudsonApp wires registry → sidebar → page strip → content.",
    source: ["src/app-shell/StudioHudsonApp.tsx"],
  },
  {
    href: "/studio/samples/code-viewer",
    label: "Code viewer sample",
    bucket: "samples",
    surface: "runtime",
    status: "stable",
    blurb: "CodeViewer rendering studio source with the default studioCodeTheme.",
  },
  {
    href: "/studio/samples/doc-viewer",
    label: "Doc viewer sample",
    bucket: "samples",
    surface: "runtime",
    status: "stable",
    blurb: "EngMarkdown rendering a short markdown payload.",
  },
];

export const registry = createRegistry<Bucket, Surface, Status>({
  pages,
  surfaceOrder: ["vision", "architecture", "api", "runtime"],
  defaultSurface: "api",
  bucketLabel: (bucket) =>
    ({
      foundations: "Foundations",
      proposals: "Proposals",
      package: "Package",
      recipes: "Recipes",
      samples: "Samples",
    })[bucket],
  surfaceLabel: (surface) =>
    ({
      vision: "Vision",
      architecture: "Architecture",
      api: "API",
      runtime: "Runtime",
    })[surface],
});

export const statusPalette = createStatusPalette<Status>({
  stable: { tone: "ok", label: "STABLE" },
  proposal: { tone: "info", label: "PROPOSAL" },
  preview: { tone: "warn", label: "PREVIEW" },
  wip: { tone: "info", label: "WIP" },
});

export const STATUS_COLORS: Record<Status, string> = {
  stable: statusPalette.statusToColor("stable"),
  proposal: statusPalette.statusToColor("proposal"),
  preview: statusPalette.statusToColor("preview"),
  wip: statusPalette.statusToColor("wip"),
};

export const BUCKETS = [
  { key: "foundations" },
  { key: "proposals" },
  { key: "package", title: "Subpaths" },
  { key: "recipes" },
  { key: "samples" },
] as const;
