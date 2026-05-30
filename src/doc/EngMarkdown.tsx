"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useStudioRouter } from "../router";
import {
  useAnnotationBlock,
  type MdNode,
} from "./AnnotationContext";

const InsideAnchorContext = createContext(false);

const DEFAULT_VIEWABLE_EXTENSIONS = [
  "swift",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "md",
  "mdx",
  "json",
  "css",
  "scss",
  "html",
  "htm",
  "sh",
  "bash",
  "zsh",
  "yaml",
  "yml",
  "toml",
  "txt",
  "rs",
  "go",
  "py",
  "sql",
] as const;

export interface EngMarkdownProps {
  body: string;
  /**
   * Source doc slug. When set, path-like inline `code` becomes a link
   * built via `buildFileHref(path, fromSlug)`.
   */
  fromSlug?: string;
  /**
   * Tightens vertical rhythm — for use inside a header data sheet
   * where the surrounding grid row already supplies padding.
   */
  compact?: boolean;
  /**
   * Convert a path detected in inline `code` to a route. Receives the
   * cleaned path (line suffix stripped) and the optional `fromSlug`.
   * Default: `/eng/file/<path>?from=/eng/<slug>`.
   */
  buildFileHref?: (path: string, fromSlug?: string) => string;
  /**
   * File extensions (without leading dot) that should be treated as
   * viewable in inline `code` autolinking. Defaults to a wide set
   * covering TS/JS/Swift/markup/config/SQL/Go/Rust/Python.
   */
  viewableExtensions?: ReadonlyArray<string>;
  className?: string;
}

/**
 * Markdown renderer for engineering docs. GFM enabled, headings get
 * stable ids for deep-linking, inline `code` that looks like a repo
 * path becomes a link via `buildFileHref`.
 *
 * Visual styling lives in `.eng-doc` in the host app's stylesheet —
 * this component only emits semantic markup plus a handful of
 * structural class hooks (`eng-codeblock`, `eng-table-wrap`).
 */
export function EngMarkdown({
  body,
  fromSlug,
  compact = false,
  buildFileHref = defaultBuildFileHref,
  viewableExtensions,
  className,
}: EngMarkdownProps) {
  const isViewablePath = useMemo(
    () => makeIsViewablePath(viewableExtensions ?? DEFAULT_VIEWABLE_EXTENSIONS),
    [viewableExtensions],
  );

  const components = useMemo(
    () => buildComponents({ fromSlug, buildFileHref, isViewablePath }),
    [fromSlug, buildFileHref, isViewablePath],
  );

  const classes = ["eng-doc", compact ? "eng-doc--compact" : null, className]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={components}
      >
        {body}
      </ReactMarkdown>
    </article>
  );
}

function makeIsViewablePath(
  extensions: ReadonlyArray<string>,
): (text: string) => { path: string } | null {
  const alt = extensions.map(escapeRegExp).join("|");
  const re = new RegExp(`\\.(${alt})(?::\\d+(?:-\\d+)?)?$`, "i");
  return (text: string) => {
    if (!text) return null;
    if (text.includes("://")) return null;
    if (text.startsWith("http") || text.startsWith("//")) return null;
    if (!text.includes("/")) return null;
    if (!re.test(text)) return null;
    const cleaned = text.replace(/:\d+(?:-\d+)?$/, "");
    return { path: cleaned };
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultBuildFileHref(p: string, fromSlug?: string): string {
  const segments = p.split("/").map((s) => encodeURIComponent(s));
  const from = fromSlug
    ? `?from=${encodeURIComponent(`/eng/${fromSlug}`)}`
    : "";
  return `/eng/file/${segments.join("/")}${from}`;
}

interface BuildComponentsCtx {
  fromSlug: string | undefined;
  buildFileHref: (path: string, fromSlug?: string) => string;
  isViewablePath: (text: string) => { path: string } | null;
}

function buildComponents(ctx: BuildComponentsCtx): Components {
  return {
    // h1 is the page title — intentionally not annotatable.
    h1: ({ children }) => <h1 id={slugify(children)}>{children}</h1>,
    h2: ({ node, children }) => (
      <AnnotatableHeading kind="h2" node={node as MdNode | undefined}>
        {children}
      </AnnotatableHeading>
    ),
    h3: ({ node, children }) => (
      <AnnotatableHeading kind="h3" node={node as MdNode | undefined}>
        {children}
      </AnnotatableHeading>
    ),
    h4: ({ node, children }) => (
      <AnnotatableHeading kind="h4" node={node as MdNode | undefined}>
        {children}
      </AnnotatableHeading>
    ),
    p: ({ node, children }) => (
      <AnnotatableParagraph node={node as MdNode | undefined}>
        {children}
      </AnnotatableParagraph>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target={href?.startsWith("http") ? "_blank" : undefined}
        rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        <InsideAnchorContext.Provider value={true}>
          {children}
        </InsideAnchorContext.Provider>
      </a>
    ),
    li: ({ node, children }) => (
      <AnnotatableListItem node={node as MdNode | undefined}>
        {children}
      </AnnotatableListItem>
    ),
    blockquote: ({ node, children }) => (
      <AnnotatableBlockquote node={node as MdNode | undefined}>
        {children}
      </AnnotatableBlockquote>
    ),
    code: (props) => <CodeRenderer {...props} ctx={ctx} />,
    pre: ({ node, children }) => (
      <CodeBlock node={node as MdNode | undefined}>{children}</CodeBlock>
    ),
    table: ({ children }) => (
      <div className="eng-table-wrap">
        <table>{children}</table>
      </div>
    ),
  };
}

/**
 * Spread the optional annotation decoration onto a block element.
 * When no `AnnotationProvider` is mounted the block renders unchanged.
 *
 * Headings keep their slug-id by default; if the decoration provides an
 * `id` (anchor-id), it wins — annotation anchors are addressed by that id.
 */
function AnnotatableHeading({
  kind,
  node,
  children,
}: {
  kind: "h2" | "h3" | "h4";
  node?: MdNode;
  children?: ReactNode;
}) {
  const deco = useAnnotationBlock(kind, node, children);
  const slug = slugify(children);
  const Tag = kind as "h2" | "h3" | "h4";
  if (!deco) return <Tag id={slug}>{children}</Tag>;
  return (
    <Tag id={slug} {...(deco.extraProps as Record<string, unknown>)}>
      {deco.prefix}
      {children}
    </Tag>
  );
}

function AnnotatableParagraph({
  node,
  children,
}: {
  node?: MdNode;
  children?: ReactNode;
}) {
  const deco = useAnnotationBlock("p", node, children);
  if (!deco) return <p>{children}</p>;
  return (
    <p {...(deco.extraProps as Record<string, unknown>)}>
      {deco.prefix}
      {children}
    </p>
  );
}

function AnnotatableListItem({
  node,
  children,
}: {
  node?: MdNode;
  children?: ReactNode;
}) {
  const deco = useAnnotationBlock("li", node, children);
  if (!deco) return <li>{children}</li>;
  return (
    <li {...(deco.extraProps as Record<string, unknown>)}>
      {deco.prefix}
      {children}
    </li>
  );
}

function AnnotatableBlockquote({
  node,
  children,
}: {
  node?: MdNode;
  children?: ReactNode;
}) {
  const deco = useAnnotationBlock("blockquote", node, children);
  if (!deco) return <blockquote>{children}</blockquote>;
  return (
    <blockquote {...(deco.extraProps as Record<string, unknown>)}>
      {deco.prefix}
      {children}
    </blockquote>
  );
}

/**
 * Wrap a <pre> in a card with a language strip. The language label is
 * pulled off the inner <code>'s `language-xxx` class (added by
 * react-markdown + rehype-highlight). When an `AnnotationProvider` is
 * mounted the outer card also picks up anchor metadata + click handlers.
 */
function CodeBlock({
  node,
  children,
}: {
  node?: MdNode;
  children?: ReactNode;
}) {
  const lang = extractLanguage(children);
  const deco = useAnnotationBlock("pre", node, children);
  const baseClass = "eng-codeblock";
  const extra = deco?.extraProps as
    | (Record<string, unknown> & { className?: string })
    | undefined;
  const className = [baseClass, extra?.className]
    .filter(Boolean)
    .join(" ");
  const spreadProps = extra ? { ...extra, className } : { className };
  return (
    <div {...(spreadProps as Record<string, unknown>)}>
      {deco?.prefix}
      <div className="eng-codeblock__strip">
        <span className="eng-codeblock__dot" />
        <span className="eng-codeblock__lang">{lang ?? "code"}</span>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function extractLanguage(node: ReactNode): string | null {
  if (!node) return null;
  // <pre><code class="language-foo hljs language-bar">...</code></pre>
  const arr = Array.isArray(node) ? node : [node];
  for (const child of arr) {
    if (child && typeof child === "object" && "props" in child) {
      const element = child as ReactElement<{ className?: string }>;
      const className = element.props?.className;
      if (typeof className === "string") {
        const match = className.match(/language-([\w+-]+)/);
        if (match) return match[1].toUpperCase();
      }
    }
  }
  return null;
}

function CodeRenderer({
  className,
  children,
  node: _node,
  ctx,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  node?: unknown;
  ctx: BuildComponentsCtx;
  children?: ReactNode;
}) {
  const insideAnchor = useContext(InsideAnchorContext);
  const { Link } = useStudioRouter();
  const isInline = !className;
  if (isInline) {
    const text = extractText(children);
    const viewable = ctx.isViewablePath(text);
    if (viewable && !insideAnchor) {
      return (
        <Link href={ctx.buildFileHref(viewable.path, ctx.fromSlug)}>
          <code>{children}</code>
        </Link>
      );
    }
    return <code {...rest}>{children}</code>;
  }
  // Block code — className contains language-xxx, rehype-highlight adds tokens.
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function slugify(node: ReactNode): string {
  const text = extractText(node);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractText(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props: { children?: ReactNode } }).props;
    return extractText(props.children);
  }
  return "";
}
