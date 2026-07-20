# studio

Studio gives product teams a place to keep design studies, engineering notes,
and working UI experiments beside the code they describe.

It is an internal TypeScript package, shared by local workspace rather than
published to npm. Product repos bring their own content and taxonomy; Studio
provides the shell, registry, docs, code viewer, and local runtime.

## Quick start

```bash
bun install
bun dev
```

Open [http://localhost:5191/studio](http://localhost:5191/studio). `apps/studio`
is Studio's canonical first-party app as well as its live package reference.

To register it with the shared local edge:

```bash
bun run local ensure .
```

Then open `http://studio.studio.local`.

## What's here

| Subpath | Contents |
| --- | --- |
| `studio/registry` | Generic `StudioPage<B, S, St>` + insertion-point metadata + `createRegistry(...)`. Returns page grouping helpers plus `insertionPoint`, `studyForInsertionPoint`, and `studiesForInsertionPoint` bound to the consumer's taxonomy. |
| `studio/shell` | `StudioShell` (layout + focus mode), `StudioSidebar` (bucket-driven, per-bucket custom render), `PageStrip` (breadcrumb + status + source files + blurb). Plus `SidebarLink`, `StatusDot`, `cn`. |
| `studio/doc` | `EngMarkdown` (react-markdown + highlight.js with `buildFileHref` and `viewableExtensions` overrides), `EngDocSheet` (bordered frame), `DataRow` (label/value primitive). |
| `studio/code` | `CodeViewer` (CodeMirror 6, read-only). `themeDetection` accepts `media` \| `data-attribute` \| `controlled`. `theme` builder defaults to `studioCodeTheme`. 17-language pack via `languageForFilename`. |
| `studio/injection` | Reference runtime for registered study injection: URL/storage activation, before/after compare, and `StudioRegisteredInjectionHost` for resolving studies from insertion-point ids. |
| `studio/scout` | Browser client, shared types, and centralized paths for a Studio-owned Scout connection. |
| `studio/scout/server` | Server-only adapter that resolves the configured Studio agent and forwards messages through Scout's web API. |
| `studio/atoms` | `StatusPill` primitive (tone + label + variant). `createStatusPalette<Status>(map)` binds it to a consumer's status union and returns `statusToTone` / `statusToLabel` / `statusToColor`. |
| `studio/router` | `StudioRouterProvider`, `useStudioRouter`, `vanillaRouter`. Default fallback uses `<a>` + `window.location`. |
| `studio/router/next` | `NextRouterProvider` — drop-in adapter that wires `next/link` + `next/navigation` into the studio router context. Next.js consumers only. |
| `studio/theme` | Re-exports `HudsonThemeScript`, `ThemeProvider`, `useTheme`, `useOptionalTheme` from `hudsonkit/theme`. Pre-paint script + React context for theme/template switching, FOUC-safe. |
| `studio/theme.css` | CSS file that aliases studio's `--studio-*` / `--scout-*` / `--status-*` / `--code-*` vars onto hudsonkit's `--hud-*` token contract. Consumers import this once; values flip with `[data-hudson-theme]`. |
| `studio/injection.css` | Minimal styles for the Studio-mode injection frame. Consumers can import it as-is or copy the `.studio-injection*` class contract into their own app CSS. |
| `studio/app-shell` | Hudson AppShell adapters: `StudioHudsonApp` for a complete registry-backed Hudson studio, plus `StudioContentProvider` / `StudioContentOutlet` for framework layouts that already own the shell. |
| `studio/flows` | Spatial journey canvas, live embed registry, inspection UI, and `createStudioFlowsApp(...)` Hudson adapter. |
| `studio/flows/model` | Flows file, journey, page, and component-tree model. |
| `studio/flows/render` | Renderer for Flows component trees. |
| `studio/flows/server` | File store, REST/MCP service, and discussion adapter. |

## Flows

Flows is Studio's native canvas for laying out whole product journeys while
keeping each screen connected to a live product-owned design surface. Studio
owns the model, service, renderer, state, and shell integration; consumers only
register their embeds and navigation:

```tsx
import { createStudioFlowsApp } from "studio/flows";

export const flowsApp = createStudioFlowsApp({
  embeds: {
    "candidate-orientation": { component: CandidateOrientation },
  },
  discuss: { projectName: "My product" },
  onNavigateHome: () => navigate("/"),
});
```

Run the service directly with `bun run flows:serve`. It stores documents under
`~/.studio/flows` and exposes the REST and MCP endpoints used by a host route
such as `/flows`. Use `bun run flows:smoke` for the end-to-end model/store/API
smoke test. Tailwind v4 hosts should import `studio/flows/styles.css` after
their `@import "tailwindcss"`; the stylesheet registers the Flows source scan,
semantic tokens, and component CSS in the host's existing pipeline.

## Recommended app structure

The strongest internal studios have converged on the same split:

```txt
app/
  studio/[[...slug]]/page.tsx       # route entry for the studio app
  globals.css                       # hudsonkit + studio CSS + Tailwind sources
src/studio/
  ContextualStudioApp.tsx           # thin app assembly
  studioRegistry.ts                 # bucket/surface/status taxonomy + pages
  StudioPages.tsx                   # product-specific presentations/studies
docs/
  CTH-001-*.md                      # source docs stay in the repo, not copied
```

What comes from the package:

- Hudson AppShell composition, panel chrome, palette wiring, and content slot shape.
- Registry navigation, page strip, status colors, source refs, focus-mode behavior.
- Router adapter, theme aliases, shell CSS, doc/code primitives, and status atoms.

What stays in the consumer:

- Product taxonomy and naming (`CTH`, `SCO`, `HUD`, etc.).
- The page registry and source docs.
- Presentation/study components that express the product's actual design argument.

Use buckets for structure, not marketing. A good default is:

| Bucket | Purpose |
| --- | --- |
| `foundations` | North Star, product boundary, operating model |
| `presentations` or `eng` | Numbered proposals and engineering docs |
| `studies` | UI/design studies, each on its own route |

This combines the useful patterns from the existing studios:

- **Hudson**: dogfood `AppShell`; the studio is a proper Hudson app.
- **OpenScout**: keep plans/engineering/studies as separate registry buckets.
- **Lattices**: keep proposals as a compact numbered list, not pitch cards.
- **Talkie**: make each study/presentation its own polished route with persistent chrome.

## Proposal convention

The first-party Studio app now uses a lightweight numbered proposal convention:

- Proposal ids use the `STU-###` prefix.
- Proposal routes live under `/studio/proposals/<stu-id>-<slug>`.
- Proposal pages are ordinary registry entries in the `proposals` bucket.
- Long-form proposal bodies currently live in
  `apps/studio/src/studio/content/proposals.ts` and render through
  `EngMarkdown`.

This is intentionally small: Studio already has the registry, shell, page strip,
source links, and markdown renderer. A heavier docs loader can come later if
proposal volume makes inline strings painful.

## Local edge convention

Studio also has a machine-local entrypoint for dev, modeled after Scout's
`scout.local` edge. The goal is to stop remembering per-project ports.

Each project declares its Studio app in `.studio/project.json`:

```json
{
  "version": 1,
  "id": "openscout",
  "label": "OpenScout",
  "studioDir": "design/studio",
  "start": "bun next dev --hostname 0.0.0.0 --port {port}",
  "healthPath": "/studio",
  "rootPath": "/studio",
  "host": "openscout.studio.local",
  "preferredPort": 3030
}
```

The machine registry lives outside project repos:

```txt
~/Library/Application Support/Studio/
  registry.json
  local-edge/Caddyfile
  logs/
  runtime/
```

`studio.local` is the supervisor dashboard. Per-project hosts such as
`openscout.studio.local` are generated Caddy routes. The shared local edge is
installed once as a macOS LaunchAgent (`dev.studio.local`). Any Studio client can
call `studio-local ensure` from its repo: if the shared edge is already
installed, it just registers the project and rewrites the Caddyfile; if it is not
installed, it creates the support directories, checks Caddy, installs the
LaunchAgent, then registers the project.

When the edge is running, it publishes those names with Bonjour/mDNS on macOS,
runs the supervisor, and runs Caddy from the generated Caddyfile. If a Studio app
is down, Caddy serves a same-origin start page that asks the supervisor to run
the project's start command, then redirects back to the requested Studio URL.

Useful commands:

```bash
bun run local init --id studio --studio-dir apps/studio \
  --start "bun next dev --hostname 0.0.0.0 --port {port}" \
  --health-path /studio --root-path /studio --preferred-port 5191

bun run local ensure .
bun run local list
bun run local caddyfile
```

The checked-in Studio package manifest at `.studio/project.json` uses this flow
to register the first-party app as `studio.studio.local`.

Low-level commands still exist for debugging: `bun run local install` installs
the shared edge without registering a project, `bun run local enable` only
updates the machine registry, and `bun run local edge` runs the supervisor and
Caddy in the foreground.

## Scout connection

A Studio can belong to a Scout agent by adding a portable selector and the
local Scout web origin to `.studio/project.json`:

```json
{
  "scout": {
    "webBaseUrl": "http://127.0.0.1:43120",
    "identity": {
      "agent": "studio",
      "label": "Studio agent"
    }
  }
}
```

The selector is deliberately not a machine-specific agent id. The server
resolves `studio` against Scout's exact ids, definition ids, handles, and names
at runtime. This keeps the project manifest portable while still routing to one
unambiguous agent.

Studio resolves connection status and the portable identity through its
same-origin `/api/scout` route. The server-only `studio/scout/server` adapter
also supports headless message and request delivery without exposing broker
details to client code.

For interactive work, the first-party app mounts Scout's native
`/embed/context-capture` composer in a drawer available on every Studio page.
Studio owns the context tray around it: current page, local URL, selected text,
and explicit notes remain visible and editable before they are attached. Scout
continues to own agent selection, attachments, conversation creation, and the
actual send. `/studio/foundations/scout` remains the connection overview; if
Scout is not running, Studio stays usable and the drawer provides a retry path.

## Design assumptions

- **Framework**: Router-agnostic in shape, but Next is the supported runtime for internal devtools adoption. The shell components and `EngMarkdown` read `Link`, `usePathname`, and `useSearchParams` from a `StudioRouter` context. Next.js consumers wrap with `NextRouterProvider` from `studio/router/next`. Without a provider, studio falls back to plain `<a>` + `window.location`.
- **Theme**: Studio delegates to hudsonkit's theme system. Consumers install hudsonkit (transitive via studio), mount `<HudsonThemeScript />` in `<head>`, wrap with `<ThemeProvider>`, and import `studio/theme.css`. Hudson supplies the `--hud-*` token values per `[data-hudson-theme="light|dark"]`; studio's aliases.css translates those into the `--studio-*` / `--scout-*` / `--status-*` vars that studio's components reference.
- **Styling**: Tailwind. Studio components use class names like `bg-studio-canvas`, `border-studio-edge`, `text-studio-ink`, `text-studio-ink-faint`. Consumers map those classes in their `tailwind.config.ts` to the `--studio-*` vars (which now resolve via the alias layer to hudsonkit tokens).
- **Taxonomy is not shared**. Each subapp keeps its own `lib/studio-pages.ts` with concrete `Bucket` / `Surface` / `Status` unions and the page data. The package is generic over those — see `src/registry/`.
- **Insertion points are registered, not scraped**. Host apps and native surfaces expose stable anchor ids; Studio pages that are also studies attach `target` metadata to those anchors. The registry can then resolve which study belongs at a host insertion point without selector-based DOM injection.

## Adoption recipe (per subapp)

Each subapp can adopt all of studio or any single subpath. Recipe assumes a Next.js studio at `<repo>/design/studio` linked to `studio` via relative path.

### 1. Add studio + hudsonkit as bun workspace members

Studio and hudsonkit are both consumed as regular dependencies, resolved from local sibling repos via bun workspaces — no `file:` copy install, no npm publish.

At the consumer's monorepo root, declare both as workspace members alongside your own apps/packages:

```json
// <consumer-repo>/package.json
{
  "workspaces": [
    "apps/*",
    "packages/*",
    "../studio",
    "../hudson/packages/web/hudsonkit"
  ]
}
```

Then in whichever package consumes studio, declare it like any normal dep:

```json
// <consumer-repo>/apps/studio/package.json     (or design/studio, etc.)
{
  "dependencies": {
    "studio": "workspace:*"
  }
}
```

Run `bun install` at the consumer root. Bun symlinks both sibling repos into `node_modules/`. Studio depends on `hudsonkit` internally; including hudsonkit in the workspaces array lets that dep resolve. Source changes in either sibling propagate live; no reinstall needed.

### 2. Wire hudsonkit theme

Studio delegates theme tokens to hudsonkit. Three pieces:

```tsx
// design/studio/app/layout.tsx
import { HudsonThemeScript, ThemeProvider } from "studio/theme";
import "hudsonkit/dist/styles.css";   // hudsonkit's --hud-* token values at :root
import "studio/theme.css";            // studio's alias layer (--studio-* → --hud-*)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        {/* Pre-paint script sets data-hudson-theme on <html> before first paint, no FOUC */}
        <HudsonThemeScript defaultTheme="dark" defaultTemplate="hudson" />
      </head>
      <body>
        <ThemeProvider defaultTheme="dark" defaultTemplate="hudson">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

The `HudsonThemeScript` flips `data-hudson-theme="light|dark"` and `data-hudson-template="hudson|editorial|drafting"` on `<html>`. Hudsonkit's `styles.css` defines `--hud-*` token values per template/theme combo. Studio's `theme.css` translates those into the `--studio-*` / `--scout-*` / `--status-*` vars studio's components reference.

### 3. Transpile (Next.js consumers only)

```ts
// design/studio/next.config.ts
const nextConfig = {
  transpilePackages: ["studio", "hudsonkit"],
};
```

Both packages ship raw `.ts/.tsx` and Next.js needs `transpilePackages` to compile workspace source with the consumer's settings.

### 4. Extend Tailwind content

```ts
// <consumer>/tailwind.config.ts
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../node_modules/studio/src/**/*.{ts,tsx}",
    "../../node_modules/hudsonkit/src/**/*.{ts,tsx}",
  ],
  // ...
};
```

Without this, classes that appear only inside studio's or hudsonkit's source won't be emitted. Both paths resolve via the workspace symlinks; relative depth depends on your layout.

### 5. Build your registry

```ts
// design/studio/lib/studio-pages.ts
import {
  createRegistry,
  type StudioInsertionPoint,
  type StudioPage,
} from "studio/registry";

export type StudioBucket = "plans" | "eng" | "foundations" | "studies" | /* … */;
export type StudioSurface = "web" | "ios" | "macos" | "shell" | "cross";
export type StudioStatus = "draft" | "in-flight" | "shipped" | "shelved" | "concept";

type Page = StudioPage<StudioBucket, StudioSurface, StudioStatus>;

export const STUDIO_INSERTION_POINTS = [
  {
    id: "workspace.summary",
    label: "Workspace summary",
    scope: "page",
    surface: "web",
    route: "/workspaces/[id]",
    allowedModes: ["replace", "decorate"],
    source: ["apps/web/client/screens/WorkspaceScreen.tsx"],
  },
] satisfies readonly StudioInsertionPoint<StudioSurface>[];

export const STUDIO_PAGES: Page[] = [
  { href: "/eng", label: "Engineering Index", bucket: "eng", status: "shipped" /* … */ },
  {
    id: "workspace-summary-study",
    href: "/studies/workspace-summary-density",
    label: "Workspace Summary Density",
    bucket: "studies",
    surface: "web",
    status: "concept",
    target: {
      anchor: "workspace.summary",
      mode: "replace",
      route: "/workspaces/[id]",
      aliases: ["workspace-summary"],
    },
  },
  // …
];

export const registry = createRegistry<StudioBucket, StudioSurface, StudioStatus>({
  pages: STUDIO_PAGES,
  insertionPoints: STUDIO_INSERTION_POINTS,
  surfaceOrder: ["web", "ios", "macos", "shell", "cross"],
  defaultSurface: "cross",
  bucketLabel: (b) =>
    ({ plans: "Plans", eng: "Engineering", foundations: "Foundations" /* … */ }[b]),
  surfaceLabel: (s) =>
    ({ web: "Web", ios: "iOS", macos: "macOS", shell: "Shell", cross: "Cross" }[s]),
});
```

### 6. Bind the status palette

```ts
// design/studio/components/StatusPill.tsx
import { createStatusPalette } from "studio/atoms";
import type { StudioStatus } from "@/lib/studio-pages";

export const palette = createStatusPalette<StudioStatus>({
  draft:       { tone: "neutral", label: "DRAFT" },
  "in-flight": { tone: "warn",    label: "IN-FLIGHT" },
  shipped:     { tone: "ok",      label: "SHIPPED" },
  shelved:     { tone: "error",   label: "SHELVED" },
  concept:     { tone: "info",    label: "CONCEPT" },
});

export const StatusPill = palette.StatusPill;
export const statusToColor = palette.statusToColor;
```

### 7. Install the router adapter

Wrap `<ThemeProvider>`'s children (from step 2) with `<NextRouterProvider>`:

```tsx
// design/studio/app/layout.tsx
import { HudsonThemeScript, ThemeProvider } from "studio/theme";
import { NextRouterProvider } from "studio/router/next";
import "hudsonkit/dist/styles.css";
import "studio/theme.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HudsonThemeScript defaultTheme="dark" defaultTemplate="hudson" />
      </head>
      <body>
        <ThemeProvider defaultTheme="dark" defaultTemplate="hudson">
          <NextRouterProvider>{children}</NextRouterProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

Studio is router-agnostic in its API (the shell reads `Link`, `usePathname`, `useSearchParams` from `StudioRouterProvider`), but Next is the documented runtime for internal devtools adoption. A small Vite/react-router adapter is possible via `StudioRouterProvider` from `studio/router` if you need it — not covered here.

### 8. Compose the shell

```tsx
// design/studio/components/StudioShell.tsx
"use client";
import { StudioShell as Shell, StudioSidebar, PageStrip } from "studio/shell";
import { registry } from "@/lib/studio-pages";
import { palette, StatusPill } from "@/components/StatusPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { StudioPage } from "studio/registry";

const STATUS_COLORS = {
  draft:       palette.statusToColor("draft"),
  "in-flight": palette.statusToColor("in-flight"),
  shipped:     palette.statusToColor("shipped"),
  shelved:     palette.statusToColor("shelved"),
  concept:     palette.statusToColor("concept"),
} as const;

export function StudioShell({
  children,
  extraPages,
}: {
  children: React.ReactNode;
  extraPages: StudioPage[];
}) {
  return (
    <Shell
      sidebar={
        <StudioSidebar
          registry={registry}
          extraPages={extraPages}
          statusColors={STATUS_COLORS}
          buckets={[
            { key: "plans" },
            { key: "eng", render: renderEngBucket /* custom */ },
            { key: "foundations" },
            { key: "studies", surfaceGrouped: true },
            { key: "atoms" },
          ]}
          header={<SidebarHeader />}
          footer={<SidebarFooter />}
        />
      }
      pageStrip={
        <PageStrip
          registry={registry}
          extraPages={extraPages}
          renderStatusPill={(status) => <StatusPill status={status} />}
        />
      }
    >
      {children}
    </Shell>
  );
}
```

The `buckets` array drives sidebar render order. Pass `render: (ctx) => ReactNode` for any bucket that needs custom layout (e.g. a "Recent N" list).

### 9. Doc + code viewers

```tsx
// design/studio/components/EngMarkdown.tsx
"use client";
export { EngMarkdown } from "studio/doc";

// or with overrides:
import { EngMarkdown as Base } from "studio/doc";
export function EngMarkdown(props: { body: string; fromSlug?: string }) {
  return <Base {...props} buildFileHref={myCustomHref} />;
}
```

```tsx
// design/studio/components/CodeViewer.tsx
"use client";
import { CodeViewer as Base } from "studio/code";

export function CodeViewer(props: { content: string; filename: string }) {
  return <Base {...props} themeDetection={{ mode: "data-attribute" }} />;
}
```

### 10. Delete what studio now owns

After verifying the studio pages still render, you can remove the local versions of:

- `lib/cm-studio-theme.ts` (now `studio/code` → `studioCodeTheme`)
- Old helper bodies in `lib/studio-pages.ts` (only the data + types stay)
- Custom `--studio-*` / `--scout-*` / `--status-*` CSS-var declarations in `globals.css` (now supplied by `hudsonkit/dist/styles.css` + `studio/theme.css`)

Keep the wrappers in `components/*` — they're now thin re-exports and they preserve your import paths.

## Status

| Area | State |
| --- | --- |
| Package scaffold, `package.json`, `tsconfig`, README | ✓ |
| `studio/registry` | ✓ |
| `studio/shell` | ✓ |
| `studio/doc` | ✓ |
| `studio/code` | ✓ |
| `studio/atoms` | ✓ |
| `studio/router` + `studio/router/next` | ✓ |
| `studio/theme` + `studio/theme.css` (hudsonkit integration) | ✓ |
| Editor/markdown dedup via hudsonkit BYO | ⏳ waiting on hudsonkit PR |
| Consumer wiring | Each subapp decides |
