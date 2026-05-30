"use client";

import { createElement } from "react";
import { Boxes, Compass } from "lucide-react";
import { StudioHudsonApp } from "studio/app-shell";
import { NextRouterProvider } from "studio/router/next";
import { renderStudioPage } from "@/studio/StudioPages";
import {
  BUCKETS,
  HOME_HREF,
  STATUS_COLORS,
  registry,
  statusPalette,
} from "@/studio/studioRegistry";

export function StudioApp() {
  return (
    <StudioHudsonApp
      app={{
        id: "studio-package",
        name: "Studio",
        description: "Shared Hudson-backed design-studio primitives.",
        icon: createElement(Boxes, { size: 14 }),
        leftPanel: {
          title: "Studio",
          icon: createElement(Compass, { size: 12 }),
        },
      }}
      registry={registry}
      buckets={BUCKETS}
      statusColors={STATUS_COLORS}
      renderStatusPill={(status) => statusPalette.StatusPill({ status })}
      renderPage={renderStudioPage}
      homeHref={HOME_HREF}
      routerProvider={NextRouterProvider}
      theme={{
        storageKey: "studio.app.theme",
        defaultTheme: "dark",
        defaultTemplate: "hudson",
      }}
    />
  );
}
