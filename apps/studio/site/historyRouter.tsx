import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { StudioRouterProvider, type StudioLinkProps, type StudioRouter } from "studio/router";

/**
 * Client-side router for the static site. Registry hrefs are already rooted at
 * `/studio`, which is where the site is served, so paths pass through as-is.
 */
function navigate(href: string) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

function isInternal(href: string) {
  return href === "/studio" || href.startsWith("/studio/") || href.startsWith("/studio?");
}

function Link({ href, className, children }: StudioLinkProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isInternal(href) || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

function useLocationValue<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const update = () => setValue(read);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return value;
}

const historyRouter: StudioRouter = {
  Link,
  // The registry keys pages without a trailing slash; `/studio/` is the home page.
  usePathname: () => useLocationValue(() => window.location.pathname.replace(/(.)\/$/, "$1")),
  useSearchParams: () => useLocationValue(() => new URLSearchParams(window.location.search)),
};

export function HistoryRouterProvider({ children }: { children: ReactNode }) {
  return <StudioRouterProvider router={historyRouter}>{children}</StudioRouterProvider>;
}
