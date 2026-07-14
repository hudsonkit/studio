"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  StudioPage,
  StudioRegistry,
} from "../registry";
import {
  resolveStudioInjectionState,
  type StudioInjectionMode,
  type StudioInjectionState,
} from "./state";

export type {
  ResolveStudioInjectionStateInput,
  StudioInjectionMode,
  StudioInjectionState,
} from "./state";

export interface StudioInjectionController extends StudioInjectionState {
  renderedMode: StudioInjectionMode;
  peeking: boolean;
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: StudioInjectionMode) => void;
}

export interface StudioInjectionFrameProps {
  studyId: string;
  aliases?: readonly string[];
  anchor: string;
  title: string;
  children: ReactNode;
  storageKeyPrefix?: string;
  renderStudy: (controller: StudioInjectionController) => ReactNode;
}

export interface StudioRegisteredInjectionHostProps<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  registry: StudioRegistry<Bucket, Surface, Status>;
  anchor: string;
  children: ReactNode;
  extraPages?: ReadonlyArray<StudioPage<Bucket, Surface, Status>>;
  storageKeyPrefix?: string;
  renderStudy: (
    page: StudioPage<Bucket, Surface, Status>,
    controller: StudioInjectionController,
  ) => ReactNode;
}

const DEFAULT_STORAGE_PREFIX = "studio.injection.";

function enabledStorageKey(prefix: string, studyId: string): string {
  return `${prefix}${studyId}.enabled`;
}

function modeStorageKey(prefix: string, studyId: string): string {
  return `${prefix}${studyId}.mode`;
}

function readStoredValue(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage can be unavailable in locked-down browser contexts.
  }
}

function defaultDevRuntime(): boolean {
  const globals = globalThis as typeof globalThis & {
    process?: { env?: { NODE_ENV?: string } };
  };
  const nodeEnv = globals.process?.env?.NODE_ENV;
  if (nodeEnv) return nodeEnv !== "production";

  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  return meta.env?.DEV === true;
}

function oppositeMode(mode: StudioInjectionMode): StudioInjectionMode {
  return mode === "before" ? "after" : "before";
}

function clearStudioUrlParams(studyId: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const keys = [
    "studio",
    `studio.${studyId}`,
    "studioInjection",
    "studioMode",
    `studioMode.${studyId}`,
  ];
  let changed = false;

  for (const key of keys) {
    if (!url.searchParams.has(key)) continue;
    url.searchParams.delete(key);
    changed = true;
  }

  if (changed) {
    window.history.replaceState(window.history.state, "", url);
  }
}

function studyIdFor(page: StudioPage): string {
  if (page.id) return page.id;
  return page.href.replace(/^\//, "").replace(/[^a-z0-9-]+/gi, "-");
}

export function useStudioInjection({
  studyId,
  aliases = [],
  storageKeyPrefix = DEFAULT_STORAGE_PREFIX,
}: {
  studyId: string;
  aliases?: readonly string[];
  storageKeyPrefix?: string;
}): StudioInjectionController {
  const [state, setState] = useState<StudioInjectionState>(() =>
    resolveStudioInjectionState({
      studyId,
      aliases,
      href: typeof window === "undefined" ? undefined : window.location.href,
      storedEnabled: readStoredValue(enabledStorageKey(storageKeyPrefix, studyId)),
      storedMode: readStoredValue(modeStorageKey(storageKeyPrefix, studyId)),
      dev: defaultDevRuntime(),
    }),
  );
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    if (!state.enabled) {
      setAltHeld(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) setAltHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.altKey) setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [state.enabled]);

  const setEnabled = useCallback((enabled: boolean) => {
    writeStoredValue(
      enabledStorageKey(storageKeyPrefix, studyId),
      enabled ? "1" : "0",
    );
    setState((current) => ({ ...current, enabled }));
  }, [storageKeyPrefix, studyId]);

  const setMode = useCallback((mode: StudioInjectionMode) => {
    writeStoredValue(modeStorageKey(storageKeyPrefix, studyId), mode);
    setState((current) => ({ ...current, mode }));
  }, [storageKeyPrefix, studyId]);

  const renderedMode = altHeld ? oppositeMode(state.mode) : state.mode;

  return useMemo(
    () => ({
      ...state,
      renderedMode,
      peeking: renderedMode !== state.mode,
      setEnabled,
      setMode,
    }),
    [renderedMode, setEnabled, setMode, state],
  );
}

export function StudioInjectionFrame({
  studyId,
  aliases,
  anchor,
  title,
  children,
  storageKeyPrefix,
  renderStudy,
}: StudioInjectionFrameProps) {
  const studio = useStudioInjection({ studyId, aliases, storageKeyPrefix });

  if (!studio.enabled) return <>{children}</>;

  return (
    <div className="studio-injection" data-studio-anchor={anchor}>
      <div className="studio-injection__bar">
        <div className="studio-injection__label">
          <span className="studio-injection__kicker">Studio injection</span>
          <span className="studio-injection__title">{title}</span>
          <span className="studio-injection__anchor">{anchor}</span>
        </div>
        <div
          className="studio-injection__controls"
          role="group"
          aria-label={`${title} mode`}
        >
          <button
            type="button"
            className="studio-injection__mode"
            data-active={studio.mode === "before"}
            aria-pressed={studio.mode === "before"}
            onClick={() => studio.setMode("before")}
          >
            Before
          </button>
          <button
            type="button"
            className="studio-injection__mode"
            data-active={studio.mode === "after"}
            aria-pressed={studio.mode === "after"}
            onClick={() => studio.setMode("after")}
          >
            After
          </button>
        </div>
        <span className="studio-injection__state">
          {studio.peeking ? `Option: ${studio.renderedMode}` : studio.renderedMode}
        </span>
        <button
          type="button"
          className="studio-injection__close"
          onClick={() => {
            clearStudioUrlParams(studyId);
            studio.setEnabled(false);
          }}
        >
          Close
        </button>
      </div>
      <div
        className="studio-injection__body"
        data-studio-mode={studio.renderedMode}
      >
        {studio.renderedMode === "before" ? children : renderStudy(studio)}
      </div>
    </div>
  );
}

export function StudioRegisteredInjectionHost<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>({
  registry,
  anchor,
  children,
  extraPages = [],
  storageKeyPrefix,
  renderStudy,
}: StudioRegisteredInjectionHostProps<Bucket, Surface, Status>) {
  const point = registry.insertionPoint(anchor);
  const study = registry.studyForInsertionPoint(anchor, extraPages);

  if (!study) return <>{children}</>;

  return (
    <StudioInjectionFrame
      studyId={studyIdFor(study)}
      aliases={study.target?.aliases}
      anchor={study.target?.anchor ?? anchor}
      title={point?.label ?? study.label}
      storageKeyPrefix={storageKeyPrefix}
      renderStudy={(controller) => renderStudy(study, controller)}
    >
      {children}
    </StudioInjectionFrame>
  );
}
