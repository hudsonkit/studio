---
kind: map
title: "Doc and code viewers: EngMarkdown, AnnotatableDoc, decisions, CodeViewer"
covers: ["src/doc/**", "src/code/**"]
---

# Doc and code viewers: EngMarkdown, AnnotatableDoc, decisions, CodeViewer

## Files

- `src/doc/index.ts` — barrel for `studio/doc`. It also re-exports voice input types from `hudsonkit/voice`.
- `src/doc/EngMarkdown.tsx` — react-markdown renderer (remark-gfm, rehype-highlight). It slug-ids headings, autolinks path-like inline code, wraps code blocks and tables, and calls `useAnnotationBlock` per block.
- `src/doc/AnnotationContext.tsx` — `AnnotationProvider` + `useAnnotationBlock`: an optional decorator context that lets a wrapper add props and a prefix to h2/h3/h4/p/li/blockquote/pre.
- `src/doc/AnnotatableDoc.tsx` — the review annotator. It wraps `EngMarkdown` with block and span anchors, a margin note list, pin/remove, dictation, and a ship modal (copy or `onSendPass`). It also exports `formatDmPayload` and injects its own scoped CSS.
- `src/doc/EngDocSheet.tsx` — `EngDocSheet` (`.eng-sheet` frame) and `DataRow` (label/value grid row).
- `src/doc/decisions.ts` — `TreatmentDecision` / `Treatment` types, `annotationsToDecisions`, `createWinnerDecision`, `createTurnDecision`, `getActiveTreatment`.
- `src/doc/persist.ts` — `persistAnnotations` (POST), `fetchPersistedAnnotations` (GET `?key=`), and `getDefaultSidecarPath` (`.studio/annotations/<key>.json`).
- `src/doc/eng-doc.css` — editorial typography for `.eng-doc`, `.eng-codeblock`, `.eng-table-wrap`, and the consumer-composed `.eng-page` frame (`studio/doc.css`).
- `src/code/index.ts` — barrel for `studio/code`.
- `src/code/CodeViewer.tsx` — read-only `@uiw/react-codemirror` viewer with line numbers and a fold gutter. It detects the light/dark theme from the media query, a `<html>` attribute, or a controlled value.
- `src/code/languages.ts` — `languageForFilename`: file extension to CodeMirror language extension, or `null` for plain text.
- `src/code/studioCodeTheme.ts` — `studioCodeTheme(mode)`: editor chrome + highlight style, all colors from `--studio-*`, `--scout-*`, `--status-*`, `--code-*` CSS vars.

## Data flow

- Public subpaths: `studio/doc` -> `src/doc/index.ts`, `studio/doc.css` -> `src/doc/eng-doc.css`, `studio/code` -> `src/code/index.ts`. The CSS vars these components use come from `studio/theme.css` (`src/theme/aliases.css`).
- `EngMarkdown` builds `components` from `{fromSlug, buildFileHref, isViewablePath}`. Inline `<code>` (no `className`) whose text contains `/`, has no scheme, and ends in a viewable extension (an optional `:line` or `:a-b` suffix is stripped) becomes `useStudioRouter().Link` to `buildFileHref(path, fromSlug)`. The default target is `/eng/file/<path>?from=/eng/<slug>`. Code already inside an `<a>` is not wrapped (`InsideAnchorContext`).
- With no `AnnotationProvider`, `useAnnotationBlock` returns `null` and blocks render as plain semantic HTML. `h1` is never decorated.
- `AnnotatableDoc` mounts `<AnnotationProvider decorator>` around `EngMarkdown`. For each block, the decorator computes:
  - an `anchorId` of the form `a-<kind>-<fnv1a(first 80 chars)>`, with `pre` shown as `code`;
  - a location from the mdast `node.position` line range plus `buildSectionMap(body)`, which maps each line to the nearest preceding heading and ignores headings inside ``` fences;
  - the result, returned as `id`, `data-anchor-*` attributes, the `anchor` classes, an `onClick` handler, and a gutter count/`+` prefix.
- Block click starts a draft. A text selection inside a `[data-anchor-id]` block within this root (tracked through `selectionchange`) shows a flyout. It is a hint while the mouse is down and an "Annotate …" button after mouseup. The selected span is stored as `{spanText, spanStart}`, where `spanStart` is a character offset into the block's `textContent`.
- Span highlights use the CSS Custom Highlight API with no DOM mutation. `findRangeInBlock` rebuilds each Range by walking text nodes, and drops it if the text no longer matches. The registry names are `eng-doc-anno-<slug>-ephemeral|pinned|draft`, and the matching `::highlight()` rules come from the inline `<style>{annotatorCss(slug)}</style>`.
- State: the `annotations` array lives in component state, mirrored to sessionStorage under `storageKey ?? studio.annotations.<slug>`. Every change calls `onAnnotationsChange(annotations)`, which receives both ephemeral and pinned notes. The component never writes files. Consumers pair it with `persistAnnotations` and a server route, which the code comments place in an example studio app.
- Ship: `buildPayload` uses only the unpinned notes, plus `formatDmPayload` text and the chosen `sendTargets` id. Copy writes to the clipboard. Send awaits `onSendPass` (the Send button is shown only when that prop is set). On success both paths drop the ephemeral notes and keep the pinned ones.
- Dictation uses the `voiceInput` prop (hudsonkit/voice shape) when it is supplied. Transcripts are appended to the draft through `lastTranscript`. Without the prop, it falls back to the browser `SpeechRecognition` / `webkitSpeechRecognition`.
- `src/doc/decisions.ts` is consumed by `src/app-shell/commands.ts` and `src/registry/define.ts`. `annotationsToDecisions` maps only pinned annotations and classifies them by keyword.
- `CodeViewer`: the `theme(mode)` builder defaults to `studioCodeTheme`, plus `languageForFilename(filename)` and `extraExtensions`. It always sets `EditorView.editable.of(false)` and `tabindex=0`. CodeMirror's own theme is `"none"`.

## Invariants and traps

- The default `buildFileHref` and `formatDmPayload` ("Source: /eng/<slug>") hardcode an `/eng/` route scheme. Consumers on other routes must pass `buildFileHref`, and they cannot change the DM source line.
- Inline-vs-block code detection is `!className`. A block whose `<code>` has no language class takes the inline path, where autolinking can apply.
- `anchorIdFor` hashes only kind + the first 80 characters of text. Two blocks of the same kind with identical openings get the same DOM `id`, so their notes, counts, and highlights merge.
- Editing a block's opening text changes its anchor id. Existing notes then lose their block, and `scrollToAnchor` and highlights silently no-op. The locator triple (section · lines · quote) is kept on the note for this case.
- `slug` is interpolated unescaped into Highlight registry names and `::highlight()` selectors. A slug containing `/`, `.`, or spaces produces invalid CSS, so span tones do not paint.
- The highlight effect feature-detects `CSS.highlights` and `Highlight`. In engines without support, spans are recorded but not painted.
- `onAnnotationsChange` runs in an effect keyed on `[annotations, onAnnotationsChange]`. It fires on mount with `[]` before the sessionStorage hydration commits, which can overwrite a sidecar with an empty list. An inline callback re-fires it on every render. Errors are swallowed.
- Two annotators with the same slug in one tab share sessionStorage unless `storageKey` is set.
- Note ids are `n${Date.now()}`, and decision ids are `win-`/`turn-${Date.now()}`, so ids can collide within one millisecond.
- `annotationsToDecisions` uses substring matching: `"no"` matches "note", "know", and similar words, so many notes become `rejection`. Treat it as a placeholder heuristic, as its comment says.
- `persistAnnotations` and `fetchPersistedAnnotations` default to `/api/studio/annotations`, which this package does not implement. Fetch errors become `{ok:false}` / `null` and are never thrown.
- `.eng-sheet` and `.eng-sheet__row` are not styled in `src/doc/eng-doc.css`. Per the component comment, the host app owns that CSS. `DataRow` also uses Tailwind tokens (`tracking-eyebrow`, `text-studio-ink-faint`).
- `AnnotatableDoc`'s injected CSS is self-contained with no Tailwind, so it works without scanning `studio/**`. `EngMarkdown` relies on `studio/doc.css` being imported for any styling.
- `CodeViewer` starts in `dark` (unless controlled) and switches after mount, so light-mode users can see a brief dark flash. `data-attribute` mode treats any value other than `lightValue` as dark.
- `languageForFilename` covers swift, ts/tsx/js/jsx, md/mdx, json, css/scss, html/htm, sh/bash/zsh, yaml/yml, toml, rs, go, py, and sql. `EngMarkdown`'s viewable list also includes mjs, cjs, and txt, which link to a viewer that renders them as plain text.
- All doc and code components are client components (`"use client"`, except `EngDocSheet`, `decisions`, and `persist`, which have no hooks).
