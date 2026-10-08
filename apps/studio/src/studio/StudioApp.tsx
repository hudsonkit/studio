"use client";

import { createElement } from "react";
import { Boxes, Compass, Send } from "lucide-react";
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
import { StudioScoutProvider, useStudioScout } from "@/studio/StudioScoutProvider";
import { AgentPagesNav, useAgentRegistryPages, useAgentStatus } from "@/studio/agentPages";

// Agent pages lead the sidebar: they are the live work waiting on a reviewer.
const SIDEBAR_BUCKETS = [
  { key: "agents" as const, render: (context: Parameters<typeof AgentPagesNav>[0]) => createElement(AgentPagesNav, context) },
  ...BUCKETS,
];

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
      buckets={SIDEBAR_BUCKETS}
      useExtraPages={useAgentRegistryPages}
      useStatus={useAgentStatus}
      statusColors={STATUS_COLORS}
      renderStatusPill={(status) => statusPalette.StatusPill({ status })}
      renderPage={renderStudioPage}
      homeHref={HOME_HREF}
      navActions={<ScoutNavAction />}
      provider={StudioScoutProvider}
      routerProvider={NextRouterProvider}
      theme={{
        storageKey: "studio.app.theme",
        defaultTheme: "dark",
        defaultTemplate: "hudson",
      }}
    />
  );
}

function ScoutNavAction() {
  const { open, openScout } = useStudioScout();
  return (
    <button
      type="button"
      onClick={openScout}
      aria-expanded={open}
      className="inline-flex items-center gap-2 border border-studio-rule px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-studio-ink-faint transition hover:border-studio-rule-strong hover:text-studio-ink-strong"
    >
      Message Scout
      <Send size={11} />
    </button>
  );
}
