/**
 * Host-served compat shim for `next/navigation` inside synced studio
 * sources. Navigation is a full page load per route, so hooks read the
 * current location once. `usePathname` strips the studio mount segment
 * so components compare against the same root-relative paths the local
 * Next app serves (`/agent-bay`, not `/talkie/agent-bay`).
 *
 * The host shell publishes the matched route's params on
 * `window.__studioRoute` before modules load; `useParams` reads them.
 */

interface StudioRoute {
  params?: Record<string, string>;
}

declare global {
  interface Window {
    __studioRoute?: StudioRoute;
  }
}

function unmounted(pathname: string): string {
  const first = location.pathname.split("/").filter(Boolean)[0];
  const prefix = first ? `/${first}` : "";
  const rest = prefix && pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname;
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function usePathname(): string {
  return unmounted(location.pathname);
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(location.search);
}

export function useParams(): Record<string, string> {
  return window.__studioRoute?.params ?? {};
}

export function useRouter(): { push: (href: string) => void; replace: (href: string) => void; back: () => void } {
  return {
    push: (href) => location.assign(href),
    replace: (href) => location.replace(href),
    back: () => history.back(),
  };
}
