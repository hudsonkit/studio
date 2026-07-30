/**
 * Numbered first-party Studio proposals. Kept in plain strings for now so the
 * example app can render them without a markdown file loader.
 */

export const STU_001_HUDSON_INSERTION_POINTS = `# STU-001 - Hudson insertion points for Studio mode

## Status

Proposal.

Verified end to end on 2026-07-30: a highlight on this section produced a review
pass that dispatched over Scout to a local agent and arrived with its section
anchor, heading level, source URL, and studio/surface footer intact. Highlights
persist through the sidecar route to
\`.studio/annotations/stu-001-hudson-insertion-points.json\`, and the send path
resolves its target from the same agent registry that backs the drawer picker.

Note the shape of what was verified. The loop works because Studio rendered this
document at a Studio route, so every annotatable region was one Studio owned.
Annotating the real app surface is the case this proposal exists for, and it
still needs the insertion-point contract below.

## Target

Hudson Kit should own the insertion-point primitive. Studio should own the
dev-time study registry, target selection UI, and active substitutions.

## Problem

Studio currently works best as a route-level environment: a product repo
registers pages, docs, and studies, then the Studio shell renders them. That is
useful for review, but it is not enough for fast product iteration inside the
actual app surface.

The tempting workaround is DOM injection: find a selector in development, mount
a study there, and mutate the running app. That solves the symptom but misses
the root cause. The app has not declared which regions are safe to substitute,
what context they expose, or which replacement modes are allowed.

## Root Cause

Hudson Kit already gives apps a stable shell contract with Provider, slots, and
hooks. The missing layer is a smaller contract inside those slots. A Hudson app
can say "this Content slot exists", but it cannot yet say "this page section,
navigation region, or object inspector is a controlled insertion point".

Studio mode should build on that missing Hudson capability instead of patching
around it.

## Proposal

Add a Hudson Kit insertion-point primitive that every Hudson-powered web or
native app can opt into:

~~~~tsx
<HudsonInsertionPoint
  id="project.nav.primary"
  scope="navigation"
  surface="web"
  allowedModes={["replace", "before", "after", "overlay", "decorate"]}
  context={{ projectId }}
>
  <ProjectNav />
</HudsonInsertionPoint>
~~~~

Then let Studio studies target those insertion points:

~~~~ts
{
  id: "project-nav-density-v2",
  title: "Project nav density v2",
  target: {
    anchor: "project.nav.primary",
    route: "/projects/[id]",
    surface: "web",
    mode: "replace"
  }
}
~~~~

The app declares where controlled substitution is allowed. Studio decides what
to substitute while development mode is active.

## Insertion Scopes

| Scope | Purpose | Examples |
| --- | --- | --- |
| shell | Global Hudson chrome and persistent app frame | nav center, nav actions, status area |
| navigation | Product navigation within a shell or app | sidebar tree, tab strip, breadcrumbs |
| app | Hudson app slots and high-level app regions | Content, LeftPanel, Inspector, Chat |
| page | Route-level content wrappers | page header, primary body, empty state |
| section | Product sections inside a page | settings group, activity feed, detail summary |
| component | Reusable component boundaries | card, table toolbar, picker, command row |
| object | Selected entity or inspector surface | issue detail, file preview, agent run |

The scopes are not layout instructions. They are stable names for intent,
review, and tooling.

## Mount Modes

| Mode | Meaning |
| --- | --- |
| replace | Render the study instead of the fallback children |
| before | Render the study before the fallback children |
| after | Render the study after the fallback children |
| overlay | Render the study in a positioned layer tied to the anchor geometry |
| decorate | Render fallback children and pass metadata to a wrapper study |

An insertion point should declare its allowed modes. Studio must not activate a
mode the host did not allow.

## Web Runtime

Hudson Kit exports:

- \`HudsonInsertionProvider\`
- \`HudsonInsertionPoint\`
- \`useHudsonInsertionRegistry\`
- types for scope, surface, mode, anchor metadata, and serializable context

In production, the default provider renders children and does no work. In
development, it registers anchors with a workspace-scoped registry, exposes
context to Studio, tracks geometry for overlay mode, and resolves active study
targets.

No selector scraping is part of the contract. If a region is not declared as an
insertion point, Studio cannot replace it.

## Native Runtime

The native API should mirror the web model:

~~~~swift
ProjectNav()
  .hudsonInsertionPoint(
    "project.nav.primary",
    scope: .navigation,
    surface: .macOS
  )
~~~~

On macOS, Hudson Kit Native can register the anchor, report geometry to Studio
mode, and choose one of three render paths:

1. Native fallback view only.
2. Native replacement view when the study has a native implementation.
3. \`WKWebView\` replacement or overlay when the study is web-authored.

The web view is an iteration surface, not the permanent source of truth for
native app behavior.

## Studio Responsibilities

Studio adds a dev runtime on top of Hudson insertion points:

- Study registry entries with optional \`target\` metadata.
- Active-substitution state scoped by workspace, route, surface, and anchor.
- A picker for choosing the active study at an anchor.
- Comparison modes for fallback versus study.
- Screenshot and review workflows once an active substitution is selected.

The existing Studio page registry stays useful. A study can still have a normal
Studio route while also declaring where it mounts inside the real app.

## Proposed Types

~~~~ts
type HudsonInsertionScope =
  | "shell"
  | "navigation"
  | "app"
  | "page"
  | "section"
  | "component"
  | "object";

type HudsonInsertionMode =
  | "replace"
  | "before"
  | "after"
  | "overlay"
  | "decorate";

interface HudsonInsertionAnchor<Context = unknown> {
  id: string;
  scope: HudsonInsertionScope;
  surface: "web" | "macos" | "ios" | "cross";
  route?: string;
  allowedModes: HudsonInsertionMode[];
  context?: Context;
}

interface StudioStudyTarget {
  anchor: string;
  route?: string;
  surface?: "web" | "macos" | "ios" | "cross";
  mode: HudsonInsertionMode;
}
~~~~

## Rollout

1. Add the inert Hudson Kit web primitive and tests that production mode renders
   fallback children exactly.
2. Add a dev registry that records anchors and active substitutions.
3. Extend Studio page metadata with optional \`target\` fields.
4. Wire a first web host app with navigation, page, section, and object anchors.
5. Add the native modifier and a minimal macOS \`WKWebView\` render path.

## Non-Goals

- Replacing arbitrary DOM nodes by selector.
- Making every component substitutable by default.
- Shipping active Studio substitutions to production users.
- Treating web-view prototypes as final native implementations.

## Open Questions

- Should anchor ids be globally unique, or namespaced by app id and route?
- Should insertion context be fully serializable, or can React-only context be
  allowed for same-tree web studies?
- Should Studio persist active substitutions in local storage, URL params, or a
  workspace service?
- How much native replacement should be first-class before the web-view path is
  enough for early iteration?
`;
