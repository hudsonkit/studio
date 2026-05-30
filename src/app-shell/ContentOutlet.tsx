"use client";

import { createContext, useContext, type ReactNode } from "react";

const ContentContext = createContext<ReactNode>(null);

/**
 * Wraps your shell (e.g. `<AppShell>`) and stashes route content in context
 * so the Hudson `AppShell.slots.Content` slot can render it.
 *
 * Required because `HudsonApp.slots.Content` is a `React.FC` with no children
 * prop — there's no first-class outlet pattern for framework consumers
 * (Next layouts, Remix loaders, TanStack routes). Until hudsonkit ships a
 * `<AppShellOutlet>{children}</AppShellOutlet>` companion, every consumer
 * writes this exact pattern.
 *
 * Usage:
 *   // app/layout.tsx
 *   <StudioContentProvider content={children}>
 *     <AppShell app={studioApp} />
 *   </StudioContentProvider>
 *
 *   // in your HudsonApp config
 *   slots: { Content: StudioContentOutlet }
 */
export function StudioContentProvider({
  content,
  children,
}: {
  /** Route content — what the Hudson Content slot should render. */
  content: ReactNode;
  /** Your shell tree (typically `<AppShell app={…} />`). */
  children: ReactNode;
}) {
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>;
}

/** Component to pass as `HudsonApp.slots.Content`. */
export function StudioContentOutlet() {
  const content = useContext(ContentContext);
  return <>{content}</>;
}
