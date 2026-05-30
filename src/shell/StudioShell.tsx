"use client";

import { Suspense, type ReactNode } from "react";
import { useStudioRouter } from "../router";

export interface StudioShellProps {
  children: ReactNode;
  /** Whole sidebar element — compose with `StudioSidebar` or hand-roll. */
  sidebar: ReactNode;
  /** Per-page header strip — compose with `PageStrip` or hand-roll. */
  pageStrip: ReactNode;
  /**
   * Search-param key that opts out of chrome (sidebar + strip) for
   * fullscreen mocks / screenshots. `?focus=1` or `?focus=true`.
   * Defaults to "focus".
   */
  focusParam?: string;
  /**
   * Sidebar width in px. Defaults to reading the `--studio-sidebar-width`
   * CSS var (which `StudioSidebar` publishes when `resizable` is enabled),
   * falling back to 220px when the var is unset.
   *
   * Pass a literal number to pin the layout — back-compat for fixed-width
   * sidebar consumers.
   */
  sidebarWidth?: number;
}

/**
 * Top-level shell — persistent sidebar + per-page strip + main content.
 * Focus mode (driven by a query param) hides the chrome entirely.
 */
export function StudioShell(props: StudioShellProps) {
  return (
    <Suspense fallback={<ShellLayout {...props} focusMode={false} />}>
      <ShellInner {...props} />
    </Suspense>
  );
}

function ShellInner(props: StudioShellProps) {
  const { useSearchParams } = useStudioRouter();
  const params = useSearchParams();
  const key = props.focusParam ?? "focus";
  const v = params.get(key);
  const focusMode = v === "1" || v === "true";
  return <ShellLayout {...props} focusMode={focusMode} />;
}

function ShellLayout({
  children,
  sidebar,
  pageStrip,
  sidebarWidth,
  focusMode,
}: StudioShellProps & { focusMode: boolean }) {
  if (focusMode) {
    return <main className="min-h-screen">{children}</main>;
  }

  // When `sidebarWidth` is a number → pin to it (back-compat).
  // Otherwise → use the live CSS var the sidebar publishes, with a 220px fallback.
  const mainOffset =
    typeof sidebarWidth === "number"
      ? `${sidebarWidth}px`
      : "var(--studio-sidebar-width, 220px)";

  return (
    <div className="min-h-screen">
      {sidebar}
      <div
        className="flex min-h-screen flex-col"
        style={{ marginLeft: mainOffset }}
      >
        {pageStrip}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
