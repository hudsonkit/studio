import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

export type FlowSurfaceRegion = {
  id: string;
  label: string;
  role?: string;
  note?: string;
};

export type FlowEmbedDefinition = {
  component: ComponentType;
  regions?: readonly FlowSurfaceRegion[];
};

export type FlowEmbedRegistry = Readonly<Record<string, FlowEmbedDefinition>>;

const FlowEmbedContext = createContext<FlowEmbedRegistry>({});

export function FlowEmbedProvider({
  embeds,
  children,
}: {
  embeds?: FlowEmbedRegistry;
  children: ReactNode;
}) {
  return (
    <FlowEmbedContext.Provider value={embeds ?? {}}>
      {children}
    </FlowEmbedContext.Provider>
  );
}

export function useFlowEmbeds(): FlowEmbedRegistry {
  return useContext(FlowEmbedContext);
}

export function embedSlugFromSrc(src: string): string | null {
  if (!src) return null;
  try {
    const path = src.startsWith("http")
      ? new URL(src).pathname
      : src.startsWith("/")
        ? src
        : `/${src}`;
    const match = path.match(/\/embed\/(?:[a-z0-9-]+\/)*([a-z0-9-]+)\/?$/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export function renderEmbedSurface(
  registry: FlowEmbedRegistry,
  src: string,
) {
  const slug = embedSlugFromSrc(src);
  const definition = slug ? registry[slug] : undefined;
  return definition ? createElement(definition.component) : null;
}
