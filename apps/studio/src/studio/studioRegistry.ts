import {
  createRegistry,
  type StudioInsertionPoint,
  type StudioPage,
} from "studio/registry";
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
  | "samples"
  | "studies"
  | "agents";
export type Surface = "vision" | "architecture" | "api" | "runtime";
export type Status = "stable" | "proposal" | "preview" | "wip";

export type StudioAppPage = StudioPage<Bucket, Surface, Status>;

export const HOME_HREF = "/studio";

export const insertionPoints = [
  {
    id: "studio.shell.navigation",
    label: "Studio shell navigation",
    scope: "navigation",
    surface: "runtime",
    route: "/studio",
    allowedModes: ["decorate", "overlay"],
    source: ["src/shell/RegistryNav.tsx"],
    blurb: "Left-panel registry navigation exposed as a controlled Studio-mode anchor.",
  },
  {
    id: "studio.page.reference-body",
    label: "Reference page body",
    scope: "page",
    surface: "runtime",
    route: "/studio/package/[slug]",
    allowedModes: ["replace", "after", "decorate"],
    source: ["apps/studio/src/studio/StudioPages.tsx"],
    blurb: "The rendered package-reference body below the page header.",
  },
] satisfies readonly StudioInsertionPoint<Surface>[];

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
    href: "/studio/foundations/scout",
    label: "Scout connection",
    bucket: "foundations",
    surface: "runtime",
    status: "preview",
    blurb: "The project-owned Scout identity and server-mediated web messaging surface.",
    source: [
      ".studio/project.json",
      "src/scout/server.ts",
      "apps/studio/src/studio/StudioScoutPanel.tsx",
    ],
  },
  {
    href: "/studio/foundations/claude-artifacts",
    label: "Claude artifacts",
    bucket: "foundations",
    surface: "runtime",
    status: "preview",
    blurb: "Share any study as a private Claude artifact; comments come back as Studio feedback and replies go back to the thread.",
    source: [
      "src/artifacts/buildStudy.ts",
      "bin/local-artifacts.mjs",
      "apps/studio/src/studio/artifactStudies.ts",
      "docs/claude-artifacts.md",
    ],
  },
  {
    href: "/studio/proposals/stu-001-hudson-insertion-points",
    label: "STU-001 - Hudson insertion points",
    bucket: "proposals",
    surface: "architecture",
    status: "proposal",
    blurb: "A Hudson Kit insertion-point contract for Studio mode swaps across web and native surfaces.",
    source: ["apps/studio/src/studio/content/proposals.ts"],
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
    href: "/studio/package/injection",
    label: "studio/injection",
    bucket: "package",
    surface: "api",
    status: "preview",
    blurb: "Reference runtime for registered study injection: URL/storage activation, before/after compare, and insertion-point lookup.",
    source: ["src/injection/index.tsx", "src/injection/state.ts"],
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
  {
    id: "sco-proto-001-scout-shell-atoms",
    href: "/studio/studies/sco-proto-001-scout-shell-atoms",
    label: "SCO-PROTO-001 · Scout shell atoms",
    bucket: "studies",
    surface: "architecture",
    status: "preview",
    blurb:
      "Prototype of the four shared Scout shell atoms — elevation, selected-row, page header, inspector rhythm — proposed for port-back into ScoutTheme.",
    source: [
      "apps/studio/src/studio/studies/ScoutShellAtoms.tsx",
      "apps/studio/src/studio/studies/scoutShellAtoms.css",
    ],
  },
  {
    id: "talkie-atlas",
    href: "/studio/studies/talkie-feature-atlas",
    label: "Talkie feature atlas",
    bucket: "studies",
    surface: "vision",
    status: "preview",
    blurb:
      "A data-driven capability app: search, filter, cross the surface matrix, inspect live receipts, and traverse every Talkie feature by user job and maturity.",
    source: [
      "apps/studio/src/studio/studies/TalkieFeatureAtlas.tsx",
      "apps/studio/src/studio/studies/talkieFeatureAtlas.css",
      "apps/studio/src/studio/studies/talkie/TalkieFeatureExplorer.tsx",
      "apps/studio/src/studio/studies/talkie/talkieFeatureExplorer.css",
      "apps/studio/src/studio/studies/talkie/TalkieReceipt.tsx",
      "apps/studio/src/studio/studies/talkie/talkieReceipt.css",
    ],
  },
  {
    id: "talkie-one-thought",
    href: "/studio/studies/talkie-one-thought",
    label: "Talkie · One thought",
    bucket: "studies",
    surface: "vision",
    status: "preview",
    blurb:
      "An end-to-end narrative study: catch a thought, keep its context, shape it, deliver it, and retain the trail.",
    source: [
      "apps/studio/src/studio/studies/TalkieOneThought.tsx",
      "apps/studio/src/studio/studies/talkieOneThought.css",
      "apps/studio/src/studio/studies/talkie/TalkieReceipt.tsx",
      "apps/studio/src/studio/studies/talkie/talkieReceipt.css",
    ],
  },
  {
    id: "talkie-behavior-programming",
    href: "/studio/studies/talkie-behavior-programming",
    label: "Talkie behavior programming",
    bucket: "studies",
    surface: "vision",
    status: "proposal",
    blurb: "An illustrative prompt, code, test, and revision sequence for Hey Talkie. Mock data; no execution.",
    source: [
      "apps/studio/src/studio/studies/talkieBehavior/TalkieBehaviorStudy.tsx",
      "apps/studio/src/studio/studies/talkieBehavior/talkieBehavior.css",
    ],
  },
  {
    id: "studio-reference-target-study",
    href: "/studio/samples/targeted-study",
    label: "Targeted study sample",
    bucket: "samples",
    surface: "runtime",
    family: "insertion-targets",
    status: "preview",
    source: [
      "src/registry/index.ts",
      "apps/studio/src/studio/studioRegistry.ts",
    ],
    blurb: "A normal Studio page that also declares its host-app insertion point.",
    target: {
      anchor: "studio.page.reference-body",
      mode: "replace",
      route: "/studio/package/registry",
      surface: "runtime",
      aliases: ["targeted-study", "reference-body"],
    },
  },
];

export const registry = createRegistry<Bucket, Surface, Status>({
  pages,
  insertionPoints,
  surfaceOrder: ["vision", "architecture", "api", "runtime"],
  defaultSurface: "api",
  bucketLabel: (bucket) =>
    ({
      foundations: "Foundations",
      proposals: "Proposals",
      package: "Package",
      recipes: "Recipes",
      samples: "Samples",
      studies: "Studies",
      agents: "Agent pages",
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
  { key: "studies" },
] as const;
