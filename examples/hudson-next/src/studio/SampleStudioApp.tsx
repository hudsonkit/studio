"use client";

import { createElement } from "react";
import { Compass, Layers } from "lucide-react";
import { StudioHudsonApp } from "studio/app-shell";
import { NextRouterProvider } from "studio/router/next";
import { renderSamplePage } from "@/studio/StudioPages";
import {
  BUCKETS,
  HOME_HREF,
  STATUS_COLORS,
  registry,
  statusPalette,
} from "@/studio/studioRegistry";

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
