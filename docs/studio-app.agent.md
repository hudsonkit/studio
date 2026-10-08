---
kind: map
title: "Studio's first-party app and static site"
covers: ["apps/studio/src/**"]
---

# Studio's first-party app and static site

## Files

- `apps/studio/src/studio/studioRegistry.ts` — the app's taxonomy (`Bucket`, `Surface`, `Status`), the `pages` list, two `insertionPoints`, `registry` (built with `createRegistry` from `studio/registry`), `statusPalette`, `STATUS_COLORS`, and the sidebar `BUCKETS`.
- `apps/studio/src/studio/StudioPages.tsx` — `renderStudioPage({ pathname, page })`: the single dispatcher from the current path to a page component. Also defines the home, reference, markdown, code-sample, scout, and 404 pages.
- `apps/studio/src/studio/StudioApp.tsx` — the Next entry. Wraps `StudioHudsonApp` with the registry, an agent-pages sidebar section, `useAgentStatus` as the status bar, `StudioScoutProvider`, and `NextRouterProvider`.
- `apps/studio/src/studio/agentPages.tsx` — `feedbackClient` (`studio/feedback`, keyed by `NEXT_PUBLIC_STUDIO_ID`), `useAgentRegistryPages`, `agentSlugFromPath`, `AGENT_INBOX_HREF`, `AgentPagesNav` (inbox link, presence dot and needs-you badge per page), `useAgentStatus`, `rankAgents`, and `needsLabel`.
- `apps/studio/src/studio/AgentInbox.tsx` — `/studio/agents`: every attention item across agent pages, newest first, each linking to `<page>#thread-<id>`, plus a presence chip per agent.
- `apps/studio/src/studio/artifactStudies.ts` — the list of studies that are also built and published as Claude artifacts (`id`, `entry`, `export`, `page?`, `css?`).
- `apps/studio/src/studio/ArtifactsPage.tsx` — the `/studio/foundations/claude-artifacts` page. It explains the publish/comment loop and lists `artifactStudies` joined to their registry pages.
- `apps/studio/src/studio/AnnotatableMarkdown.tsx` — markdown with an annotation pass. It persists annotations through `persistAnnotations` and sends a pass over Scout (`sendStudioScoutMessage`).
- `apps/studio/src/studio/StudioScoutProvider.tsx` — Scout drawer context: connection, agents and dispatch target, page context, notes. Exports `useStudioScout`.
- `apps/studio/src/studio/StudioScoutPanel.tsx` — the Scout status panel shown on `/studio/foundations/scout`.
- `apps/studio/src/studio/content/` — string constants: `apps/studio/src/studio/content/codeSamples.ts` (reference and recipe samples) and `apps/studio/src/studio/content/proposals.ts` (STU-001 markdown).
- `apps/studio/src/studio/studies/` (top level) — registered studies: `apps/studio/src/studio/studies/ScoutShellAtoms.tsx`, `apps/studio/src/studio/studies/TalkieFeatureAtlas.tsx`, and `apps/studio/src/studio/studies/TalkieOneThought.tsx`, each with a sibling `.css`.
- `apps/studio/src/studio/studies/talkie/` — shared Talkie parts: `apps/studio/src/studio/studies/talkie/TalkieFeatureExplorer.tsx` (used by the atlas) and `apps/studio/src/studio/studies/talkie/TalkieReceipt.tsx` (used by the atlas and One Thought).
- `apps/studio/src/studio/studies/talkieBehavior/` — `apps/studio/src/studio/studies/talkieBehavior/TalkieBehaviorStudy.tsx` (mock prompt/code/test sequence) and its CSS.
- `apps/studio/src/studio/studies/actController/` — `apps/studio/src/studio/studies/actController/ActionControllerStudy.tsx`, an HTML harness for Action's native HUD. It is not in the registry and is rendered by `app/renders/act-controller`.
- `apps/studio/src/studio/studies/actKeycap/` — `apps/studio/src/studio/studies/actKeycap/ActionStage.tsx`, `apps/studio/src/studio/studies/actKeycap/KeyCaptions.tsx`, `apps/studio/src/studio/studies/actKeycap/scenes.ts`, and `apps/studio/src/studio/studies/actKeycap/specs.ts`: key-caption treatments A and B. Not in the registry; rendered by `app/renders/act-keycap/**`.
- `apps/studio/site/vite.config.ts` — static build rooted at `site/`, with `base: "/studio/"` and output to `site/dist`. It defines the aliases and injects the Hudson theme script.
- `apps/studio/site/main.tsx` — mounts `StudioSite` and imports `../app/globals.css`. That file imports `studio/atmosphere.css`, so dev and the static site share the lit glass theme. Pages opt cards in with `studio-glass studio-glass-interactive` (the home artifacts band, the artifacts loop).
- `apps/studio/site/StudioSite.tsx` — the static counterpart of `StudioApp`. It uses the same registry and `renderStudioPage` with `HistoryRouterProvider`, and has no Scout provider and no agent sidebar. Its nav links to `/studio/docs/` and GitHub.
- `apps/studio/site/historyRouter.tsx` — a `StudioRouter` built on `history.pushState` and `popstate`.
- `apps/studio/site/StaticMarkdown.tsx` — the stand-in for `AnnotatableMarkdown`. It renders `AnnotatableDoc` without persistence or send targets.

Related files that are not covered here: `apps/studio/app/studio/[[...slug]]/page.tsx` (renders `StudioApp`), `apps/studio/app/renders/**`, `apps/studio/app/api/**` (Scout and annotation routes), `src/artifacts/buildStudy.ts` and `src/artifacts/cli.ts`, `src/app-shell/StudioHudsonApp.tsx`.

## Data flow

**Registry to render.** `apps/studio/src/studio/studioRegistry.ts` declares every page with an `href` under `/studio`, a `bucket`, a `surface`, a `status`, and optionally `source` and `target`. `StudioHudsonApp` (from `studio/app-shell`) builds the sidebar from `BUCKETS` and the page strip from the registry. It resolves the current pathname to a `page` and calls `renderStudioPage`. Dispatch order in `apps/studio/src/studio/StudioPages.tsx`:

1. `HOME_HREF` (`/studio`) renders the home page.
2. `/studio/agents` (`AGENT_INBOX_HREF`) renders `AgentInbox`. `/studio/agents/<slug>` renders `AgentPage`. This check runs before the page lookup, so a direct link does not flash a 404.
3. Exact `href` branches: claude-artifacts, scout, the `proposals` bucket, recipes, samples, and the four registered studies.
4. Any other registered page renders `ReferencePage`, using `referenceSamples[href]` when present and the blurb otherwise.
5. No page renders `NotFoundPage`.

**Insertion points.** The `studio-reference-target-study` page targets the `studio.page.reference-body` anchor in `replace` mode. `ReferencePage` wraps the body of `/studio/package/registry` in `StudioRegisteredInjectionHost`, which swaps in `InjectedReferenceBodyStudy` when that study is activated by URL or storage state.

**Agent pages.** `useAgentRegistryPages` maps the daemon's agent pages (`useAgentPages(feedbackClient)`) to registry pages with `bucket: "agents"` and `id: "agent:<slug>"`. Their status maps as draft→wip, review→preview, done/archived→stable. `StudioApp` passes them as `useExtraPages` and puts an `agents` section, rendered by `AgentPagesNav`, ahead of `BUCKETS`. `NEXT_PUBLIC_STUDIO_ID` is set by `studio dev` (`bin/local-dev.mjs`). `AgentPagesNav` shows a presence dot instead of the stability dot, and an amber count of what waits on the reviewer. `useAgentStatus` replaces the shell's "Ready" with e.g. "atlas listening · 2 need you" (amber while anything needs you) and falls back to "Ready" when no agent has been seen.

**Artifacts.** `src/artifacts/cli.ts` imports `apps/studio/src/studio/artifactStudies.ts` by path. For each entry it bundles the named export of `entry`, rendered with `{ page }`, into one HTML file. `ArtifactsPage` reads the same list. It finds each entry's page by `study.page ?? study.id` against page `id`, then by `href`, then by an `href` ending in `/<id>`.

**Next app compared with the static site.** Both use `apps/studio/src/studio/studioRegistry.ts` and `apps/studio/src/studio/StudioPages.tsx` unchanged. The Next app mounts `StudioApp` at `app/studio/[[...slug]]`. The site (`bun run build:site`) mounts `StudioSite` with Vite. Vite's resolve aliases send `@/studio/AnnotatableMarkdown` to `site/StaticMarkdown.tsx` and every other `@/` import to `apps/studio/src/`. The router swap is not an alias: `StudioSite` passes `HistoryRouterProvider` where `StudioApp` passes `NextRouterProvider`. Registry hrefs already start with `/studio`, which matches `base`, so paths pass through unchanged. `usePathname` strips a trailing slash.

## Invariants and traps

- Adding a page takes two edits: an entry in `pages`, and a branch in `renderStudioPage` unless the generic `ReferencePage` is enough. Dispatch is an exact `href` string match, so renaming an href in one file silently sends the page to `ReferencePage`.
- The alias order in `apps/studio/site/vite.config.ts` matters. The exact `@/studio/AnnotatableMarkdown` alias must stay before the `^@\/` regex, or the static site bundles the host-backed version.
- Only `AnnotatableMarkdown` is aliased. `apps/studio/src/studio/StudioPages.tsx` still imports `agentPages`, `ArtifactsPage`, and `StudioScoutPanel` into the site bundle. `StudioScoutPanel` calls `useStudioScout`, which throws outside `StudioScoutProvider`, and `StudioSite` passes no provider, so `/studio/foundations/scout` cannot render on the static site. `/studio/agents/*` still routes to `AgentPage` on the site, with no host behind it.
- In the site bundle, `process.env.NEXT_PUBLIC_STUDIO_ID` is compiled to an empty object, so `feedbackClient` has no studio id there.
- `BUCKETS` omits `agents`. Only `StudioApp` adds that section. The `bucketLabel` map still needs an `agents` entry, because extra pages use that bucket.
- `apps/studio/src/studio/artifactStudies.ts` mirrors `StudySpec` in `src/artifacts/buildStudy.ts`. Keep the two shapes in sync. `entry` is repo-root-relative and `export` must be a named export that accepts `{ page }`.
- Studies scope their CSS under their own root class (for example `.scout-atoms`) and import their own stylesheet. `actKeycap/scenes.ts` stays a plain module, without `"use client"`, so server routes can read its values.
- The site router's `Link` client-side-navigates every href that is `/studio`, `/studio/*`, or `/studio?*`. The nav's Docs link (`/studio/docs/`, the Dewey output copied into `dist/docs`) is a plain `<a>` on purpose, so it does a full page load. Routing it through `Link` would push it into the SPA and render `NotFoundPage`.
- `apps/studio/site/dist/**` is build output. Do not edit it.
