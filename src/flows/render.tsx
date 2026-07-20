/**
 * CompRenderer — maps CompNode trees to layout shells + hudsonkit primitives.
 *
 * Hosts can place pages on any canvas:
 *   {file.pages.map(p => (
 *     <div style={{ position:'absolute', left:p.x, top:p.y, width:p.width, height:p.height }}>
 *       <CompRenderer node={p.root} />
 *     </div>
 *   ))}
 *
 * Does not depend on a design app — just React + optional hudsonkit.
 */

import type { CSSProperties, ReactNode } from "react";
import type { CompNode, FlowPage, FlowTokens } from "./model";

export type { CompNode, FlowPage, FlowTokens, PrimitiveType } from "./model";
export { PRIMITIVES, DEFAULT_TOKENS } from "./model";

export type CompRendererProps = {
  node: CompNode;
  /** Optional: inject real Hud* components; defaults to simple HTML stand-ins. */
  components?: Partial<Record<string, (props: Record<string, unknown> & { children?: ReactNode }) => ReactNode>>;
};

function px(v: unknown, fallback?: number): string | undefined {
  if (v === undefined || v === null) return fallback !== undefined ? `${fallback}px` : undefined;
  if (typeof v === "number") return `${v}px`;
  if (typeof v === "string") return v;
  return undefined;
}

function layoutStyle(props: Record<string, unknown>): CSSProperties {
  const direction = props.direction === "row" ? "row" : "column";
  return {
    display: "flex",
    flexDirection: direction,
    gap: px(props.gap, 0),
    padding: px(props.padding, 0),
    alignItems: (props.align as string) || undefined,
    justifyContent: (props.justify as string) || undefined,
    background: (props.background as string) || undefined,
    border: (props.border as string) || undefined,
    borderRadius: px(props.radius),
    width: px(props.width) ?? (props.width as string | undefined),
    height: px(props.height) ?? (props.height as string | undefined),
    flex: props.flex !== undefined ? String(props.flex) : undefined,
    minWidth: 0,
    minHeight: 0,
    boxSizing: "border-box",
  };
}

function DefaultText({ props }: { props: Record<string, unknown> }) {
  const mono = Boolean(props.mono);
  const serif = Boolean(props.serif);
  const style: CSSProperties = {
    margin: 0,
    fontSize: px(props.size, 14),
    fontWeight: (props.weight as number) || 400,
    color: (props.color as string) || "var(--ink)",
    letterSpacing: (props.tracking as string) || undefined,
    textTransform: props.uppercase ? "uppercase" : undefined,
    lineHeight: px(props.lineHeight) ?? (props.lineHeight as string | undefined),
    fontFamily: mono
      ? "ui-monospace, SFMono-Regular, Menlo, monospace"
      : serif
        ? "Georgia, 'Times New Roman', serif"
        : "system-ui, -apple-system, sans-serif",
  };
  return <span style={style}>{String(props.text ?? props.label ?? "")}</span>;
}

function defaultComponents(): NonNullable<CompRendererProps["components"]> {
  return {
    Box: ({ children, ...props }) => <div style={layoutStyle(props)}>{children}</div>,
    Stack: ({ children, ...props }) => <div style={layoutStyle(props)}>{children}</div>,
    Text: (props) => <DefaultText props={props} />,
    Spacer: (props) => <div style={{ flexShrink: 0, width: px(props.size, 8), height: px(props.size, 8) }} />,
    // Embed — default host uses iframe. Flow's Frame host overrides this with
    // an in-process Studio surface (CSS zoom blanks iframes). Keep iframe as
    // the portable fallback for non-zoomed hosts.
    Embed: (props) => (
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          background: "var(--room, #ece9e2)",
        }}
      >
        <iframe
          src={String(props.src ?? "")}
          title={String(props.title ?? props.name ?? "Embedded design")}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            border: "none",
            background: "var(--room, #ece9e2)",
          }}
        />
      </div>
    ),
    HudButton: (props) => (
      <button
        type="button"
        disabled={Boolean(props.disabled)}
        style={{
          border: "none",
          borderRadius: 6,
          padding: "10px 14px",
          background: props.variant === "ghost" ? "transparent" : "var(--ink)",
          color: props.variant === "ghost" ? "var(--ink)" : "var(--raised)",
          fontSize: 13,
          fontWeight: 600,
          cursor: props.disabled ? "not-allowed" : "pointer",
        }}
      >
        {String(props.label ?? props.text ?? "Button")}
      </button>
    ),
    HudBadge: (props) => (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 8px",
          borderRadius: 999,
          fontSize: 12,
          background: "rgba(90,125,134,0.12)",
          color: "var(--capture)",
        }}
      >
        {props.dot ? (
          <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--capture)" }} />
        ) : null}
        {String(props.label ?? props.text ?? "Badge")}
      </span>
    ),
    HudInput: (props) => (
      <input
        defaultValue={String(props.value ?? "")}
        placeholder={String(props.placeholder ?? "")}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid rgba(33,31,28,0.16)",
          background: "var(--raised)",
          color: "var(--ink)",
          fontSize: 13,
        }}
      />
    ),
    HudTextarea: (props) => (
      <textarea
        defaultValue={String(props.value ?? "")}
        placeholder={String(props.placeholder ?? "")}
        rows={Number(props.rows) || 3}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid rgba(33,31,28,0.16)",
          background: "var(--raised)",
          color: "var(--ink)",
          fontSize: 13,
          resize: "vertical",
        }}
      />
    ),
    HudPanelSection: ({ children, ...props }) => (
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--faint)" }}>
          {String(props.title ?? "Section")}
        </div>
        {children}
      </section>
    ),
    HudListItem: (props) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{String(props.title ?? "")}</div>
        {props.description ? (
          <div style={{ fontSize: 12, color: "var(--soft)" }}>{String(props.description)}</div>
        ) : null}
      </div>
    ),
    HudCheckbox: (props) => (
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "var(--ink)" }}>
        <input type="checkbox" defaultChecked={Boolean(props.checked)} />
        {String(props.label ?? "")}
      </label>
    ),
    HudToolbar: ({ children }) => (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>{children}</div>
    ),
  };
}

export function CompRenderer({ node, components }: CompRendererProps): ReactNode {
  const registry = { ...defaultComponents(), ...components };
  const Comp = registry[node.type];
  const kids = (node.children ?? []).map((child) => (
    <CompRenderer key={child.id} node={child} components={components} />
  ));
  if (!Comp) {
    return (
      <div data-unknown-primitive={node.type} style={{ outline: "1px dashed red", padding: 4 }}>
        Unknown: {node.type}
        {kids}
      </div>
    );
  }
  return <Comp {...node.props}>{kids}</Comp>;
}

export type FlowCanvasProps = {
  pages: readonly FlowPage[];
  tokens?: FlowTokens;
  components?: CompRendererProps["components"];
  /** Extra class on the world root */
  className?: string;
};

/** Absolute-position pages on a world plane. Host supplies pan/zoom if needed. */
export function FlowCanvas({ pages, tokens, components, className }: FlowCanvasProps): ReactNode {
  const tokenStyle = Object.fromEntries(
    Object.entries(tokens ?? {}).map(([k, v]) => [k, v]),
  ) as CSSProperties;

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...tokenStyle,
        background: "var(--room, #ece9e2)",
      }}
    >
      {pages.map((page) => (
        <div
          key={page.id}
          data-page-id={page.id}
          data-page-name={page.name}
          style={{
            position: "absolute",
            left: page.x,
            top: page.y,
            width: page.width,
            height: page.height,
            overflow: "hidden",
            background: "var(--raised, #f8f6f1)",
            boxShadow: "0 18px 50px rgba(24,21,14,0.18)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CompRenderer node={page.root} components={components} />
        </div>
      ))}
    </div>
  );
}
