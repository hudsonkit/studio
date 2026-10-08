---
kind: map
title: "Studio UI primitives: shell, app shell, registry, router, theme, atoms, injection"
covers: ["src/shell/**", "src/app-shell/**", "src/registry/**", "src/router/**", "src/theme/*", "src/atoms/*", "src/injection/*"]
---

# Studio UI primitives: shell, app shell, registry, router, theme, atoms, injection

## Files

- `src/registry/index.ts` — `StudioPage`, insertion-point types, and `createRegistry` (lookup by path, bucket, surface, family, insertion anchor).
- `src/registry/define.ts` — `defineStudio`: builds the registry, normalized `buckets`, status palette, `statusColors`, and iteration helpers in one call.
- `src/shell/index.ts` — barrel for `studio/shell`.
- `src/shell/StudioShell.tsx` — standalone layout: fixed sidebar slot, page strip slot, main content, `?focus=1` chrome-off mode.
- `src/shell/StudioSidebar.tsx` — fixed left `<aside>` with header/footer, `RegistryNav` inside, optional resize handle. Re-exports `SidebarLink`, `StatusDot`, and related types.
- `src/shell/RegistryNav.tsx` — chrome-free bucket list: `BucketSpec`, surface groups, family primary + collapsible variants, `SidebarLink`, `StatusDot`.
- `src/shell/PageStrip.tsx` — per-page header strip with breadcrumbs, status pill, source file basenames, and blurb.
- `src/shell/useResizableWidth.ts` — controlled or uncontrolled width hook: pointer drag, keyboard, localStorage persistence, CSS var publishing.
- `src/shell/cn.ts` — falsy-filtering class joiner. It does not dedupe or merge classes.
- `src/shell/shell.css` — `.studio-resize-handle` styles (exported as `studio/shell.css`).
- `src/app-shell/index.ts` — barrel for `studio/app-shell`.
- `src/app-shell/StudioHudsonApp.tsx` — adapts a registry to hudsonkit `AppShell`: `RegistryNav` as LeftPanel, `PageStrip` + `renderPage` as Content, optional `ThemeProvider`.
- `src/app-shell/ContentOutlet.tsx` — `StudioContentProvider` / `StudioContentOutlet`: a context bridge so framework route children reach the Hudson `Content` slot.
- `src/app-shell/commands.ts` — `createStudioIterationCommands`: hudsonkit `CommandOption`s to log a turn, declare a winner, list decisions, and compare siblings.
- `src/router/index.ts` — barrel for `studio/router`.
- `src/router/context.tsx` — `StudioRouter` interface, `StudioRouterProvider`, `useStudioRouter`, and the `vanillaRouter` fallback (plain `<a>` + `window.location`).
- `src/router/next.tsx` — `nextRouter` / `NextRouterProvider` built on `next/link` and `next/navigation` (`studio/router/next`).
- `src/theme/index.ts` — re-exports `HudsonThemeScript`, `ThemeProvider`, `useTheme`, `useOptionalTheme`, and types from `hudsonkit/theme`.
- `src/theme/aliases.css` — maps `--studio-*`, `--scout-*`, `--status-*`, `--code-*` and font vars onto hudsonkit `--hud-*` tokens (`studio/theme.css`).
- `src/theme/atmosphere.css` — opt-in lit, translucent dark theme (`studio/atmosphere.css`, import after `studio/theme.css`). It lifts Hudson's dark palette to slate, paints radial light pools and a grain overlay on the frame, and turns the Hudson chrome (matched by its `bg-background/95`, `bg-card/95` and `fixed inset-0 bg-background` utilities) into backdrop-blurred glass. Studio hooks: `.studio-content` (transparent page), `.studio-page-strip` (sticky glass), and `.studio-glass` / `.studio-glass-interactive` for page cards. Dark theme only.
- `src/atoms/index.ts` — barrel for `studio/atoms`.
- `src/atoms/StatusPill.tsx` — `StatusPill` (filled/outlined/text) and `createStatusPalette`, which binds the pill to a status union.
- `src/atoms/StatusPill.manifest.ts` — `ComponentManifest` for StatusPill and the reference specimen for `studio/components` manifests.
- `src/injection/index.tsx` — `useStudioInjection`, `StudioInjectionFrame` (before/after bar), `StudioRegisteredInjectionHost` (looks up a study for an anchor).
- `src/injection/state.ts` — pure `resolveStudioInjectionState`: parses URL params, stored values, and dev/localhost gating. Covered by `test/injection-state.test.ts`.
- `src/injection/styles.css` — `.studio-injection*` styles (`studio/injection.css`).

## Data flow

- Public subpaths (package.json `exports`): `studio/registry`, `studio/shell`, `studio/shell.css`, `studio/app-shell`, `studio/router`, `studio/router/next`, `studio/theme`, `studio/theme.css`, `studio/atmosphere.css`, `studio/atoms`, `studio/injection`, `studio/injection.css`.
- The registry is the single source of truth. `defineStudio` (or `createRegistry`) holds a static `pages` array. Every lookup method also takes `extra` pages, which are appended after the static ones. Runtime pages, such as agent pages, travel this way as `extraPages`.
- Routing is indirected through `useStudioRouter()`. `RegistryNav`, `SidebarLink`, `PageStrip`, `StudioShell` (search params), `StudioHudsonApp`, and `EngMarkdown` in `src/doc` read `Link`, `usePathname`, and `useSearchParams` from context. With no provider they fall back to `vanillaRouter`.
- There are two layouts. (1) Standalone: `StudioShell` with `sidebar={<StudioSidebar/>}` and `pageStrip={<PageStrip/>}`. (2) Hudson: `StudioHudsonApp` builds a `HudsonApp` with `mode: "panel"`, wires `useCommands`, `useStatus`, `useNavCenter`, and `useNavActions` hooks (static props are wrapped in hooks when no hook is given), and wraps the result in `routerProvider` and then `ThemeProvider` unless `theme={false}`.
- In `StudioHudsonApp`, the Content slot resolves the path with `resolvePath` (by default this strips the trailing slash and maps `${homeHref}/` to `homeHref`), calls `registry.pageForPath(path, extraPages)`, and passes `{pathname, page, registry, extraPages}` to the consumer's `renderPage`.
- Sidebar width: when `resizable` is set, `StudioSidebar` runs `useResizableWidth` with defaults `persistKey: "studio:sidebar:width"`, `cssVar: "--studio-sidebar-width"`, min 200, and max 480. The hook writes the var on `document.documentElement`. `StudioShell` offsets main content by `var(--studio-sidebar-width, 220px)` unless it receives a numeric `sidebarWidth`.
- Status colors: `createStatusPalette(map)` provides `statusToColor` (`var(--status-<tone>-fg)`). `defineStudio` uses it to build `statusColors` for `StatusDot` and `renderStatusPill` for `PageStrip`.
- Iteration: `defineStudio().createIterationCommands(ctx)` calls `createStudioIterationCommands` with the bound registry. The commands build decisions with `createTurnDecision` and `createWinnerDecision` from `src/doc/decisions.ts` and pass them to the caller's `onDecision`. Studio does not persist them.
- Injection: a host app wraps a real UI region in `StudioRegisteredInjectionHost` with `anchor`. The host calls `registry.studyForInsertionPoint(anchor, extraPages)`, which returns the first page whose `target.anchor` matches. The host derives `studyId` from `page.id` or a slugged `href` and renders `StudioInjectionFrame`. The frame shows the original children in `before` mode and `renderStudy(controller)` in `after` mode. Holding Alt temporarily shows the opposite mode (`peeking`).
- Injection state precedence: the URL params `studio`, `studio.<id>`, and `studioInjection` beat the stored `enabled` value. `studioMode` and `studioMode.<id>` beat the stored mode. The default mode is `after`. Values are stored in localStorage under `studio.injection.<id>.enabled|mode`.

## Invariants and traps

- `StudioPage.href` is the route key and is matched exactly: `/path` form, no trailing slash. `pageForPath` does not normalize, so a trailing slash misses unless `resolvePath` strips it first (only `StudioHudsonApp` does this; `PageStrip` and `RegistryNav` use the raw pathname).
- `familyGroups` keys on `family ?? label`, and the first page wins as the primary. Two unrelated pages with the same label and no `family` silently collapse into primary + variant.
- `pagesBySurface` drops any surface that is missing from `surfaceOrder`. Pages on that surface vanish from surface-grouped buckets.
- `PageItem` sets its variant `expanded` state once, at mount. Navigating to a variant later does not auto-expand it.
- A non-resizable `StudioSidebar` never publishes `--studio-sidebar-width`. If its `width` is not 220, pass the same number to `StudioShell.sidebarWidth`, or content will overlap.
- `studio-resize-handle` and `.studio-injection*` styles only apply if the consumer imports `studio/shell.css` / `studio/injection.css`. Shell components use Tailwind utilities (`bg-studio-canvas`, `tracking-eyebrow`, …) that the consumer's Tailwind config and globals must define and scan.
- `atmosphere.css` targets Hudson's utility class names, not hooks Hudson owns. If Hudson renames `bg-background/95` or `bg-card/95` on its nav, panels or status bar, that chrome goes back to opaque. `StudioHudsonApp`'s default `contentClassName` and `PageStrip` carry the `studio-content` and `studio-page-strip` hooks. A custom `contentClassName` must keep `studio-content` or the page paints opaque canvas over the light.
- `StatusPill` only knows five tones. Colors come from `--status-<tone>-fg/bg`, which `studio/theme.css` derives from hudsonkit. Without that CSS, pills render with no color.
- `StudioShell` reads search params inside `<Suspense>` so Next can render it statically. The fallback renders with focus mode off.
- `src/registry/define.ts` imports runtime code from `../doc` and `../app-shell`. Importing `studio/registry` therefore pulls in react-markdown, rehype-highlight, and `hudsonkit/app-shell`, not just types.
- `defineStudio` computes `sidecarRoot` from `options.iteration` but never uses it. `persistAnnotations` always POSTs to the default `/api/studio/annotations` endpoint.
- The iteration commands use `currentPage.href` as `treatmentId` and only `console.log` for list/compare. Decision ids are `win-${Date.now()}` / `turn-${Date.now()}` and can collide within the same millisecond.
- Injection is force-disabled unless the runtime is dev (`NODE_ENV !== "production"` or `import.meta.env.DEV`) or the URL host is `localhost`, `127.0.0.1`, or `::1`. URL params cannot enable it on a production host.
- In the `studio=` param, any disabling token (`0`, `off`, `none`, `clear`, …) in the comma list wins over a matching study id. Close calls `history.replaceState` to strip the `studio*` params and stores `enabled=0`.
- `StudioHudsonApp` defines its slot components inside render, so they are new component types on every render. Keep its parent stable to avoid remounting the Content and LeftPanel subtrees.
- `src/theme/index.ts` notes that lower-level helpers (`getHudsonThemeScript`, `DEFAULT_THEME`) lack .d.ts files. Import them from `hudsonkit/theme-script` directly.
