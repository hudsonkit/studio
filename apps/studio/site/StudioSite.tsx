import { createElement } from "react";
import { BookOpen, Boxes, Compass, Github } from "lucide-react";
import { StudioHudsonApp } from "studio/app-shell";
import { renderStudioPage } from "@/studio/StudioPages";
import { BUCKETS, HOME_HREF, STATUS_COLORS, registry, statusPalette } from "@/studio/studioRegistry";
import { HistoryRouterProvider } from "./historyRouter";

/**
 * Studio's first-party studio as a static site, served at hudsonkit.com/studio.
 * Same registry and pages as `StudioApp`, minus what needs the local host:
 * Scout, agent pages, and annotation persistence.
 */
export function StudioSite() {
  return (
    <StudioHudsonApp
      app={{
        id: "studio-package",
        name: "Studio",
        description: "A design studio that lives in your repo.",
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
      navActions={<NavActions />}
      routerProvider={HistoryRouterProvider}
      theme={{
        storageKey: "studio.app.theme",
        defaultTheme: "dark",
        defaultTemplate: "hudson",
      }}
    />
  );
}

const navActionClass =
  "inline-flex items-center gap-2 border border-studio-rule px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-studio-ink-faint transition hover:border-studio-rule-strong hover:text-studio-ink-strong";

function NavActions() {
  return (
    <div className="flex items-center gap-2">
      {/* The Dewey docs site is copied to dist/docs by build:site. */}
      <a href="/studio/docs/" className={navActionClass}>
        Docs
        <BookOpen size={11} />
      </a>
      <GitHubNavAction />
    </div>
  );
}

function GitHubNavAction() {
  return (
    <a
      href="https://github.com/hudsonkit/studio"
      className={navActionClass}
    >
      View on GitHub
      <Github size={11} />
    </a>
  );
}
