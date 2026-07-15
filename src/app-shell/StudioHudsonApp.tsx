"use client";

import { Fragment, type ComponentType, type ReactNode } from "react";
import type { CommandOption, HudsonApp, StatusColor } from "hudsonkit";
import { AppShell, type AppShellChromeOptions } from "hudsonkit/app-shell";
import { ThemeProvider, type ThemeProviderProps } from "hudsonkit/theme";
import type { StudioPage, StudioRegistry } from "../registry";
import { useStudioRouter } from "../router";
import { PageStrip, RegistryNav, type BucketSpec } from "../shell";

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
  contentClassName = "min-h-full bg-studio-canvas text-studio-ink",
}: StudioHudsonAppProps<Bucket, Surface, Status>) {
  const StudioLeftPanel = () => (
    <RegistryNav
      registry={registry}
      buckets={buckets}
      statusColors={statusColors}
    />
  );

  const StudioContent = () => {
    const pathname = resolvePath(useStudioRouter().usePathname(), homeHref);
    const page = registry.pageForPath(pathname);

    return (
      <div className={contentClassName}>
        <PageStrip
          registry={registry}
          renderStatusPill={renderStatusPill}
        />
        {renderPage({ pathname, page, registry })}
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

function defaultResolvePath(pathname: string | null, homeHref: string): string {
  if (!pathname || pathname === `${homeHref}/`) return homeHref;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}
