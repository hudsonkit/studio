/**
 * Host-served compat shim for `next/link` inside synced studio sources.
 *
 * Renders a plain anchor, but navigation is a same-document swap: click
 * fetches the target's HTML, reads its boot module + route params, and
 * imports the boot module — which flushSync-renders into the existing
 * #root. The old page stays on screen until the new one is committed,
 * so there is no blank frame. pushState/popstate keep URLs and history
 * working; direct visits and hard reloads still get full server HTML.
 *
 * Root-relative hrefs are prefixed with the current studio's mount path
 * (`/agent-bay` from `/talkie/…` lands on `/talkie/agent-bay`).
 * Hover/focus prefetches the target document so the swap is instant.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

const prefetched = new Set<string>();

function mountPrefix(): string {
  const first = location.pathname.split("/").filter(Boolean)[0];
  return first ? `/${first}` : "";
}

function mountedHref(href: string): string {
  return href.startsWith("/") && typeof location !== "undefined"
    ? `${mountPrefix()}${href}`
    : href;
}

function prefetch(href: string): void {
  if (prefetched.has(href)) return;
  prefetched.add(href);
  void fetch(href, { priority: "low" }).catch(() => prefetched.delete(href));
}

/** Swap the current document's #root with the target page's content,
 *  without a document navigation. Falls back to a full navigation for
 *  pages without a boot script (e.g. the host index). */
async function swapTo(href: string, push: boolean): Promise<void> {
  if (push) history.pushState({}, "", href);
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error(String(response.status));
    const target = new DOMParser().parseFromString(await response.text(), "text/html");
    const bootScript = target.querySelector('script[type="module"][src*="boot-"]');
    const routeScript = [...target.querySelectorAll("script")].find((s) =>
      (s.textContent ?? "").includes("__studioRoute"),
    );
    const src = bootScript?.getAttribute("src");
    if (!src || !routeScript) throw new Error("no boot script");
    // Publish the target page's route params for the useParams shim, then let
    // the boot module flushSync-render into the existing #root.
    new Function(routeScript.textContent ?? "")();
    // Runtime-selected module: the boot module is served in-memory by the host
    // virtual module plugin.
    await import(/* @vite-ignore */ src);
    window.scrollTo(0, 0);
    prefetchTargetLinks();
  } catch {
    // Same-document swap impossible (network, parse, or module error) —
    // a full load always renders the right page.
    location.assign(href);
  }
}

/** Warm same-studio links present in the current document. */
function prefetchTargetLinks(): void {
  if (typeof window === "undefined") return;
  const idle =
    (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ||
    ((cb: () => void) => setTimeout(cb, 200));
  idle(() => {
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')) {
      const href = a.getAttribute("href");
      if (href && !href.startsWith("//")) prefetch(href);
    }
  });
}

let routerInstalled = false;

function installRouter(): void {
  if (routerInstalled || typeof window === "undefined") return;
  routerInstalled = true;
  window.addEventListener("popstate", () => {
    void swapTo(location.pathname + location.search, false);
  });
}

if (typeof window !== "undefined") {
  installRouter();
}

export default function Link({ href, children, ...rest }: LinkProps) {
  const mounted = mountedHref(href);
  const external = rest.target === "_blank" || rest.target === "_top" || href.startsWith("http") || rest.download !== undefined;
  return (
    <a
      href={mounted}
      onMouseEnter={() => prefetch(mounted)}
      onFocus={() => prefetch(mounted)}
      onClick={(event) => {
        if (external || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        installRouter();
        void swapTo(mounted, true);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
