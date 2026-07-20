/**
 * FlowWorld — pure world-space content for Frame.
 * No nested Canvas, no pan/zoom ownership. Frame owns the room.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  HudBadge,
  HudButton,
  HudCheckbox,
  HudInput,
  HudListItem,
  HudPanelSection,
  HudTextarea,
  HudToolbar,
} from "hudsonkit/primitives";
import { CompRenderer } from "../render";
import { useFlowState } from "./FlowState";
import { renderEmbedSurface, useFlowEmbeds } from "./embedSurfaces";
import { eventTargetElement, regionFromElement } from "./inspect";
import { FlowInspectProvider, useFlowInspect } from "./FlowInspectContext";

/**
 * Live embed mount — same React surface as Studio /embed/…
 * Click (inspect mode) selects [data-flow-region] without leaving the map.
 */
function LiveEmbedSurface(props: Record<string, unknown>) {
  const src = String(props.src ?? "");
  const title = String(props.title ?? props.name ?? "Embedded design");
  const embeds = useFlowEmbeds();
  const surface = renderEmbedSurface(embeds, src);
  const inspect = useFlowInspect();
  const selectedRegionId =
    inspect?.selection?.kind === "region"
      ? inspect.selection.regionId
      : null;

  useEffect(() => {
    // Highlight selected region inside every live embed (only one page active).
    document.querySelectorAll("[data-flow-embed='live']").forEach((root) => {
      root.querySelectorAll("[data-flow-region]").forEach((el) => {
        const id = el.getAttribute("data-flow-region");
        if (id && id === selectedRegionId) {
          el.setAttribute("data-flow-selected", "true");
        } else {
          el.removeAttribute("data-flow-selected");
        }
      });
    });
  }, [selectedRegionId]);

  const onPointerDownCapture = useCallback(
    (e: ReactPointerEvent) => {
      if (!inspect?.inspectMode) return;
      const hit = regionFromElement(eventTargetElement(e.target));
      if (!hit) return;
      const card = (e.currentTarget as HTMLElement).closest("[data-page-id]");
      const pageFromCard = card?.getAttribute("data-page-id") ?? undefined;
      // Capture phase + stop so the card never rewrites selection to "page".
      e.stopPropagation();
      e.preventDefault();
      inspect.selectRegion({ ...hit, pageId: pageFromCard });
    },
    [inspect],
  );

  if (surface) {
    return (
      <div
        data-flow-embed="live"
        data-embed-src={src}
        data-inspect={inspect?.inspectMode ? "on" : "off"}
        title={title}
        onPointerDownCapture={onPointerDownCapture}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "auto",
          background: "var(--room, #ece9e2)",
          cursor: inspect?.inspectMode ? "crosshair" : undefined,
        }}
      >
        {surface}
      </div>
    );
  }

  return (
    <div
      data-flow-embed="iframe"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <iframe
        src={src}
        title={title}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          border: "none",
          background: "var(--room, #ece9e2)",
        }}
      />
      {!src ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: "#8c897f",
          }}
        >
          Embed missing src
        </div>
      ) : null}
    </div>
  );
}

function hudsonkitComponents(): NonNullable<
  Parameters<typeof CompRenderer>[0]["components"]
> {
  return {
    Embed: (props) => <LiveEmbedSurface {...props} />,
    HudButton: (props) => (
      <HudButton
        tone={(props.tone as "neutral" | "accent" | undefined) ?? "neutral"}
        variant={
          (props.variant as "solid" | "soft" | "ghost" | undefined) ?? "solid"
        }
        density={
          (props.density as "default" | "compact" | undefined) ?? "default"
        }
        disabled={Boolean(props.disabled)}
      >
        {String(props.label ?? props.text ?? "Button")}
      </HudButton>
    ),
    HudBadge: (props) => (
      <HudBadge
        tone={(props.tone as "neutral" | "accent" | undefined) ?? "neutral"}
        density={
          (props.density as "default" | "compact" | undefined) ?? "compact"
        }
        dot={Boolean(props.dot)}
      >
        {String(props.label ?? props.text ?? "Badge")}
      </HudBadge>
    ),
    HudInput: (props) => (
      <HudInput
        defaultValue={String(props.value ?? "")}
        placeholder={String(props.placeholder ?? "")}
        density={
          (props.density as "default" | "compact" | undefined) ?? "default"
        }
        readOnly
      />
    ),
    HudTextarea: (props) => (
      <HudTextarea
        defaultValue={String(props.value ?? "")}
        placeholder={String(props.placeholder ?? "")}
        rows={Number(props.rows) || 3}
        density="default"
        readOnly
      />
    ),
    HudPanelSection: ({ children, ...props }) => (
      <HudPanelSection title={String(props.title ?? "Section")} defaultOpen>
        {children as ReactNode}
      </HudPanelSection>
    ),
    HudListItem: (props) => (
      <HudListItem
        description={
          props.description != null ? String(props.description) : undefined
        }
      >
        {String(props.title ?? props.label ?? props.text ?? "")}
      </HudListItem>
    ),
    HudCheckbox: (props) => (
      <HudCheckbox
        checked={Boolean(props.checked)}
        label={String(props.label ?? "")}
        onChange={() => {}}
      />
    ),
    HudToolbar: ({ children }) => (
      <HudToolbar>{children as ReactNode}</HudToolbar>
    ),
  };
}

export function FlowWorld() {
  const {
    fileId,
    pageId,
    payload,
    loadError,
    settings,
    selectPage,
    focusPage,
    selection,
    selectRegion,
    inspectMode,
  } = useFlowState();
  const [zTop, setZTop] = useState(1);
  const [zByPage, setZByPage] = useState<Record<string, number>>({});
  const hudComponents = useMemo(() => hudsonkitComponents(), []);

  const tokens = payload?.tokens;
  const tokenStyle = useMemo(() => {
    if (!tokens) return {} as CSSProperties;
    return Object.fromEntries(Object.entries(tokens)) as CSSProperties;
  }, [tokens]);

  const inspectValue = useMemo(
    () => ({
      pageId,
      inspectMode,
      selection,
      selectRegion: (args: {
        pageId?: string;
        regionId: string;
        label: string;
        role: string | null;
        note: string | null;
        text: string | null;
      }) => {
        const pid = args.pageId ?? pageId;
        if (!pid) return;
        selectRegion({
          pageId: pid,
          regionId: args.regionId,
          label: args.label,
          role: args.role,
          note: args.note,
          text: args.text,
        });
      },
    }),
    [pageId, inspectMode, selection, selectRegion],
  );

  const bringForward = (id: string) => {
    setZTop((z) => {
      const next = z + 1;
      setZByPage((m) => ({ ...m, [id]: next }));
      return next;
    });
  };

  if (!fileId) {
    return (
      <div
        className="pointer-events-none flex items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        style={{ width: 320, height: 80, marginLeft: -160, marginTop: -40 }}
      >
        Select a map
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="pointer-events-none flex items-center justify-center p-6 font-mono text-[12px] text-warning"
        style={{ width: 420, height: 80, marginLeft: -210, marginTop: -40 }}
      >
        {loadError}
      </div>
    );
  }

  if (!payload) {
    return (
      <div
        className="pointer-events-none flex items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        style={{ width: 200, height: 40, marginLeft: -100, marginTop: -20 }}
      >
        Loading…
      </div>
    );
  }

  return (
    <FlowInspectProvider value={inspectValue}>
      {settings.showJourneyLabels
        ? payload.journeys.map((j) => (
            <div
              key={`label-${j.id}`}
              className="pointer-events-none absolute font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80"
              style={{
                left: (payload.bounds.minX ?? 0) - 56,
                top: j.y + 16,
                transform: "translateX(-100%)",
                whiteSpace: "nowrap",
              }}
            >
              {j.name}
            </div>
          ))
        : null}

      {payload.pages.map((page) => {
        const active = page.id === pageId;
        const z = zByPage[page.id] ?? 1;
        return (
          <div
            key={page.id}
            data-canvas-card
            data-page-id={page.id}
            data-interactive="true"
            data-page-active={active ? "true" : "false"}
            className="pointer-events-auto absolute overflow-hidden"
            style={{
              left: page.x,
              top: page.y,
              width: page.width,
              height: page.height,
              zIndex: active ? zTop + 1 : z,
              ...tokenStyle,
              background: "var(--raised, #f8f6f1)",
              boxShadow: active
                ? "0 0 0 1.5px color-mix(in srgb, oklch(var(--accent)) 65%, transparent), 0 24px 60px rgba(0,0,0,0.32)"
                : "0 0 0 1px color-mix(in srgb, var(--foreground) 10%, transparent), 0 18px 48px rgba(0,0,0,0.22)",
              display: "flex",
              flexDirection: "column",
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              // Region pick is handled in capture on LiveEmbedSurface.
              // Do not call selectPage if a region was hit — that would wipe it.
              const el = eventTargetElement(e.target);
              if (inspectMode && el?.closest?.("[data-flow-region]")) {
                bringForward(page.id);
                return;
              }
              selectPage(page.id);
              bringForward(page.id);
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              focusPage(page.id);
              bringForward(page.id);
            }}
          >
            <div
              className="flex shrink-0 items-center justify-between border-b px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--ink, #211f1c) 12%, transparent)",
                background:
                  "color-mix(in srgb, var(--raised, #f8f6f1) 92%, black)",
                color: "var(--faint, #8c897f)",
              }}
            >
              <span>
                {[page.journeyName, page.name].filter(Boolean).join(" · ")}
              </span>
              <span className="tabular-nums opacity-70">
                {page.width}×{page.height}
              </span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden">
              {/* Fill the card body so Embed surfaces have a definite height */}
              <div className="absolute inset-0">
                <CompRenderer node={page.root} components={hudComponents} />
              </div>
            </div>
          </div>
        );
      })}
    </FlowInspectProvider>
  );
}
