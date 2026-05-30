"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface UseResizableWidthOptions {
  /** Initial width if uncontrolled and nothing in localStorage. */
  defaultWidth: number;
  /** Hard minimum. Default 180. */
  minWidth?: number;
  /** Hard maximum. Default 480. */
  maxWidth?: number;
  /**
   * localStorage key. When set, hydrate from storage on mount and persist
   * on every change. Omit to skip persistence.
   */
  persistKey?: string;
  /**
   * Controlled width. When provided, the hook acts as a controlled component
   * and writes via `onWidthChange` instead of internal state.
   */
  width?: number;
  /** Notified on every width change (drag, keyboard, reset, hydration). */
  onWidthChange?: (width: number) => void;
  /**
   * When set, publish the current width as a CSS custom property on
   * `document.documentElement` (e.g. `"--studio-sidebar-width"`). Lets
   * unrelated layout chrome read the live value via `var(--…)`.
   */
  cssVar?: string;
  /** Keyboard step for ArrowLeft / ArrowRight. Default 16px. */
  stepSmall?: number;
  /** Keyboard step for Shift+Arrow. Default 48px. */
  stepLarge?: number;
  /** Accessible label for the handle. Default "Resize sidebar". */
  ariaLabel?: string;
}

export interface ResizableHandleProps {
  role: "separator";
  "aria-orientation": "vertical";
  "aria-valuenow": number;
  "aria-valuemin": number;
  "aria-valuemax": number;
  "aria-label": string;
  tabIndex: 0;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  "data-dragging"?: "true";
}

export interface UseResizableWidthResult {
  /** Current width in px. Always clamped to [min, max]. */
  width: number;
  /** Imperatively set width (clamped). */
  setWidth: (width: number) => void;
  /** Reset to `defaultWidth`. */
  reset: () => void;
  /** Spread on the handle element. Provides events + a11y attributes. */
  handleProps: ResizableHandleProps;
  /** True while a drag is in flight. */
  isDragging: boolean;
}

const DEFAULTS = {
  minWidth: 180,
  maxWidth: 480,
  stepSmall: 16,
  stepLarge: 48,
  ariaLabel: "Resize sidebar",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readStored(key: string | undefined, fallback: number): number {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string | undefined, value: number): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore (private mode, locked-down env)
  }
}

function publishVar(name: string | undefined, value: number): void {
  if (!name || typeof document === "undefined") return;
  document.documentElement.style.setProperty(name, `${value}px`);
}

/**
 * Controlled or uncontrolled width with persistence, keyboard, pointer
 * drag, and a CSS-var publishing hook. Designed for resizable sidebars
 * (drag handle on the right edge) but framework-agnostic — spread
 * `handleProps` on any element that acts as the separator.
 *
 * Pointer events (not mouse-only). Respects prefers-reduced-motion at the
 * CSS layer (consumer-owned).
 */
export function useResizableWidth(
  options: UseResizableWidthOptions,
): UseResizableWidthResult {
  const {
    defaultWidth,
    minWidth = DEFAULTS.minWidth,
    maxWidth = DEFAULTS.maxWidth,
    persistKey,
    width: controlled,
    onWidthChange,
    cssVar,
    stepSmall = DEFAULTS.stepSmall,
    stepLarge = DEFAULTS.stepLarge,
    ariaLabel = DEFAULTS.ariaLabel,
  } = options;

  // SSR-safe initial: defaultWidth. Hydrate from localStorage in effect below.
  const [internalWidth, setInternalWidth] = useState<number>(() =>
    clamp(defaultWidth, minWidth, maxWidth),
  );
  const [isDragging, setIsDragging] = useState(false);

  const width = clamp(controlled ?? internalWidth, minWidth, maxWidth);

  // Hydrate from storage once on mount (uncontrolled mode only).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (controlled != null) return;
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const stored = readStored(persistKey, defaultWidth);
    setInternalWidth(clamp(stored, minWidth, maxWidth));
  }, [controlled, defaultWidth, maxWidth, minWidth, persistKey]);

  // Publish current value to CSS var + storage on every change.
  useEffect(() => {
    publishVar(cssVar, width);
  }, [cssVar, width]);

  useEffect(() => {
    if (controlled != null) return;
    writeStored(persistKey, width);
  }, [controlled, persistKey, width]);

  const commitWidth = useCallback(
    (next: number) => {
      const clamped = clamp(next, minWidth, maxWidth);
      if (controlled == null) {
        setInternalWidth(clamped);
      }
      onWidthChange?.(clamped);
    },
    [controlled, maxWidth, minWidth, onWidthChange],
  );

  const reset = useCallback(() => {
    commitWidth(defaultWidth);
  }, [commitWidth, defaultWidth]);

  // Pointer drag — capture events on the handle, project pointerX onto width.
  const dragOriginRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      dragOriginRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startWidth: width,
      };
      setIsDragging(true);

      const handleMove = (ev: PointerEvent) => {
        const origin = dragOriginRef.current;
        if (!origin || ev.pointerId !== origin.pointerId) return;
        const dx = ev.clientX - origin.startX;
        commitWidth(origin.startWidth + dx);
      };

      const handleUp = (ev: PointerEvent) => {
        const origin = dragOriginRef.current;
        if (!origin || ev.pointerId !== origin.pointerId) return;
        target.releasePointerCapture(origin.pointerId);
        dragOriginRef.current = null;
        setIsDragging(false);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        window.removeEventListener("pointercancel", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    },
    [commitWidth, width],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? stepLarge : stepSmall;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          commitWidth(width - step);
          return;
        case "ArrowRight":
          e.preventDefault();
          commitWidth(width + step);
          return;
        case "Home":
          e.preventDefault();
          commitWidth(minWidth);
          return;
        case "End":
          e.preventDefault();
          commitWidth(maxWidth);
          return;
        case "Enter":
        case " ":
          // Activate-on-Enter/Space resets to default — matches double-click.
          e.preventDefault();
          reset();
          return;
        default:
      }
    },
    [commitWidth, maxWidth, minWidth, reset, stepLarge, stepSmall, width],
  );

  const handleProps = useMemo<ResizableHandleProps>(
    () => ({
      role: "separator",
      "aria-orientation": "vertical",
      "aria-valuenow": width,
      "aria-valuemin": minWidth,
      "aria-valuemax": maxWidth,
      "aria-label": ariaLabel,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick: reset,
      ...(isDragging ? { "data-dragging": "true" as const } : {}),
    }),
    [ariaLabel, isDragging, maxWidth, minWidth, onKeyDown, onPointerDown, reset, width],
  );

  return {
    width,
    setWidth: commitWidth,
    reset,
    handleProps,
    isDragging,
  };
}
