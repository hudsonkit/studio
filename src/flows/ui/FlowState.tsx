/**
 * Shared Flow host state — world viewport + shell chrome share one store.
 * Pan/zoom live here so Frame, minimap, and Cmd+K talk without CustomEvents.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MAX_SCALE,
  MIN_SCALE,
  type CanvasPayload,
  type FileListItem,
} from "./types";
import type { FlowSelection } from "./inspect";

export type FlowViewState = {
  pan: { x: number; y: number };
  scale: number;
  viewportSize: { w: number; h: number };
  focusedPageName: string | null;
  focusedJourneyName: string | null;
  pageCount: number;
  journeyCount: number;
  mapName: string | null;
  bounds: CanvasPayload["bounds"] | null;
};

export type FlowSettings = {
  showMinimap: boolean;
  showJourneyLabels: boolean;
  gridOpacity: number;
};

export type RightRailMode = "inspector" | "settings";

const DEFAULT_SETTINGS: FlowSettings = {
  showMinimap: true,
  showJourneyLabels: true,
  gridOpacity: 1,
};

function loadSettings(): FlowSettings {
  try {
    const raw = localStorage.getItem("studio.flows.settings");
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function clampScale(n: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

type FlowStateValue = {
  files: FileListItem[];
  filesError: string | null;
  refreshFiles: () => Promise<void>;
  fileId: string | null;
  setFileId: (id: string | null) => void;
  pageId: string | null;
  setPageId: (id: string | null) => void;
  payload: CanvasPayload | null;
  loadError: string | null;
  view: FlowViewState;
  selectPage: (pageId: string) => void;
  focusPage: (pageId: string) => void;
  fitAll: () => void;
  navigateTo: (pan: { x: number; y: number }) => void;
  handlePan: (delta: { x: number; y: number }) => void;
  handleZoom: (scale: number) => void;
  setViewportSize: (size: { w: number; h: number }) => void;
  settings: FlowSettings;
  updateSettings: (patch: Partial<FlowSettings>) => void;
  resetSettings: () => void;
  rightMode: RightRailMode;
  setRightMode: (m: RightRailMode) => void;
  rightCollapsed: boolean;
  setRightCollapsed: (
    next: boolean | ((current: boolean) => boolean),
  ) => void;
  /** Page or in-surface region / CompNode under discussion. */
  selection: FlowSelection | null;
  setSelection: (s: FlowSelection | null) => void;
  selectRegion: (args: {
    pageId: string;
    regionId: string;
    label: string;
    role: string | null;
    note: string | null;
    text: string | null;
  }) => void;
  selectNode: (args: {
    pageId: string;
    nodeId: string;
    type: string;
    path: string;
    props: Record<string, unknown>;
  }) => void;
  /** When true, clicks inside the active embed pick regions (don't pan card). */
  inspectMode: boolean;
  setInspectMode: (on: boolean) => void;
  // Back-compat aliases used by slots
  requestFitAll: () => void;
  requestNavigate: (pan: { x: number; y: number }) => void;
};

const FlowStateContext = createContext<FlowStateValue | null>(null);
const RIGHT_COLLAPSED_KEY = "studio.flows.right";

function loadRightCollapsed() {
  try {
    const raw = localStorage.getItem(RIGHT_COLLAPSED_KEY);
    return raw == null ? false : raw === "true";
  } catch {
    return false;
  }
}

function readQuery(): { file?: string; page?: string } {
  const q = new URLSearchParams(window.location.search);
  return {
    file: q.get("file") ?? undefined,
    page: q.get("page") ?? undefined,
  };
}

function writeQuery(file?: string | null, page?: string | null) {
  const url = new URL(window.location.href);
  if (file) url.searchParams.set("file", file);
  else url.searchParams.delete("file");
  if (page) url.searchParams.set("page", page);
  else url.searchParams.delete("page");
  window.history.replaceState({}, "", url.toString());
}

export function FlowStateProvider({ children }: { children: ReactNode }) {
  const initial = readQuery();
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileId, setFileIdState] = useState<string | null>(initial.file ?? null);
  const [pageId, setPageIdState] = useState<string | null>(initial.page ?? null);
  const [payload, setPayloadState] = useState<CanvasPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<FlowSettings>(() =>
    loadSettings(),
  );
  const [rightMode, setRightMode] = useState<RightRailMode>("inspector");
  const [rightCollapsed, setRightCollapsedState] = useState(
    loadRightCollapsed,
  );
  const [selection, setSelection] = useState<FlowSelection | null>(null);
  const [inspectMode, setInspectMode] = useState(true);
  const [view, setViewState] = useState<FlowViewState>({
    pan: { x: 0, y: 0 },
    scale: 0.28,
    viewportSize: { w: 1280, h: 800 },
    focusedPageName: null,
    focusedJourneyName: null,
    pageCount: 0,
    journeyCount: 0,
    mapName: null,
    bounds: null,
  });

  const setRightCollapsed = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setRightCollapsedState((current) =>
        typeof next === "function" ? next(current) : next,
      );
    },
    [],
  );

  // Refs for wheel handlers and load-fit without stale closures
  const scaleRef = useRef(view.scale);
  const panRef = useRef(view.pan);
  const viewportRef = useRef(view.viewportSize);
  scaleRef.current = view.scale;
  panRef.current = view.pan;
  viewportRef.current = view.viewportSize;

  const refreshFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error(`files ${res.status}`);
      const data = (await res.json()) as { files: FileListItem[] };
      setFiles(data.files ?? []);
      setFilesError(null);
    } catch (e) {
      setFilesError(e instanceof Error ? e.message : "API unreachable");
    }
  }, []);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  useEffect(() => {
    if (!fileId && files[0]) setFileIdState(files[0].id);
  }, [files, fileId]);

  useEffect(() => {
    writeQuery(fileId, pageId);
  }, [fileId, pageId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "studio.flows.settings",
        JSON.stringify(settings),
      );
    } catch {
      /* ignore */
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(RIGHT_COLLAPSED_KEY, String(rightCollapsed));
    } catch {
      /* ignore */
    }
  }, [rightCollapsed]);

  // Load canvas payload when file changes — owns fit-on-load
  useEffect(() => {
    if (!fileId) {
      setPayloadState(null);
      setLoadError(null);
      setViewState((v) => ({
        ...v,
        mapName: null,
        pageCount: 0,
        journeyCount: 0,
        bounds: null,
        focusedPageName: null,
        focusedJourneyName: null,
      }));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/files/${encodeURIComponent(fileId)}/canvas`,
        );
        if (!res.ok) throw new Error(`canvas ${res.status}`);
        const data = (await res.json()) as CanvasPayload;
        if (cancelled) return;

        setPayloadState(data);
        setLoadError(null);

        const hasPage =
          pageId != null && data.pages.some((p) => p.id === pageId);
        const focusId = hasPage ? pageId! : (data.pages[0]?.id ?? null);
        if (focusId) setPageIdState(focusId);

        const focusPage = focusId
          ? data.pages.find((p) => p.id === focusId)
          : null;
        const b = data.bounds;
        const vp = viewportRef.current;
        const fit = clampScale(
          Math.min(
            0.55,
            Math.min(
              (vp.w * 0.7) / Math.max(b.width, 1),
              (vp.h * 0.7) / Math.max(b.height, 1),
            ),
          ),
        );
        scaleRef.current = fit;
        panRef.current = { x: -b.centerX, y: -b.centerY };
        setViewState((v) => ({
          ...v,
          pan: { x: -b.centerX, y: -b.centerY },
          scale: fit,
          mapName: data.fileName,
          pageCount: data.pages.length,
          journeyCount: data.journeys.length,
          bounds: b,
          focusedPageName: focusPage?.name ?? null,
          focusedJourneyName: focusPage?.journeyName ?? null,
        }));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load canvas");
          setPayloadState(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-fetch on fileId change — pageId is applied inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const setFileId = useCallback((id: string | null) => {
    setFileIdState(id);
    setPageIdState(null);
    setPayloadState(null);
    setLoadError(null);
    setSelection(null);
  }, []);

  const setPageId = useCallback((id: string | null) => {
    setPageIdState(id);
    setSelection(id ? { kind: "page", pageId: id } : null);
  }, []);

  const selectPage = useCallback(
    (id: string) => {
      setPageIdState(id);
      // Don't clobber an in-page region/node selection for the same page
      // (card chrome clicks still land here after region capture returns early).
      setSelection((prev) => {
        if (
          prev &&
          (prev.kind === "region" || prev.kind === "node") &&
          prev.pageId === id
        ) {
          return prev;
        }
        return { kind: "page", pageId: id };
      });
      const page = payload?.pages.find((p) => p.id === id);
      if (page) {
        setViewState((v) => ({
          ...v,
          focusedPageName: page.name,
          focusedJourneyName: page.journeyName,
        }));
        // Live embeds: open inspector so the region list is obvious
        if (page.root.type === "Embed") {
          setRightMode("inspector");
          setRightCollapsed(false);
        }
      }
    },
    [payload, setRightCollapsed],
  );

  const focusPage = useCallback(
    (id: string) => {
      const page = payload?.pages.find((p) => p.id === id);
      if (!page) {
        setPageIdState(id);
        setSelection({ kind: "page", pageId: id });
        return;
      }
      setPageIdState(id);
      setSelection({ kind: "page", pageId: id });
      const nextPan = {
        x: -(page.x + page.width / 2),
        y: -(page.y + page.height / 2),
      };
      const nextScale = clampScale(Math.max(scaleRef.current, 0.42));
      scaleRef.current = nextScale;
      panRef.current = nextPan;
      setViewState((v) => ({
        ...v,
        pan: nextPan,
        scale: nextScale,
        focusedPageName: page.name,
        focusedJourneyName: page.journeyName,
      }));
    },
    [payload],
  );

  const selectRegion = useCallback(
    (args: {
      pageId: string;
      regionId: string;
      label: string;
      role: string | null;
      note: string | null;
      text: string | null;
    }) => {
      setPageIdState(args.pageId);
      setSelection({
        kind: "region",
        pageId: args.pageId,
        regionId: args.regionId,
        label: args.label,
        role: args.role,
        note: args.note,
        text: args.text,
      });
      setRightMode("inspector");
      setRightCollapsed(false);
      const page = payload?.pages.find((p) => p.id === args.pageId);
      if (page) {
        setViewState((v) => ({
          ...v,
          focusedPageName: page.name,
          focusedJourneyName: page.journeyName,
        }));
      }
    },
    [payload, setRightCollapsed],
  );

  const selectNode = useCallback(
    (args: {
      pageId: string;
      nodeId: string;
      type: string;
      path: string;
      props: Record<string, unknown>;
    }) => {
      setPageIdState(args.pageId);
      setSelection({
        kind: "node",
        pageId: args.pageId,
        nodeId: args.nodeId,
        type: args.type,
        path: args.path,
        props: args.props,
      });
      setRightMode("inspector");
      setRightCollapsed(false);
    },
    [setRightCollapsed],
  );

  const fitAll = useCallback(() => {
    const b = payload?.bounds ?? view.bounds;
    if (!b) return;
    const vp = viewportRef.current;
    const fit = clampScale(
      Math.min(
        0.55,
        Math.min(
          (vp.w * 0.85) / Math.max(b.width, 1),
          (vp.h * 0.85) / Math.max(b.height, 1),
        ),
      ),
    );
    const nextPan = { x: -b.centerX, y: -b.centerY };
    scaleRef.current = fit;
    panRef.current = nextPan;
    setViewState((v) => ({ ...v, pan: nextPan, scale: fit }));
  }, [payload, view.bounds]);

  const navigateTo = useCallback((pan: { x: number; y: number }) => {
    panRef.current = pan;
    setViewState((v) => ({ ...v, pan }));
  }, []);

  const handlePan = useCallback((delta: { x: number; y: number }) => {
    setViewState((v) => {
      const next = { x: v.pan.x + delta.x, y: v.pan.y + delta.y };
      panRef.current = next;
      return { ...v, pan: next };
    });
  }, []);

  const handleZoom = useCallback((next: number) => {
    const clamped = clampScale(next);
    scaleRef.current = clamped;
    setViewState((v) => ({ ...v, scale: clamped }));
  }, []);

  const setViewportSize = useCallback((size: { w: number; h: number }) => {
    viewportRef.current = size;
    setViewState((v) => ({ ...v, viewportSize: size }));
  }, []);

  const updateSettings = useCallback((patch: Partial<FlowSettings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState({ ...DEFAULT_SETTINGS });
  }, []);

  const value = useMemo(
    () => ({
      files,
      filesError,
      refreshFiles,
      fileId,
      setFileId,
      pageId,
      setPageId,
      payload,
      loadError,
      view,
      selectPage,
      focusPage,
      fitAll,
      navigateTo,
      handlePan,
      handleZoom,
      setViewportSize,
      settings,
      updateSettings,
      resetSettings,
      rightMode,
      setRightMode,
      rightCollapsed,
      setRightCollapsed,
      selection,
      setSelection,
      selectRegion,
      selectNode,
      inspectMode,
      setInspectMode,
      requestFitAll: fitAll,
      requestNavigate: navigateTo,
    }),
    [
      files,
      filesError,
      refreshFiles,
      fileId,
      setFileId,
      pageId,
      setPageId,
      payload,
      loadError,
      view,
      selectPage,
      focusPage,
      fitAll,
      navigateTo,
      handlePan,
      handleZoom,
      setViewportSize,
      settings,
      updateSettings,
      resetSettings,
      rightMode,
      rightCollapsed,
      setRightCollapsed,
      selection,
      selectRegion,
      selectNode,
      inspectMode,
    ],
  );

  return (
    <FlowStateContext.Provider value={value}>
      {children}
    </FlowStateContext.Provider>
  );
}

export function useFlowState(): FlowStateValue {
  const ctx = useContext(FlowStateContext);
  if (!ctx) throw new Error("useFlowState outside FlowStateProvider");
  return ctx;
}

export { DEFAULT_SETTINGS };
