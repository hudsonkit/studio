/**
 * Sidebar minimap — LeftFooter slot (Atelier/Shaper convention).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, Maximize } from "lucide-react";
import { useFlowState } from "./FlowState";

const H = 120;
const PAD = 8;

export function FlowMinimap() {
  const {
    payload,
    pageId,
    view,
    settings,
    focusPage,
    requestFitAll,
    requestNavigate,
  } = useFlowState();

  const mapRef = useRef<HTMLDivElement>(null);
  const containerEl = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(220);

  const bounds = payload?.bounds;
  const pages = payload?.pages ?? [];

  const layout = useMemo(() => {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const innerW = Math.max(width - PAD * 2, 40);
    const innerH = H - PAD * 2;
    const s = Math.min(innerW / bounds.width, innerH / bounds.height);
    const drawW = bounds.width * s;
    const drawH = bounds.height * s;
    const ox = PAD + (innerW - drawW) / 2;
    const oy = PAD + (innerH - drawH) / 2;
    return { s, ox, oy };
  }, [bounds, width]);

  useEffect(() => {
    const node = containerEl.current;
    if (!node) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setWidth(e.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!layout || !bounds || !mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = bounds.minX + (mx - layout.ox) / layout.s;
      const wy = bounds.minY + (my - layout.oy) / layout.s;
      requestNavigate({ x: -wx, y: -wy });
    },
    [layout, bounds, requestNavigate],
  );

  if (!settings.showMinimap) {
    return (
      <div className="shrink-0 border-t border-border/80 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        Minimap hidden · enable in Settings
      </div>
    );
  }

  if (!payload || !bounds || !layout) {
    return (
      <div className="shrink-0 border-t border-border/80 px-3 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        No map bounds
      </div>
    );
  }

  const vpW = view.viewportSize.w / view.scale;
  const vpH = view.viewportSize.h / view.scale;
  const camX = -view.pan.x;
  const camY = -view.pan.y;
  const vpLeft = camX - vpW / 2;
  const vpTop = camY - vpH / 2;
  const chromeBorder = "var(--hud-chrome-border, oklch(var(--border)))";

  return (
    <div
      ref={containerEl}
      className="shrink-0 border-t border-border/80 bg-card/40"
      style={{ borderColor: chromeBorder }}
    >
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          <Map size={11} strokeWidth={1.5} />
          Overview
        </div>
        <button
          type="button"
          onClick={() => requestFitAll()}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent/10 hover:text-foreground"
          title="Fit all"
        >
          <Maximize size={11} />
        </button>
      </div>

      <div
        ref={mapRef}
        className="relative mx-2 mb-2 cursor-crosshair overflow-hidden rounded border bg-muted/20"
        style={{ height: H, borderColor: chromeBorder }}
        onClick={handleClick}
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--hud-canvas-dot-major) 0.5px, transparent 0.5px)",
            backgroundSize: "12px 12px",
          }}
        />
        {pages.map((p) => {
          const active = p.id === pageId;
          const left = layout.ox + (p.x - bounds.minX) * layout.s;
          const top = layout.oy + (p.y - bounds.minY) * layout.s;
          const w = Math.max(p.width * layout.s, 2);
          const h = Math.max(p.height * layout.s, 2);
          return (
            <button
              key={p.id}
              type="button"
              title={[p.journeyName, p.name].filter(Boolean).join(" · ")}
              onClick={(e) => {
                e.stopPropagation();
                focusPage(p.id);
              }}
              className="absolute rounded-[1px]"
              style={{
                left,
                top,
                width: w,
                height: h,
                background: active
                  ? "color-mix(in srgb, oklch(var(--accent)) 35%, transparent)"
                  : "color-mix(in srgb, var(--foreground) 12%, transparent)",
                outline: active
                  ? "1px solid color-mix(in srgb, oklch(var(--accent)) 70%, transparent)"
                  : "1px solid color-mix(in srgb, var(--foreground) 18%, transparent)",
              }}
            />
          );
        })}
        <div
          className="pointer-events-none absolute rounded-[1px] border border-accent/80"
          style={{
            left: layout.ox + (vpLeft - bounds.minX) * layout.s,
            top: layout.oy + (vpTop - bounds.minY) * layout.s,
            width: Math.max(vpW * layout.s, 6),
            height: Math.max(vpH * layout.s, 6),
            boxShadow:
              "0 0 0 1px color-mix(in srgb, oklch(var(--accent)) 25%, transparent)",
          }}
        />
      </div>

      <div className="flex items-center justify-between px-2.5 pb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="tabular-nums">
          {pages.length}p · {Math.round(view.scale * 100)}%
        </span>
        <span className="tabular-nums normal-case tracking-normal opacity-70">
          click to pan
        </span>
      </div>
    </div>
  );
}
