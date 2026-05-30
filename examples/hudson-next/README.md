# Hudson Next Studio Sample

This sample shows the intended structure for a repo that wants a proper Hudson-backed studio while keeping all product-specific content local.

```txt
app/
  layout.tsx
  globals.css
  studio/[[...slug]]/page.tsx
src/studio/
  SampleStudioApp.tsx
  studioRegistry.ts
  StudioPages.tsx
```

The important part is that `SampleStudioApp` is thin. The shared package owns the shell:

```tsx
"use client";

import { createElement } from "react";
import { Compass, Layers } from "lucide-react";
import { StudioHudsonApp } from "studio/app-shell";
import { NextRouterProvider } from "studio/router/next";
import {
  BUCKETS,
  HOME_HREF,
  STATUS_COLORS,
  registry,
  statusPalette,
} from "./studioRegistry";
import { renderSamplePage } from "./StudioPages";

export function SampleStudioApp() {
  return (
    <StudioHudsonApp
      app={{
        id: "sample-studio",
        name: "Sample Studio",
        description: "North Star, numbered proposals, and design studies.",
        icon: createElement(Layers, { size: 14 }),
        leftPanel: {
          title: "Studio",
          icon: createElement(Compass, { size: 12 }),
        },
      }}
      registry={registry}
      buckets={BUCKETS}
      statusColors={STATUS_COLORS}
      renderStatusPill={(status) => statusPalette.StatusPill({ status })}
      renderPage={renderSamplePage}
      homeHref={HOME_HREF}
      routerProvider={NextRouterProvider}
      theme={{
        storageKey: "sample.studio.theme",
        defaultTheme: "dark",
        defaultTemplate: "hudson",
      }}
    />
  );
}
```

The registry is the local contract:

```ts
import { createRegistry, type StudioPage } from "studio/registry";
import { createStatusPalette } from "studio/atoms";

export type Bucket = "foundations" | "presentations" | "studies";
export type Surface = "vision" | "engineering" | "design";
export type Status = "active" | "draft" | "study";

type Page = StudioPage<Bucket, Surface, Status>;

export const HOME_HREF = "/studio";

export const pages: Page[] = [
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
    source: ["docs/CTH-001-context-cartridge.md"],
  },
  {
    href: "/studio/studies/planner",
    label: "Planner Workbench",
    bucket: "studies",
    surface: "design",
    status: "study",
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

export const STATUS_COLORS = {
  active: statusPalette.statusToColor("active"),
  draft: statusPalette.statusToColor("draft"),
  study: statusPalette.statusToColor("study"),
};

export const BUCKETS = [
  { key: "foundations" },
  { key: "presentations", title: "CTH Presentations" },
  { key: "studies" },
] as const;
```

Next consumers need source transpilation and Tailwind scanning:

```ts
// next.config.ts
export default {
  transpilePackages: ["studio", "hudsonkit"],
};
```

```css
@import "tailwindcss";
@import "hudsonkit/styles";
@import "studio/theme.css";
@import "studio/doc.css";
@import "studio/shell.css";

@source "../src/**/*.{ts,tsx}";
@source "../node_modules/studio/src/**/*.{ts,tsx}";
@source "../node_modules/hudsonkit/src/**/*.{ts,tsx}";

@theme inline {
  --color-studio-canvas: var(--studio-canvas);
  --color-studio-canvas-alt: var(--studio-canvas-alt);
  --color-studio-surface: var(--studio-surface);
  --color-studio-ink: var(--studio-ink);
  --color-studio-ink-strong: var(--studio-ink-strong);
  --color-studio-ink-faint: var(--studio-ink-faint);
  --color-studio-edge: var(--studio-edge);
  --color-studio-rule: var(--studio-rule);
  --color-studio-rule-strong: var(--studio-rule-strong);
  --color-studio-chip-bg: var(--studio-chip-bg);
  --color-studio-chip-border: var(--studio-chip-border);
  --color-scout-accent: var(--scout-accent);
  --color-scout-accent-soft: var(--scout-accent-soft);
  --tracking-eyebrow: 0.18em;
}
```
