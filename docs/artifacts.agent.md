---
kind: map
title: "Study artifact bundling and Claude artifact sync"
covers: ["src/artifacts/**"]
---

# Study artifact bundling and Claude artifact sync

## Files

- `src/artifacts/buildStudy.ts` — `buildStudy`: bundles one registry study into a self-contained HTML page plus a JSON sidecar. Also exports `hashSources`.
- `src/artifacts/cli.ts` — `bun src/artifacts/cli.ts build <id>... | --all`, or `--repo/--app/--entry/--export/--id` for a study in any Studio-style app.

Related, not covered:
- `apps/studio/src/studio/artifactStudies.ts` — the list of studies `--all` builds. Mirrors `StudySpec`.
- `bin/local-artifacts.mjs` — `StudioArtifactSync`: links.json bookkeeping, the sync plan, comment import, mirrored replies.
- `bin/local-agent-api.mjs` — MCP tools `artifact_sync_plan`, `artifact_link`, `artifact_import_comments`, `artifact_mark_mirrored`.
- `bin/local-feedback.mjs` — the feedback store that imported comments are written to.
- `docs/claude-artifacts.md` — user-facing guide.

## Data flow

**Build (`buildStudy`).**
1. Import `<app>/src/studio/studioRegistry.ts` in the Bun process and find the page whose `id` or `href` equals `study.page ?? study.id`.
2. With `css: "app"` (the default), `readLayout` scans `<app>/app/layout.tsx` for bare side-effect imports (`import "pkg";`, non-relative) and for `getHudsonThemeScript({...})` string options. `compileAppCss` runs `<app>/app/globals.css` through postcss with `@tailwindcss/postcss` (`base: app`) and the `studio-drop-junk` plugin. The Tailwind plugin is resolved from the app's `package.json`, and postcss is resolved from the plugin's location (bun workspaces may nest it).
3. Write `<app>/.studio-artifact-build/<id>/entry.tsx`. It imports the layout CSS packages, `react-dom/client` and the study export, inlines `page` as JSON, and renders `<Study page={page} />` into `#root`.
4. `Bun.build`: browser target, `iife`, minified, `NODE_ENV=production`. The `studio-aliases` plugin maps `@/x` to `Bun.resolveSync(<app>/src/x)`. Fonts and images (`.woff2 .woff .ttf .svg .png`) use the `dataurl` loader, so `@font-face` sources from CSS packages are inlined. Then the whole `.studio-artifact-build` dir is removed.
5. `inlinePublicAssets` replaces quoted or parenthesized root-relative image paths (`"/pets/tuck.png"`) that exist under `<app>/public` with base64 data URLs, in both the JS and the CSS (compiled app CSS first, then bundle CSS).
6. Source hash: `study.entry` plus the registry page's `source` list (repo-relative, else app-relative, missing files dropped), plus `apps/studio/app/globals.css` when `css: "app"`. `hashSources` sorts the paths and feeds sha256 with `path\0content\0`, then keeps 16 hex chars.
7. Write `<repo>/.studio/artifacts/<id>.html`: `<title>`, description meta, `studio-study` and `studio-source-hash` metas, the optional Hudson theme script, one `<style>` (font stacks + CSS + base CSS), the "Open in Studio" bar, `#root`, and one `<script>`. The sidecar `<id>.json` holds `id, title, htmlPath, metaPath, sourceHash, bytes, studioHref, appDir, study, builtAt, sources`.

**Sync (agent-driven; the host never calls claude.ai).**
1. `artifact_sync_plan` → `StudioArtifactSync.plan()`. It lists every sidecar in `.studio/artifacts/` (any `*.json` except links.json that has `id` and `htmlPath`), re-hashes `build.sources`, and sets the action:
   - `publish` — no `url` in links.json.
   - `republish` — `publishedHash !== build.sourceHash`, or `build_stale` (the current hash differs from the sidecar's).
   - `current` — otherwise.
   Each study with a URL also carries `outbound` and `unmirrorable`. The plan returns fixed `steps` text for the agent.
2. The agent publishes with its Artifact tool, then calls `artifact_link`. That validates the URL against `^https://claude.ai/(code/)?artifact/<id>$`, sets `url`, `publishedHash`, `publishedAt` and increments `versions`. It also creates the study's agent page (slug = study id, owner `Studio`, client `artifact-sync`, comments widget) if missing, and rewrites the page body when the URL changed.
3. The agent reads comments with ArtifactComments and passes all of them to `artifact_import_comments`. Each new comment becomes a reviewer `comment` event with `source: { kind: "artifact", url, threadId, commentId, at }`. `at` is the comment's `created_at` from the read, normalized to ISO, and is dropped when it does not parse. The first comment imported for a thread becomes the root. Later ones reply to it. A comment with `from_claude` (the artifact's own Claude answering) becomes an agent `reply` named `Claude` under the thread's root, with the same `source`. A root also gets `anchor: { kind: "artifact-element", selector, location }` from the thread's `[anchored at]` and `[location]` rows, when the agent passes them. `apps/studio/src/studio/StudyPins.tsx` pins open anchored threads on the local study and keeps the root first and orders the replies under it by `source.at`, falling back to `createdAt`, because an artifact reply is often imported after a Studio reply written later.
4. `outbound` lists Studio replies to post back. The agent posts each with ArtifactComments reply, then calls `artifact_mark_mirrored` with the posted `text`.

links.json shape (`.studio/artifacts/links.json`, gitignored):

```txt
{ version: 1, studies: { <studyId>: {
    url, publishedHash, publishedAt, versions,
    threads:  { <artifactThreadId>: <rootEventId> },
    comments: { <dedupeKey>: <eventId> },
    mirrored: { <eventId>: { threadId, text, at } } } } }
```

## Invariants and traps

- Dedupe key is `comment_id` when the read gives one, else `<threadId>:<sha256(body)[0..12]>`. Without ids, two identical comments in one thread import once.
- A comment is skipped when its key is already in `comments` or when `threadId\0body` matches a `mirrored` entry exactly. A `from_claude` comment is also skipped when its thread has no root yet, or when its body, with or without a leading `Name: `, equals the body of an event written in Studio (no `source`). That second check catches echoes of our own replies when `artifact_mark_mirrored` got no `text`.
- `outbound` takes events with a `parentId`, no `source`, a body, and no `mirrored` entry, whose root maps to an artifact thread. Reviewer authors get a `Name: ` prefix, agent authors do not. Text is cut at 4000 chars. Resolved threads are not excluded.
- `unmirrorable` is every top-level reviewer event without `source`. It is never cleared, so resolved Studio notes stay in the list.
- Replies only land on artifact threads a writer has sent to Claude. Failed replies stay in `outbound` until marked.
- `bin/local-agent-api.mjs` creates a new `StudioArtifactSync` per tool call, so the `serialize` queue does not span calls. The temp file name in `writeLinks` uses only the pid. Concurrent `artifact_*` calls can race on links.json.
- `hashSources` exists in both `src/artifacts/buildStudy.ts` and `bin/local-artifacts.mjs`. They must stay byte-for-byte equivalent, or every study reads as `build_stale`.
- The hash does not cover transitive imports, `apps/studio/app/layout.tsx` or CSS packages. Changing a component that is neither the entry nor in the page's `source` does not trigger `republish`.
- If a source file is missing during `plan()`, the sidecar hash is used and the study does not show `build_stale`.
- Study ids become feedback page slugs, so they must match `^[a-z0-9][a-z0-9-]{0,63}$` or `artifact_link` fails. An existing agent page with the same slug is reused.
- On the first `artifact_link`, `ensureFeedbackPage` creates the page, and `updatePage` also runs because `previous.url` was empty. The page starts at revision 2.
- The registry is imported at build time by Bun, so it must load outside Next. `page` is inlined with `JSON.stringify`, so functions and non-JSON fields on the page are lost. `title` comes from `page.label`.
- App CSS bypasses Bun's minifier on purpose: Bun folds `color-mix(in oklab, var(--x) 5%, transparent)` to `var(--x)`. CSS pulled in through the bundle is still minified.
- `studio-drop-junk` removes any rule containing control bytes or U+FFFD. Tailwind's `@source` scan can read binary files and mint such rules.
- Inline `</script` and `</style` are escaped. The page is an HTML fragment with no `<html>`, `<head>` or `<body>`.
- The theme script is optional: a missing `hudsonkit/theme-script` or a non-literal option is dropped silently. Root-relative assets not found in `public/` stay as URLs and will not load offline.
- `.studio-artifact-build` is removed only after `Bun.build` returns. A thrown error leaves it behind. A `success: false` build throws an `AggregateError` with the logs.
- `--all` uses `repoRoot` = this repo and `appDir` = `apps/studio`. In external mode, `--css` other than `own` means `app`. The plan's rebuild command is always `bun src/artifacts/cli.ts`, relative to this repo.
- `studioUrl` defaults to `http://studio.studio.local`. Pass `--studio-url` for other apps, or the bar links to the wrong host.
