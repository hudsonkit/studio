"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

export interface StudioLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

export interface StudioRouter {
  /**
   * Link component. Consumers supply their framework's primitive
   * (`next/link`, `react-router-dom` Link, tanstack `Link`, etc.).
   * The default fallback is a plain `<a>` — full-page navigation,
   * fine for static studios.
   */
  Link: ComponentType<StudioLinkProps>;
  /** Current pathname. `null` on the server. */
  usePathname(): string | null;
  /** Current search params. Empty on the server. */
  useSearchParams(): URLSearchParams;
}

const StudioRouterContext = createContext<StudioRouter | null>(null);

/**
 * Wrap your app to install a router adapter. Without a provider,
 * studio falls back to plain `<a>` + `window.location` — usable but
 * unaware of SPA client-side navigation.
 */
export function StudioRouterProvider({
  router,
  children,
}: {
  router: StudioRouter;
  children: ReactNode;
}) {
  return (
    <StudioRouterContext.Provider value={router}>
      {children}
    </StudioRouterContext.Provider>
  );
}

export function useStudioRouter(): StudioRouter {
  return useContext(StudioRouterContext) ?? vanillaRouter;
}

const VanillaLink: ComponentType<StudioLinkProps> = ({
  href,
  className,
  children,
}) => (
  <a href={href} className={className}>
    {children}
  </a>
);

function useVanillaPathname(): string | null {
  const [path, setPath] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.location.pathname,
  );
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}

function useVanillaSearchParams(): URLSearchParams {
  const [params, setParams] = useState<URLSearchParams>(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  );
  useEffect(() => {
    const update = () =>
      setParams(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return params;
}

export const vanillaRouter: StudioRouter = {
  Link: VanillaLink,
  usePathname: useVanillaPathname,
  useSearchParams: useVanillaSearchParams,
};
