"use client";

import { createContext, useContext, type ReactNode } from "react";

export type AnnotationBlockKind =
  | "h2"
  | "h3"
  | "h4"
  | "p"
  | "li"
  | "blockquote"
  | "pre";

export type MdNode = {
  position?: { start?: { line?: number }; end?: { line?: number } };
};

export interface AnnotationBlockDecoration {
  /**
   * Props to spread on the rendered block element.
   * Conventionally: `id`, `data-anchor-*`, `className`, `onClick`.
   */
  extraProps: Record<string, unknown>;
  /**
   * Optional inline node rendered before children (e.g., gutter chip).
   * Renderers that wrap children in their own scaffold (notably `pre`)
   * should respect this by inserting it at the outer wrapper's start.
   */
  prefix?: ReactNode;
}

export type AnnotationDecorator = (params: {
  kind: AnnotationBlockKind;
  node?: MdNode;
  children: ReactNode;
}) => AnnotationBlockDecoration | null;

const AnnotationDecoratorContext = createContext<AnnotationDecorator | null>(
  null,
);

export interface AnnotationProviderProps {
  decorator: AnnotationDecorator;
  children: ReactNode;
}

/**
 * Wrap an `EngMarkdown` to make every block element annotatable.
 * Without a provider, `EngMarkdown` renders plain semantic HTML.
 */
export function AnnotationProvider({
  decorator,
  children,
}: AnnotationProviderProps) {
  return (
    <AnnotationDecoratorContext.Provider value={decorator}>
      {children}
    </AnnotationDecoratorContext.Provider>
  );
}

/**
 * Called by each block renderer in `EngMarkdown`. Returns the decoration
 * supplied by the surrounding `AnnotationProvider`, or `null` when no
 * provider is mounted (default, non-annotated rendering).
 */
export function useAnnotationBlock(
  kind: AnnotationBlockKind,
  node: MdNode | undefined,
  children: ReactNode,
): AnnotationBlockDecoration | null {
  const decorator = useContext(AnnotationDecoratorContext);
  if (!decorator) return null;
  return decorator({ kind, node, children });
}
