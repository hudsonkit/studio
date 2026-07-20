import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ScanSearch,
  Settings,
  Workflow,
} from "lucide-react";
import type { HudsonApp } from "hudsonkit";
import { useAppShellSidePanels } from "hudsonkit/app-shell";
import { FlowStateProvider, useFlowState } from "./ui/FlowState";
import { FlowWorld } from "./ui/FlowWorld";
import { FlowLeftPanel } from "./ui/slots/LeftPanel";
import { FlowLeftFooter } from "./ui/slots/LeftFooter";
import { FlowInspector } from "./ui/slots/Inspector";
import { SettingsTool as FlowSettings } from "./ui/slots/SettingsTool";
import { MAX_SCALE as FLOW_MAX_SCALE, MIN_SCALE as FLOW_MIN_SCALE } from "./ui/types";
import { useFlowCommands } from "./ui/hooks";
import {
  FlowEmbedProvider,
  type FlowEmbedRegistry,
} from "./ui/embedSurfaces";
import {
  FlowRuntimeProvider,
  type FlowDiscussTarget,
} from "./ui/FlowRuntime";

export type StudioFlowsAppOptions = {
  id?: string;
  onNavigateHome?: () => void;
  embeds?: FlowEmbedRegistry;
  discuss?: FlowDiscussTarget;
};

const FlowNavigationContext = createContext<
  Pick<StudioFlowsAppOptions, "onNavigateHome">
>({});

function selectionKey(
  selection: ReturnType<typeof useFlowState>["selection"],
  pageId: string | null,
) {
  if (!selection) return pageId ?? "";
  if (selection.kind === "page") return `page:${selection.pageId}`;
  if (selection.kind === "region") {
    return `region:${selection.pageId}:${selection.regionId}`;
  }
  return `node:${selection.pageId}:${selection.nodeId}`;
}

function FlowsShellBridge() {
  const panels = useAppShellSidePanels();
  const { pageId, selection, setRightMode } = useFlowState();
  const activeSelection = selectionKey(selection, pageId);
  const previousSelection = useRef(activeSelection);

  useEffect(() => {
    if (!activeSelection || activeSelection === previousSelection.current) return;
    previousSelection.current = activeSelection;
    setRightMode("inspector");
    panels.right.setCollapsed(false);
  }, [activeSelection, panels.right, setRightMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== ",") return;
      event.preventDefault();
      setRightMode("settings");
      panels.right.setCollapsed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panels.right, setRightMode]);

  return null;
}

function FlowsCanvas() {
  const { view, handlePan, handleZoom } = useFlowState();
  const scaleRef = useRef(view.scale);

  useEffect(() => {
    scaleRef.current = view.scale;
  }, [view.scale]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest?.(
          "input, textarea, select, [data-no-canvas-wheel], [data-frame-panel]",
        )
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey) return;

      event.preventDefault();
      const scale = scaleRef.current;
      if (event.shiftKey) {
        const dx = (-event.deltaY || -event.deltaX) / scale;
        handlePan({ x: dx, y: 0 });
        return;
      }
      if (event.altKey) {
        handlePan({ x: 0, y: -event.deltaY / scale });
        return;
      }

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      const next = Math.min(
        FLOW_MAX_SCALE,
        Math.max(
          FLOW_MIN_SCALE,
          scale - event.deltaY * unit * 0.0018,
        ),
      );
      if (next !== scale) {
        scaleRef.current = next;
        handleZoom(next);
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [handlePan, handleZoom]);

  return (
    <>
      <FlowsShellBridge />
      <FlowWorld />
    </>
  );
}

function FlowsInspector() {
  const { rightMode } = useFlowState();
  return rightMode === "settings" ? (
    <FlowSettings />
  ) : (
    <FlowInspector />
  );
}

function FlowsNavCenter() {
  const { view, selection } = useFlowState();
  const focus = [view.focusedJourneyName, view.focusedPageName]
    .filter(Boolean)
    .join(" · ");
  const region =
    selection?.kind === "region"
      ? selection.label
      : selection?.kind === "node"
        ? selection.type
        : null;

  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {region ? `${focus || "Flow"} · ${region}` : focus || "Flow map"}
    </span>
  );
}

function FlowsNavActions() {
  const { onNavigateHome } = useContext(FlowNavigationContext);
  const panels = useAppShellSidePanels();
  const { inspectMode, setInspectMode, rightMode, setRightMode } =
    useFlowState();

  const openRight = (mode: "inspector" | "settings") => {
    setRightMode(mode);
    panels.right.setCollapsed(false);
  };

  return (
    <div className="pointer-events-auto flex items-center gap-0.5">
      {onNavigateHome ? (
        <button
          type="button"
          onClick={onNavigateHome}
          className="rounded border border-transparent p-1.5 text-foreground/70 transition-colors hover:border-border hover:bg-muted hover:text-foreground"
          title="Back to Studio catalog"
          aria-label="Back to Studio catalog"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setInspectMode(!inspectMode)}
        className={`rounded border px-1.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] transition-colors ${
          inspectMode
            ? "border-accent/30 bg-accent/10 text-foreground"
            : "border-transparent text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground"
        }`}
        title="Pick regions on the active screen"
        aria-label="Toggle inspect pick mode"
        aria-pressed={inspectMode}
      >
        Pick
      </button>
      <button
        type="button"
        onClick={() => openRight("inspector")}
        className={`rounded border p-1.5 transition-colors ${
          !panels.right.isCollapsed && rightMode === "inspector"
            ? "border-accent/30 bg-accent/10 text-foreground"
            : "border-transparent text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground"
        }`}
        title="Inspector (Cmd+])"
        aria-label="Open inspector"
      >
        <ScanSearch size={13} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={() => openRight("settings")}
        className={`rounded border p-1.5 transition-colors ${
          !panels.right.isCollapsed && rightMode === "settings"
            ? "border-accent/30 bg-accent/10 text-foreground"
            : "border-transparent text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground"
        }`}
        title="Flow settings (Cmd+,)"
        aria-label="Open Flow settings"
      >
        <Settings size={13} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function FlowsRightHeaderActions() {
  const { rightMode, setRightMode } = useFlowState();
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => setRightMode("inspector")}
        className={`rounded p-1 transition-colors ${
          rightMode === "inspector"
            ? "bg-accent/10 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        title="Inspector"
      >
        <ScanSearch size={12} />
      </button>
      <button
        type="button"
        onClick={() => setRightMode("settings")}
        className={`rounded p-1 transition-colors ${
          rightMode === "settings"
            ? "bg-accent/10 text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        title="Flow settings"
      >
        <Settings size={12} />
      </button>
    </div>
  );
}

function useFlowsViewport() {
  const {
    view,
    settings,
    handlePan,
    handleZoom,
    setViewportSize,
  } = useFlowState();

  return useMemo(
    () => ({
      pan: view.pan,
      zoom: view.scale,
      canvasSize: {
        w: Math.round(view.viewportSize.w),
        h: Math.round(view.viewportSize.h),
      },
      onPan: handlePan,
      onZoom: handleZoom,
      onViewportChange: ({ width, height }: { width: number; height: number }) =>
        setViewportSize({ w: width, h: height }),
      gridOpacity: settings.gridOpacity,
      zoomSensitivity: 1.2,
    }),
    [handlePan, handleZoom, setViewportSize, settings.gridOpacity, view],
  );
}

function FlowsStatusLeft() {
  const { view } = useFlowState();
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
      {view.mapName ?? "Studio Flows"} · {view.journeyCount} journeys · {view.pageCount} screens
    </span>
  );
}

function FlowsStatusRight() {
  const { inspectMode } = useFlowState();
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
      {inspectMode ? "Pick on" : "Navigate"}
    </span>
  );
}

export function createStudioFlowsApp(
  options: StudioFlowsAppOptions = {},
): HudsonApp {
  const FlowsProvider = ({ children }: { children: ReactNode }) => (
    <FlowNavigationContext.Provider
      value={{ onNavigateHome: options.onNavigateHome }}
    >
      <FlowEmbedProvider embeds={options.embeds}>
        <FlowRuntimeProvider value={{ discuss: options.discuss }}>
          <FlowStateProvider>{children}</FlowStateProvider>
        </FlowRuntimeProvider>
      </FlowEmbedProvider>
    </FlowNavigationContext.Provider>
  );

  return {
  id: options.id ?? "studio-flows",
  name: "Studio Flows",
  description: "Spatial product flows, live screens, inspection, and discussion.",
  mode: "canvas",
  icon: createElement(Workflow, { size: 13, strokeWidth: 1.5 }),
  leftPanel: {
    title: "Flows",
    icon: createElement(Workflow, { size: 12, strokeWidth: 1.5 }),
  },
  rightPanel: {
    title: "Flow tools",
    icon: createElement(ScanSearch, { size: 12, strokeWidth: 1.5 }),
    headerActions: FlowsRightHeaderActions,
  },
  layout: {
    leftWidth: 280,
    rightWidth: 360,
    left: { min: 220, max: 400 },
    right: { min: 260, max: 460 },
  },
  Provider: FlowsProvider,
  slots: {
    Content: FlowsCanvas,
    LeftPanel: FlowLeftPanel,
    LeftFooter: FlowLeftFooter,
    Inspector: FlowsInspector,
  },
  hooks: {
    useCommands: useFlowCommands,
    useStatus: () => {
      const { filesError } = useFlowState();
      return filesError
        ? { label: "API", color: "amber", title: filesError }
        : { label: "FLOW", color: "emerald", title: "Studio Flows canvas" };
    },
    useStatusLeft: () => createElement(FlowsStatusLeft),
    useStatusRight: () => createElement(FlowsStatusRight),
    useViewport: useFlowsViewport,
    useNavCenter: () => createElement(FlowsNavCenter),
    useNavActions: () => createElement(FlowsNavActions),
  },
  };
}

export const studioFlowsApp = createStudioFlowsApp();
