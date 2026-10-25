"use client";

import { Fragment, type ComponentType, type ReactNode } from "react";
import type { CommandOption, HudsonApp, StatusColor } from "hudsonkit";
import { AppShell, type AppShellChromeOptions } from "hudsonkit/app-shell";
import { ThemeProvider, type ThemeProviderProps } from "hudsonkit/theme";
import type { StudioPage, StudioRegistry } from "../registry";
import { useStudioRouter } from "../router";
import { PageStrip, RegistryNav, SidebarLink, SidebarSectionTitle, type BucketSpec } from "../shell";
import { StudioLiveView, STUDIO_LIVE_ENDPOINT } from "../live";

type ShellAppConfig = Pick<
  HudsonApp,
  "id" | "name" | "description" | "agentContext" | "icon" | "leftPanel" | "rightPanel"
>;

const DefaultStudioProvider: HudsonApp["Provider"] = ({ children }) => <>{children}</>;

export interface StudioHudsonRenderContext<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  pathname: string;
  page: StudioPage<Bucket, Surface, Status> | undefined;
  registry: StudioRegistry<Bucket, Surface, Status>;
  /** Pages supplied at runtime through `useExtraPages`. */
  extraPages: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
}

export interface StudioHudsonAppProps<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  app: ShellAppConfig;
  registry: StudioRegistry<Bucket, Surface, Status>;
  buckets: ReadonlyArray<BucketSpec<Bucket, Surface, Status>>;
  statusColors: Record<Status, string>;
  renderPage: (context: StudioHudsonRenderContext<Bucket, Surface, Status>) => ReactNode;
  renderStatusPill?: (status: Status) => ReactNode;
  /**
   * Pages that exist only at runtime (e.g. agent pages from the host daemon).
   * They join the registry for routing, the sidebar and the page strip.
   */
  useExtraPages?: () => ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  homeHref?: string;
  resolvePath?: (pathname: string | null, homeHref: string) => string;
  commands?: CommandOption[];
  useCommands?: () => CommandOption[];
  status?: { label: string; color: StatusColor };
  useStatus?: () => { label: string; color: StatusColor };
  navCenter?: ReactNode;
  useNavCenter?: () => ReactNode | null;
  navActions?: ReactNode;
  useNavActions?: () => ReactNode | null;
  routerProvider?: ComponentType<{ children: ReactNode }>;
  provider?: HudsonApp["Provider"];
  theme?: false | Omit<ThemeProviderProps, "children">;
  assistant?: boolean;
  managedTheme?: boolean;
  chrome?: AppShellChromeOptions;
  contentClassName?: string;
  /**
   * The study live view, on by default at `<homeHref>/live`: it follows
   * whichever study's files change and renders it with `renderPage`. Needs
   * the host route `export { POST } from "studio/live/server"` at
   * `app/api/studio/live/route.ts` (or `endpoint`). `false` leaves it out.
   */
  live?: false | StudioLiveOptions;
}

export interface StudioLiveOptions {
  href?: string;
  label?: string;
  endpoint?: string;
}

function liveRoute(homeHref: string, live: false | StudioLiveOptions) {
  if (live === false) return undefined;
  return {
    href: live.href ?? `${homeHref.replace(/\/+$/, "")}/live`,
    label: live.label ?? "Live view",
    endpoint: live.endpoint ?? STUDIO_LIVE_ENDPOINT,
  };
}

export function StudioHudsonApp<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  app,
  registry,
  buckets,
  statusColors,
  renderPage,
  renderStatusPill,
  useExtraPages = useNoExtraPages,
  homeHref = "/",
  resolvePath = defaultResolvePath,
  commands = [],
  useCommands,
  status = { label: "Ready", color: "emerald" },
  useStatus,
  navCenter = null,
  useNavCenter,
  navActions = null,
  useNavActions,
  routerProvider: RouterProvider = Fragment,
  provider: StudioProvider = DefaultStudioProvider,
  theme = {},
  assistant = false,
  managedTheme = false,
  chrome = {
    palette: true,
    terminal: false,
    rightPanel: false,
  },
  contentClassName = "studio-content min-h-full bg-studio-canvas text-studio-ink",
  live = {},
}: StudioHudsonAppProps<Bucket, Surface, Status>) {
  const liveView = liveRoute(homeHref, live);

  const StudioLeftPanel = () => {
    const pathname = useStudioRouter().usePathname();
    return (
      <RegistryNav
        registry={registry}
        buckets={buckets}
        extraPages={useExtraPages()}
        statusColors={statusColors}
        leading={
          liveView ? (
            <section>
              <SidebarSectionTitle>Live</SidebarSectionTitle>
              <div className="mt-1.5 flex flex-col">
                <SidebarLink href={liveView.href} active={pathname === liveView.href}>
                  <span className="flex-1 truncate">{liveView.label}</span>
                </SidebarLink>
              </div>
            </section>
          ) : null
        }
      />
    );
  };

  const StudioContent = () => {
    const pathname = resolvePath(useStudioRouter().usePathname(), homeHref);
    const extraPages = useExtraPages();
    const page = registry.pageForPath(pathname, extraPages);

    // A host page registered at the same href wins over the built-in view.
    if (liveView && !page && pathname === liveView.href) {
      return (
        <div className={contentClassName}>
          <StudioLiveView
            registry={registry}
            extraPages={extraPages}
            excludeHrefs={[homeHref, liveView.href]}
            endpoint={liveView.endpoint}
            renderStage={(stagePage) =>
              renderPage({ pathname: stagePage.href, page: stagePage, registry, extraPages })
            }
          />
        </div>
      );
    }

    return (
      <div className={contentClassName}>
        <PageStrip
          registry={registry}
          extraPages={extraPages}
          renderStatusPill={renderStatusPill}
        />
        {renderPage({ pathname, page, registry, extraPages })}
      </div>
    );
  };

  const hudsonApp: HudsonApp = {
    ...app,
    mode: "panel",
    Provider: StudioProvider,
    slots: {
      Content: StudioContent,
      LeftPanel: StudioLeftPanel,
    },
    hooks: {
      useCommands: useCommands ?? (() => commands),
      useStatus: useStatus ?? (() => status),
      useNavCenter: useNavCenter ?? (() => navCenter),
      useNavActions: useNavActions ?? (() => navActions),
    },
  };

  const shell = (
    <RouterProvider>
      <AppShell
        app={hudsonApp}
        assistant={assistant}
        managedTheme={managedTheme}
        chrome={chrome}
      />
    </RouterProvider>
  );

  if (theme === false) return shell;
  return <ThemeProvider {...theme}>{shell}</ThemeProvider>;
}

const NO_EXTRA_PAGES: ReadonlyArray<never> = [];

function useNoExtraPages() {
  return NO_EXTRA_PAGES;
}

function defaultResolvePath(pathname: string | null, homeHref: string): string {
  if (!pathname || pathname === `${homeHref}/`) return homeHref;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}
