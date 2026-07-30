"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { EngMarkdown } from "./EngMarkdown";
import {
  AnnotationProvider,
  type AnnotationBlockKind,
  type AnnotationDecorator,
  type MdNode,
} from "./AnnotationContext";

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface AnnotationLocation {
  /** kebab-case slug of the nearest preceding heading. Empty when none. */
  sectionSlug: string;
  /** Raw heading text of the nearest preceding heading. Empty when none. */
  sectionTitle: string;
  /** 1-based source line range of this block in the original markdown. */
  lineStart: number;
  lineEnd: number;
}

export interface Annotation {
  id: string;
  anchorId: string;
  anchorKind: string;
  anchorPreview: string;
  /** When set, the annotation targets a span of text within the block. */
  spanText: string | null;
  /** Character offset of the span's start within the block's textContent. */
  spanStart: number | null;
  location: AnnotationLocation;
  body: string;
  pinned: boolean;
  createdAt: number;
}

export interface SendPassPayload {
  docTitle: string;
  slug: string;
  annotations: Annotation[];
  /** Pre-formatted DM string, the same one shown in the ship-preview. */
  formatted: string;
  /**
   * Id of the `sendTargets` entry the pass was addressed to. Absent when the
   * consumer did not supply `sendTargets`.
   */
  target?: string;
}

export interface SendPassTarget {
  /** Stable id handed back on `SendPassPayload.target`. */
  id: string;
  /** Human-facing label for the target select. */
  label: string;
}

export interface VoiceInputShape {
  status?: string;
  error?: string | null;
  lastTranscript?: string | null;
  start: () => Promise<void> | void;
  stop: () => void;
  isSupported?: boolean;
}

export interface AnnotatableDocProps {
  body: string;
  slug: string;
  docTitle: string;
  /**
   * Where the "Send pass" payload goes. When omitted, the payload is
   * surfaced in the ship preview only — useful for design-stage mocks.
   * Wire a server-owned transport here in production. Web apps should post to
   * a same-origin route (for example `studio/scout/server`) rather than trying
   * to invoke MCP or the Scout broker from the browser.
   */
  onSendPass?: (payload: SendPassPayload) => void | Promise<void>;
  /**
   * Agents the pass can be dispatched to. With two or more entries the
   * send-pass modal shows a small target select and the chosen id rides on
   * `SendPassPayload.target`; absent or a single entry renders exactly as
   * before. Routing the id is the consumer's `onSendPass` job — e.g. POST to
   * its own `/api/scout/messages` with a matching `target`.
   */
  sendTargets?: SendPassTarget[];
  /**
   * sessionStorage key for the in-progress pass. Default:
   * `studio.annotations.<slug>` — set explicitly when two annotators
   * could share a tab.
   */
  storageKey?: string;
  /** Forwarded to `EngMarkdown` — see its docs. */
  fromSlug?: string;
  compact?: boolean;
  className?: string;

  /**
   * Called whenever annotations change (add, edit, pin, delete).
   * Use this to sync to disk, a local API, or external state so that
   * agents running in Cursor, a scout session, terminal, etc. can pick up
   * the commentary without you having to copy-paste.
   *
   * This is the main hook for the "human in browser → external agent picks it up"
   * workflow. The annotations array includes both ephemeral and pinned.
   */
  onAnnotationsChange?: (annotations: Annotation[]) => void | Promise<void>;

  /**
   * Optional: a stable key for persisting decisions/annotations outside
   * the browser (e.g. to a sidecar JSON file). The component itself doesn't
   * write files (it's client code), but you can use this key in your
   * onAnnotationsChange handler or in a paired server route to decide
   * where to write (e.g. `.studio/annotations/${persistKey}.json`).
   */
  persistKey?: string;

  /**
   * Optional voice input result from hudsonkit/voice (recommended).
   * When supplied, the mic button uses Hudson's STT (daemon-powered) instead
   * of the browser Web Speech fallback. Transcripts are appended to the
   * current draft note.
   *
   * See the README and .studio/AGENTS.md for the exact `useVoiceInput` pattern
   * and how to combine it with `persistAnnotations`.
   */
  voiceInput?: VoiceInputShape;
}

/* -------------------------------------------------------------------------- */
/* Internal types                                                             */
/* -------------------------------------------------------------------------- */

type DraftAnchor = {
  id: string;
  kind: string;
  preview: string;
  spanText: string | null;
  spanStart: number | null;
  location: AnnotationLocation;
};

type SelectionFlyout = {
  blockId: string;
  kind: string;
  preview: string;
  span: { text: string; start: number };
  location: AnnotationLocation;
  x: number;
  y: number;
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Annotation pass over an `EngMarkdown` doc.
 *
 * Two anchor modes: click a block to leave a block-level note, or drag-
 * select text to leave a span-level note. Notes default to ephemeral
 * (cleared on "Send pass"); ★ pinning carries them across passes.
 *
 * Spans render via the CSS Custom Highlight API — no DOM mutation —
 * so they survive react-markdown re-renders.
 *
 * Each annotation carries a triple locator (`§ slug · L18-22 · "quoted"`)
 * so the addressed location holds up across doc edits even if one
 * dimension drifts.
 */
export function AnnotatableDoc({
  body,
  slug,
  docTitle,
  onSendPass,
  sendTargets,
  storageKey,
  fromSlug,
  compact = false,
  className,
  onAnnotationsChange,
  persistKey,
  voiceInput,
}: AnnotatableDocProps) {
  const STORAGE_KEY = storageKey ?? `studio.annotations.${slug}`;

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftAnchor, setDraftAnchor] = useState<DraftAnchor | null>(null);
  const [selectionFlyout, setSelectionFlyout] =
    useState<SelectionFlyout | null>(null);
  /** True between a mousedown that lands inside the doc and its mouseup.
   * While true, the selection flyout renders in "hint" mode rather than
   * the full "Annotate …" button — the user is still adjusting. */
  const [selecting, setSelecting] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [shipOpen, setShipOpen] = useState(false);
  const [shipState, setShipState] = useState<
    "idle" | "sending" | "copied" | "sent"
  >("idle");
  const [isListening, setIsListening] = useState(false);
  const [sendTarget, setSendTarget] = useState<string | undefined>(
    sendTargets?.[0]?.id,
  );
  const recognitionRef = useRef<any>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // When hudsonkit voiceInput is provided, watch for transcripts and append
  // them to the current draft (seamless into the composer).
  useEffect(() => {
    const transcript = voiceInput?.lastTranscript;
    if (transcript) {
      setDraftText((prev) =>
        (prev ? prev + ' ' + transcript : transcript).trim(),
      );
    }
  }, [voiceInput?.lastTranscript]);

  // Hydrate ephemeral state from sessionStorage so a refresh keeps the pass alive.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setAnnotations(JSON.parse(raw));
    } catch {}
  }, [STORAGE_KEY]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    } catch {}
  }, [annotations, STORAGE_KEY]);

  // Notify external observers (Cursor, scout agents, other tools, file writers, etc.)
  // so they can pick up new commentary without manual sync.
  // The consumer is responsible for actually writing to disk / API if desired.
  // `persistKey` is provided so the handler knows a stable name for sidecar files
  // (e.g. `.studio/annotations/${persistKey || slug}.json`).
  useEffect(() => {
    if (onAnnotationsChange) {
      void Promise.resolve(onAnnotationsChange(annotations)).catch(() => {});
    }
  }, [annotations, onAnnotationsChange]);

  useEffect(() => {
    if (draftAnchor && composerRef.current) {
      composerRef.current.focus();
    }
  }, [draftAnchor]);

  /**
   * Track native selection. When it lands inside an annotatable block
   * within this root, surface a small flyout near the selection's end
   * so the user can commit it without the next click tearing it down.
   */
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionFlyout(null);
        return;
      }
      const range = sel.getRangeAt(0);
      let node: Node | null = range.commonAncestorContainer;
      if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
      // Scope to this annotator instance.
      if (!rootRef.current || !rootRef.current.contains(node)) {
        setSelectionFlyout(null);
        return;
      }
      const block =
        node instanceof Element
          ? (node.closest("[data-anchor-id]") as HTMLElement | null)
          : null;
      if (!block) {
        setSelectionFlyout(null);
        return;
      }
      const text = sel.toString();
      if (!text.trim()) {
        setSelectionFlyout(null);
        return;
      }
      if (text.trim() === (block.textContent ?? "").trim()) {
        // Full-block selection — let the block click path own it.
        setSelectionFlyout(null);
        return;
      }
      const preRange = document.createRange();
      preRange.selectNodeContents(block);
      preRange.setEnd(range.startContainer, range.startOffset);
      const start = preRange.toString().length;
      const rect = range.getBoundingClientRect();
      const lineStart = Number(block.dataset.anchorLineStart ?? "0");
      const lineEnd = Number(block.dataset.anchorLineEnd ?? "0");
      setSelectionFlyout({
        blockId: block.dataset.anchorId ?? "",
        kind: block.dataset.anchorKind ?? "p",
        preview: previewOf(block.textContent ?? ""),
        span: { text, start },
        location: {
          sectionSlug: block.dataset.anchorSectionSlug ?? "",
          sectionTitle: block.dataset.anchorSectionTitle ?? "",
          lineStart,
          lineEnd,
        },
        x: rect.right,
        y: rect.bottom + 8,
      });
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  /**
   * Track whether the user is mid-drag inside this annotator. Used to
   * gate the selection flyout into "hint" mode while the range is still
   * moving, and "ready" mode after mouseup. Keyboard selections
   * (shift+arrow) never enter `selecting`, so they go straight to ready.
   */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (rootRef.current && target && rootRef.current.contains(target)) {
        setSelecting(true);
      }
    };
    const onUp = () => setSelecting(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  /**
   * Paint span highlights via the CSS Custom Highlight API.
   * Three tones share the rendered DOM without mutating it: ephemeral,
   * pinned, draft. Feature-detect so this no-ops in older engines.
   *
   * Highlight registry names include the slug so multiple annotators
   * on the same page don't clobber each other.
   */
  useEffect(() => {
    const cssAny = CSS as unknown as { highlights?: Map<string, unknown> };
    const HighlightCtor = (globalThis as unknown as {
      Highlight?: new (...ranges: Range[]) => unknown;
    }).Highlight;
    if (!cssAny.highlights || !HighlightCtor) return;

    const ns = `eng-doc-anno-${slug}`;
    const eph: Range[] = [];
    const pin: Range[] = [];
    for (const a of annotations) {
      if (a.spanText == null || a.spanStart == null) continue;
      const range = findRangeInBlock(a.anchorId, a.spanText, a.spanStart);
      if (range) (a.pinned ? pin : eph).push(range);
    }
    const draftRanges: Range[] = [];
    if (
      draftAnchor &&
      draftAnchor.spanText != null &&
      draftAnchor.spanStart != null
    ) {
      const range = findRangeInBlock(
        draftAnchor.id,
        draftAnchor.spanText,
        draftAnchor.spanStart,
      );
      if (range) draftRanges.push(range);
    }
    cssAny.highlights.set(`${ns}-ephemeral`, new HighlightCtor(...eph));
    cssAny.highlights.set(`${ns}-pinned`, new HighlightCtor(...pin));
    cssAny.highlights.set(`${ns}-draft`, new HighlightCtor(...draftRanges));
    return () => {
      cssAny.highlights?.delete(`${ns}-ephemeral`);
      cssAny.highlights?.delete(`${ns}-pinned`);
      cssAny.highlights?.delete(`${ns}-draft`);
    };
  }, [annotations, draftAnchor, slug]);

  const openCount = annotations.filter((a) => !a.pinned).length;
  const pinnedCount = annotations.filter((a) => a.pinned).length;

  const countsByAnchor = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) m.set(a.anchorId, (m.get(a.anchorId) ?? 0) + 1);
    return m;
  }, [annotations]);

  const startDraft = useCallback(
    (
      anchorId: string,
      kind: string,
      preview: string,
      span: { text: string; start: number } | null,
      location: AnnotationLocation,
    ) => {
      setDraftAnchor({
        id: anchorId,
        kind,
        preview,
        spanText: span?.text ?? null,
        spanStart: span?.start ?? null,
        location,
      });
      setDraftText("");
      // Clear native selection now that we've captured it — keeps the
      // highlight tone consistent (draft Highlight takes over).
      try {
        window.getSelection()?.removeAllRanges();
      } catch {}
    },
    [],
  );

  const saveDraft = useCallback(() => {
    const text = draftText.trim();
    if (!text || !draftAnchor) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `n${Date.now()}`,
        anchorId: draftAnchor.id,
        anchorKind: draftAnchor.kind,
        anchorPreview: draftAnchor.preview,
        spanText: draftAnchor.spanText,
        spanStart: draftAnchor.spanStart,
        location: draftAnchor.location,
        body: text,
        pinned: false,
        createdAt: Date.now(),
      },
    ]);
    setDraftAnchor(null);
    setDraftText("");
  }, [draftText, draftAnchor]);

  const cancelDraft = useCallback(() => {
    setDraftAnchor(null);
    setDraftText("");
  }, []);

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)),
    );
  }, []);

  const scrollToAnchor = useCallback((anchorId: string) => {
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("anchor-flash");
    window.setTimeout(() => el.classList.remove("anchor-flash"), 1200);
  }, []);

  // Dictation: prefers hudsonkit voiceInput when provided (daemon-powered STT,
  // better quality, consistent with the rest of the Hudson app).
  // Falls back to browser Web Speech API.
  const toggleDictation = useCallback(() => {
    if (voiceInput) {
      if (!voiceInput.isSupported) {
        alert('Voice input is not supported in this environment.');
        return;
      }
      if (voiceInput.status === 'recording' || isListening) {
        voiceInput.stop();
        setIsListening(false);
      } else {
        const maybePromise = voiceInput.start();
        if (maybePromise && typeof (maybePromise as any).catch === 'function') {
          (maybePromise as Promise<void>).catch(() => setIsListening(false));
        }
        setIsListening(true);
      }
      return;
    }

    // Browser fallback (Web Speech API)
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition not supported in this browser. Try Chrome or Edge, or wire hudsonkit/voice.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setDraftText((prev) => (prev ? prev + ' ' + transcript : transcript).trim());
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    try {
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch (e) {
      setIsListening(false);
    }
  }, [isListening, voiceInput]);

  const ephemerals = useMemo(
    () => annotations.filter((a) => !a.pinned),
    [annotations],
  );

  const buildPayload = useCallback((): SendPassPayload => {
    const target = sendTargets?.length
      ? (sendTargets.some((entry) => entry.id === sendTarget)
          ? sendTarget
          : sendTargets[0]?.id)
      : undefined;
    return {
      docTitle,
      slug,
      annotations: ephemerals,
      formatted: formatDmPayload(docTitle, slug, ephemerals),
      target,
    };
  }, [docTitle, slug, ephemerals, sendTargets, sendTarget]);

  /**
   * Default action: copy the formatted payload to the clipboard, then
   * clear ephemerals. The user pastes into whichever transport they
   * use (scout DM, Slack, ticket) — no implicit network behavior.
   */
  const copyPass = useCallback(async () => {
    const payload = buildPayload();
    setShipState("sending");
    try {
      await navigator.clipboard.writeText(payload.formatted);
    } catch (err) {
      console.error("[AnnotatableDoc] clipboard write failed:", err);
      setShipState("idle");
      return;
    }
    setAnnotations((prev) => prev.filter((a) => a.pinned));
    setShipState("copied");
    window.setTimeout(() => {
      setShipOpen(false);
      setShipState("idle");
    }, 1400);
  }, [buildPayload]);

  /**
   * Optional active send path. Only used when the consumer supplies
   * `onSendPass` — otherwise the modal hides this button entirely and
   * `copyPass` is the only ship affordance.
   */
  const sendPass = useCallback(async () => {
    if (!onSendPass) return;
    const payload = buildPayload();
    setShipState("sending");
    try {
      await onSendPass(payload);
    } catch (err) {
      console.error("[AnnotatableDoc] onSendPass failed:", err);
      setShipState("idle");
      return;
    }
    setAnnotations((prev) => prev.filter((a) => a.pinned));
    setShipState("sent");
    window.setTimeout(() => {
      setShipOpen(false);
      setShipState("idle");
    }, 1400);
  }, [buildPayload, onSendPass]);

  const sectionMap = useMemo(() => buildSectionMap(body), [body]);

  // Build the decorator. EngMarkdown invokes this once per block element.
  const decorator: AnnotationDecorator = useCallback(
    ({ kind, node, children }) => {
      const text = extractText(children);
      const visibleKind = kind === "pre" ? "code" : kind;
      const anchorId = anchorIdFor(visibleKind, text);
      const preview = previewOf(text);
      const count = countsByAnchor.get(anchorId) ?? 0;
      const isDraft = draftAnchor?.id === anchorId;

      const lineStart = node?.position?.start?.line ?? 0;
      const lineEnd = node?.position?.end?.line ?? lineStart;
      const section = sectionMap.get(lineStart) ?? { slug: "", title: "" };
      const location: AnnotationLocation = {
        sectionSlug: section.slug,
        sectionTitle: section.title,
        lineStart,
        lineEnd,
      };

      const className = [
        "anchor",
        `anchor--${kind}`,
        count > 0 ? "anchor--has-notes" : "",
        isDraft ? "anchor--drafting" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return {
        extraProps: {
          id: anchorId,
          "data-anchor-id": anchorId,
          "data-anchor-kind": visibleKind,
          "data-anchor-section-slug": location.sectionSlug,
          "data-anchor-section-title": location.sectionTitle,
          "data-anchor-line-start": String(lineStart),
          "data-anchor-line-end": String(lineEnd),
          className,
          onClick: (e: React.MouseEvent<HTMLElement>) => {
            const target = e.target as HTMLElement;
            if (target.closest("a, button, input, textarea")) return;
            const span = captureSpanFromSelection(e.currentTarget);
            startDraft(anchorId, visibleKind, preview, span, location);
          },
        },
        prefix: (
          <span className="anchor-gutter" aria-hidden>
            {count > 0 ? (
              <span className="anchor-gutter__count">{count}</span>
            ) : (
              "+"
            )}
          </span>
        ),
      };
    },
    [countsByAnchor, draftAnchor?.id, sectionMap, startDraft],
  );

  const rootClass = ["annotator-root", className].filter(Boolean).join(" ");

  return (
    <div className={rootClass} ref={rootRef}>
      <PassHeader
        docTitle={docTitle}
        slug={slug}
        openCount={openCount}
        pinnedCount={pinnedCount}
        canShip={ephemerals.length > 0}
        onShipClick={() => setShipOpen(true)}
      />

      <div className="annotator-grid">
        <div className="annotator-doc">
          <AnnotationProvider decorator={decorator}>
            <EngMarkdown body={body} fromSlug={fromSlug} compact={compact} />
          </AnnotationProvider>
        </div>

        <aside className="annotator-margin">
          <div className="annotator-margin__header">
            <span className="eyebrow">Margin · this pass</span>
            <span className="annotator-counts">
              <Pip tone="ephemeral">
                {openCount} note{openCount === 1 ? "" : "s"}
              </Pip>
              <Pip tone="pinned">{pinnedCount} pinned</Pip>
            </span>
          </div>

          {annotations.length === 0 && !draftAnchor && <EmptyHint />}

          <ul className="annotator-list">
            {draftAnchor && (
              <li className="annotator-note annotator-note--draft">
                <div className="annotator-note__anchor">
                  <span className="annotator-note__kind">
                    {draftAnchor.kind}
                    {draftAnchor.spanText != null && (
                      <span className="annotator-note__span-chip">span</span>
                    )}
                  </span>
                  <span className="annotator-note__locator">
                    {formatLocationShort(draftAnchor.location)}
                  </span>
                  <span className="annotator-note__preview">
                    {draftAnchor.spanText != null
                      ? `“${spanPreview(draftAnchor.spanText)}”`
                      : draftAnchor.preview}
                  </span>
                </div>
                <textarea
                  ref={composerRef}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      saveDraft();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelDraft();
                    }
                  }}
                  placeholder="What's the thought? (⌘↵ to save · esc to cancel)"
                  className="annotator-composer"
                  rows={3}
                />
                <div className="annotator-note__actions">
                  <button
                    type="button"
                    onClick={toggleDictation}
                    className={`btn btn--ghost ${isListening || voiceInput?.status === 'recording' ? 'is-listening' : ''}`}
                    title={
                      voiceInput
                        ? voiceInput.error
                          ? `Voice error: ${voiceInput.error}`
                          : isListening || voiceInput.status === 'recording'
                          ? 'Stop voice dictation (hudsonkit)'
                          : 'Dictate using hudsonkit voice (or browser fallback)'
                        : isListening
                        ? 'Stop dictation'
                        : 'Dictate (speech to text)'
                    }
                    disabled={voiceInput ? !voiceInput.isSupported : false}
                  >
                    {isListening || voiceInput?.status === 'recording' ? '◉' : '🎤'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="btn btn--ghost"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveDraft}
                    disabled={!draftText.trim()}
                    className="btn btn--primary"
                  >
                    Save note
                  </button>
                </div>
              </li>
            )}

            {annotations.map((a) => (
              <li
                key={a.id}
                className={`annotator-note ${
                  a.pinned ? "annotator-note--pinned" : ""
                }`}
              >
                <button
                  type="button"
                  className="annotator-note__anchor"
                  onClick={() => scrollToAnchor(a.anchorId)}
                  title="Jump to source"
                >
                  <span className="annotator-note__kind">
                    {a.anchorKind}
                    {a.spanText != null && (
                      <span className="annotator-note__span-chip">span</span>
                    )}
                  </span>
                  <span className="annotator-note__locator">
                    {formatLocationShort(a.location)}
                  </span>
                  <span className="annotator-note__preview">
                    {a.spanText != null
                      ? `“${spanPreview(a.spanText)}”`
                      : a.anchorPreview}
                  </span>
                </button>
                <p className="annotator-note__body">{a.body}</p>
                <div className="annotator-note__actions">
                  <button
                    type="button"
                    onClick={() => togglePin(a.id)}
                    className={`btn btn--ghost ${a.pinned ? "is-on" : ""}`}
                    title={
                      a.pinned ? "Pinned — survives send" : "Pin to survive send"
                    }
                  >
                    {a.pinned ? "★ Pinned" : "☆ Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAnnotation(a.id)}
                    className="btn btn--ghost"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {shipOpen && (
        <ShipModal
          docTitle={docTitle}
          slug={slug}
          annotations={ephemerals}
          state={shipState}
          hasSink={Boolean(onSendPass)}
          sendTargets={sendTargets}
          selectedTarget={sendTarget}
          onSelectTarget={setSendTarget}
          onCancel={() => setShipOpen(false)}
          onCopy={copyPass}
          onSend={sendPass}
        />
      )}

      {selectionFlyout &&
        (selecting ? (
          // Hint mode — quiet acknowledgement that an annotation could
          // start here. No commitment, no quoted text, can't be clicked.
          <div
            className="annotator-fly annotator-fly--hint"
            style={{
              left: selectionFlyout.x,
              top: selectionFlyout.y,
            }}
            aria-hidden
          >
            <span className="annotator-fly__dot">✎</span>
          </div>
        ) : (
          // Ready mode — selection settled, show the full affordance.
          <div
            className="annotator-fly annotator-fly--ready"
            style={{
              left: selectionFlyout.x,
              top: selectionFlyout.y,
            }}
          >
            <button
              type="button"
              // mouseDown + preventDefault keeps the selection alive until
              // we've captured it; onClick fires after the browser had a
              // chance to collapse the range.
              onMouseDown={(e) => {
                e.preventDefault();
                startDraft(
                  selectionFlyout.blockId,
                  selectionFlyout.kind,
                  selectionFlyout.preview,
                  selectionFlyout.span,
                  selectionFlyout.location,
                );
                setSelectionFlyout(null);
              }}
              className="annotator-fly__btn"
            >
              <span aria-hidden>✎</span>
              Annotate “{spanPreview(selectionFlyout.span.text)}”
            </button>
          </div>
        ))}

      <style>{annotatorCss(slug)}</style>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function PassHeader({
  docTitle,
  slug,
  openCount,
  pinnedCount,
  canShip,
  onShipClick,
}: {
  docTitle: string;
  slug: string;
  openCount: number;
  pinnedCount: number;
  canShip: boolean;
  onShipClick: () => void;
}) {
  return (
    <header className="annotator-header">
      <div className="annotator-header__meta">
        <div className="eyebrow">annotations · eng-doc · ephemeral pass</div>
        <h1 className="annotator-header__title">{docTitle}</h1>
        <div className="annotator-header__sub">
          <span className="mono">/eng/{slug}</span>
          <span className="annotator-header__dot">·</span>
          <span>
            click any paragraph, heading, or list item to leave a note
          </span>
        </div>
      </div>
      <div className="annotator-header__actions">
        <Pip tone="ephemeral">{openCount} ephemeral</Pip>
        <Pip tone="pinned">{pinnedCount} pinned</Pip>
        <button
          type="button"
          className="btn btn--primary"
          onClick={onShipClick}
          disabled={!canShip}
          title={
            canShip
              ? "Bundle ephemeral notes and send a review pass to the agent"
              : "No ephemeral notes to send"
          }
        >
          Send pass →
        </button>
      </div>
    </header>
  );
}

function EmptyHint() {
  return (
    <div className="annotator-empty">
      <div className="annotator-empty__chip">empty pass</div>
      <p>
        Hover any block in the doc → a faint <span className="mono">+</span>{" "}
        appears in the gutter. Click it, or click the block itself, to drop a
        note here.
      </p>
      <p className="annotator-empty__small">
        Notes are <strong>ephemeral</strong> by default — they clear when you
        Send pass. ★ Pin the ones worth keeping across passes.
      </p>
    </div>
  );
}

function ShipModal({
  docTitle,
  slug,
  annotations,
  state,
  hasSink,
  sendTargets,
  selectedTarget,
  onSelectTarget,
  onCancel,
  onCopy,
  onSend,
}: {
  docTitle: string;
  slug: string;
  annotations: Annotation[];
  state: "idle" | "sending" | "copied" | "sent";
  hasSink: boolean;
  sendTargets?: SendPassTarget[];
  selectedTarget?: string;
  onSelectTarget?: (id: string) => void;
  onCancel: () => void;
  onCopy: () => void;
  onSend: () => void;
}) {
  const payload = formatDmPayload(docTitle, slug, annotations);
  const busy = state === "sending";
  const finished = state === "copied" || state === "sent";
  const copyLabel =
    state === "copied"
      ? "Copied ✓"
      : busy
      ? "Copying…"
      : `Copy ${annotations.length} note${annotations.length === 1 ? "" : "s"}`;
  const sendLabel =
    state === "sent" ? "Sent ✓" : busy ? "Sending…" : "Send →";
  return (
    <div className="annotator-modal" role="dialog" aria-modal="true">
      <div className="annotator-modal__backdrop" onClick={onCancel} />
      <div className="annotator-modal__card">
        <div className="annotator-modal__header">
          <div>
            <div className="eyebrow">ship preview · annotations-only payload</div>
            <h2>Send review pass</h2>
          </div>
          <button type="button" onClick={onCancel} className="btn btn--ghost">
            Close
          </button>
        </div>
        <p className="annotator-modal__lede">
          Author receives the notes <em>only</em> — no doc snapshot. They
          re-read <span className="mono">/eng/{slug}</span> to ground on the
          current source. Ephemeral notes clear on copy/send; pinned ones
          survive.
        </p>
        <pre className="annotator-modal__payload">{payload}</pre>
        {sendTargets && sendTargets.length >= 2 ? (
          <label className="annotator-modal__target">
            <span className="eyebrow">send to</span>
            <select
              value={selectedTarget ?? sendTargets[0]?.id}
              onChange={(e) => onSelectTarget?.(e.target.value)}
              disabled={busy || finished}
            >
              {sendTargets.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="annotator-modal__actions">
          <button type="button" onClick={onCancel} className="btn btn--ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={onCopy}
            disabled={busy || finished || annotations.length === 0}
            className="btn btn--primary"
            title="Copy the formatted payload to your clipboard, then paste into scout / Slack / wherever"
          >
            {copyLabel}
          </button>
          {hasSink && (
            <button
              type="button"
              onClick={onSend}
              disabled={busy || finished || annotations.length === 0}
              className="btn btn--primary"
            >
              {sendLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Pip({
  tone,
  children,
}: {
  tone: "ephemeral" | "pinned";
  children: ReactNode;
}) {
  return <span className={`pip pip--${tone}`}>{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function anchorIdFor(kind: string, text: string): string {
  return `a-${kind}-${cheapHash(text.slice(0, 80))}`;
}

/**
 * Capture the current native selection if it lives within `blockEl`.
 * Returns `text` plus its character offset within the block's textContent —
 * enough to rebuild a Range across re-renders without DOM mutation.
 */
function captureSpanFromSelection(
  blockEl: HTMLElement,
): { text: string; start: number } | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!blockEl.contains(range.commonAncestorContainer)) return null;
  const text = sel.toString();
  if (!text.trim()) return null;
  // Skip if the selection is the entire block — treat that as block-level.
  if (text.trim() === (blockEl.textContent ?? "").trim()) return null;
  const preRange = document.createRange();
  preRange.selectNodeContents(blockEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  return { text, start };
}

/**
 * Re-locate a stored span (text + character offset within the block) as a
 * live Range. Returns null if the block has been edited beyond recognition.
 */
function findRangeInBlock(
  blockId: string,
  text: string,
  startOffset: number,
): Range | null {
  if (typeof document === "undefined") return null;
  const block = document.getElementById(blockId);
  if (!block) return null;
  const endOffset = startOffset + text.length;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let startNode: Text | null = null;
  let startNodeOffset = 0;
  let endNode: Text | null = null;
  let endNodeOffset = 0;
  let node = walker.nextNode() as Text | null;
  while (node) {
    const len = node.length;
    if (!startNode && pos + len > startOffset) {
      startNode = node;
      startNodeOffset = startOffset - pos;
    }
    if (startNode && pos + len >= endOffset) {
      endNode = node;
      endNodeOffset = endOffset - pos;
      break;
    }
    pos += len;
    node = walker.nextNode() as Text | null;
  }
  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    if (range.toString() !== text) return null;
    return range;
  } catch {
    return null;
  }
}

function spanPreview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 60 ? `${t.slice(0, 60)}…` : t;
}

/**
 * Pre-walk the markdown source to build a line→section lookup. The "section"
 * is the nearest preceding heading (any level). Code-fenced lines inherit
 * their surrounding section and headings inside fences are ignored.
 */
function buildSectionMap(
  source: string,
): Map<number, { slug: string; title: string }> {
  const map = new Map<number, { slug: string; title: string }>();
  const lines = source.split(/\r?\n/);
  let current = { slug: "", title: "" };
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence) {
      const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (m) {
        const title = m[2].trim();
        current = { slug: slugifyString(title), title };
      }
    }
    map.set(i + 1, current);
  }
  return map;
}

function slugifyString(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatLocationShort(loc: AnnotationLocation): string {
  const lines =
    loc.lineStart === loc.lineEnd
      ? `L${loc.lineStart}`
      : `L${loc.lineStart}-${loc.lineEnd}`;
  if (!loc.sectionSlug) return `intro · ${lines}`;
  return `§ ${loc.sectionSlug} · ${lines}`;
}

function formatLocationLong(loc: AnnotationLocation): string {
  const lines =
    loc.lineStart === loc.lineEnd
      ? `L${loc.lineStart}`
      : `L${loc.lineStart}-L${loc.lineEnd}`;
  if (!loc.sectionTitle) return `(intro) · ${lines}`;
  return `§ "${loc.sectionTitle}" · ${lines}`;
}

function previewOf(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

function cheapHash(s: string): string {
  // FNV-1a, base36 — short, stable, no crypto, no deps.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
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

/**
 * Format an annotations-only DM payload. Exported so consumers can compose
 * their own send pipeline without re-implementing the wire format.
 */
export function formatDmPayload(
  docTitle: string,
  slug: string,
  annotations: Annotation[],
): string {
  if (annotations.length === 0) return "(no ephemeral notes to send)";
  const lines: string[] = [];
  lines.push(`Review pass — ${docTitle}`);
  lines.push(`Source: /eng/${slug} (re-read for current state)`);
  lines.push("");
  annotations.forEach((a, i) => {
    const tag = a.spanText != null ? `${a.anchorKind} · span` : a.anchorKind;
    const quoted = a.spanText != null ? a.spanText : a.anchorPreview;
    lines.push(`${i + 1}. ${formatLocationLong(a.location)} · ${tag}`);
    lines.push(`   "${quoted}"`);
    lines.push(`   → ${a.body}`);
    lines.push("");
  });
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Scoped to `.annotator-root`. Highlight-tone names include the slug so
 * multiple annotators on the same page paint into separate registries.
 *
 * Self-contained: no Tailwind classes, so consumers can mount this without
 * widening their `content` globs to scan `studio/**`.
 */
function annotatorCss(slug: string): string {
  return BASE_ANNOTATOR_CSS + highlightToneCss(slug);
}

function highlightToneCss(slug: string): string {
  // CSS Custom Highlight registry names must match keys set in the effect.
  const ns = `eng-doc-anno-${slug}`;
  return `
::highlight(${ns}-ephemeral) {
  background-color: rgba(103,232,249,0.22);
}
::highlight(${ns}-pinned) {
  background-color: rgba(252,211,77,0.22);
  text-decoration: underline solid rgba(252,211,77,0.7);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
::highlight(${ns}-draft) {
  background-color: rgba(103,232,249,0.40);
}
`;
}

const BASE_ANNOTATOR_CSS = `
.annotator-root {
  --annotator-edge: var(--studio-edge, rgba(255,255,255,0.08));
  --annotator-ink: var(--studio-ink, rgba(255,255,255,0.92));
  --annotator-ink-faint: var(--studio-ink-faint, rgba(255,255,255,0.55));
  --annotator-surface: var(--studio-surface, #11161a);
  --annotator-canvas: var(--studio-canvas, #0a0f12);
  --annotator-canvas-alt: var(--studio-canvas-alt, #0d1417);
  --annotator-accent: #67e8f9;
  --annotator-accent-bg: rgba(103,232,249,0.10);
  --annotator-accent-edge: rgba(103,232,249,0.28);
  --annotator-pin: #fcd34d;
  --annotator-pin-bg: rgba(252,211,77,0.10);
  --annotator-pin-edge: rgba(252,211,77,0.32);
}
.annotator-root .eyebrow {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--annotator-ink-faint);
}
.annotator-root .mono {
  font-family: var(--font-mono, ui-monospace, monospace);
}
.annotator-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
  padding: 24px 32px 18px;
  border-bottom: 1px solid var(--annotator-edge);
  flex-wrap: wrap;
}
.annotator-header__title {
  font-size: 28px;
  font-weight: 600;
  margin: 6px 0 4px;
  color: var(--annotator-ink);
  letter-spacing: -0.01em;
}
.annotator-header__sub {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--annotator-ink-faint);
  flex-wrap: wrap;
}
.annotator-header__dot { opacity: 0.5; }
.annotator-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.annotator-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 0;
  align-items: start;
}
@media (max-width: 1100px) {
  .annotator-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.annotator-doc {
  padding: 32px 40px 80px;
  min-width: 0;
  position: relative;
}
.annotator-doc .anchor {
  position: relative;
  cursor: pointer;
  padding-left: 18px;
  margin-left: -18px;
  border-radius: 4px;
}
.annotator-doc .anchor-gutter {
  position: absolute;
  left: -2px;
  top: 0.45em;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono, ui-monospace, monospace);
  color: var(--annotator-ink-faint);
  opacity: 0;
  transition: opacity 100ms ease, color 100ms ease, background-color 100ms ease;
  pointer-events: none;
  user-select: none;
}
.annotator-doc .anchor:hover .anchor-gutter,
.annotator-doc .anchor--has-notes .anchor-gutter,
.annotator-doc .anchor--drafting .anchor-gutter {
  opacity: 1;
}
.annotator-doc .anchor--has-notes .anchor-gutter {
  color: var(--annotator-accent);
  background: var(--annotator-accent-bg);
  border: 1px solid var(--annotator-accent-edge);
}
.annotator-doc .anchor--drafting::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.2em;
  bottom: 0.2em;
  width: 2px;
  border-radius: 2px;
  background: var(--annotator-accent);
}
.annotator-doc .anchor--drafting .anchor-gutter {
  color: var(--annotator-accent);
}
.annotator-doc .anchor-gutter__count {
  display: inline-block;
}
.annotator-doc .anchor--pre {
  padding-left: 18px;
  margin-left: -18px;
}
.annotator-doc .anchor-flash {
  animation: anchor-flash 1200ms ease;
}
@keyframes anchor-flash {
  0%, 100% { background: transparent; }
  20%, 60% { background: rgba(103,232,249,0.16); }
}
.annotator-fly {
  position: fixed;
  z-index: 90;
  pointer-events: auto;
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.annotator-fly--hint {
  pointer-events: none;
  transform: translate(6px, 2px);
  opacity: 0.85;
}
.annotator-fly__dot {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--annotator-accent-edge);
  background: rgba(103,232,249,0.10);
  color: var(--annotator-accent);
  font-size: 10px;
  line-height: 1;
  box-shadow: 0 4px 12px rgba(0,0,0,0.30);
  animation: anno-hint-pulse 1.6s ease-in-out infinite;
}
@keyframes anno-hint-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(103,232,249,0.0), 0 4px 12px rgba(0,0,0,0.30);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(103,232,249,0.16), 0 4px 12px rgba(0,0,0,0.30);
  }
}
.annotator-fly--ready {
  transform: translate(-100%, 0);
  opacity: 1;
  animation: anno-fly-enter 160ms ease-out both;
}
@keyframes anno-fly-enter {
  from {
    opacity: 0;
    transform: translate(-100%, -4px);
  }
  to {
    opacity: 1;
    transform: translate(-100%, 0);
  }
}
.annotator-fly__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid var(--annotator-accent-edge);
  background: var(--annotator-accent-bg);
  color: var(--annotator-accent);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0,0,0,0.32);
  backdrop-filter: blur(6px);
  max-width: 380px;
}
.annotator-fly__btn span[aria-hidden] {
  font-size: 11px;
}
.annotator-fly__btn:hover {
  background: rgba(103,232,249,0.18);
}
.annotator-note__locator {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--annotator-ink-faint);
  opacity: 0.75;
  margin-top: -2px;
}
.annotator-note--pinned .annotator-note__locator {
  color: var(--annotator-pin);
  opacity: 0.9;
}
.annotator-note--draft .annotator-note__locator {
  color: var(--annotator-accent);
  opacity: 0.9;
}
.annotator-note__span-chip {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--annotator-accent-edge);
  color: var(--annotator-accent);
  background: var(--annotator-accent-bg);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 8px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  vertical-align: middle;
}
.annotator-note--pinned .annotator-note__span-chip {
  border-color: var(--annotator-pin-edge);
  color: var(--annotator-pin);
  background: var(--annotator-pin-bg);
}
.annotator-margin {
  position: sticky;
  top: 0;
  padding: 24px 24px 80px;
  border-left: 1px solid var(--annotator-edge);
  background: var(--annotator-canvas);
  min-height: 100vh;
  max-height: 100vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
@media (max-width: 1100px) {
  .annotator-margin {
    position: static;
    border-left: none;
    border-top: 1px solid var(--annotator-edge);
    max-height: none;
    min-height: 0;
  }
}
.annotator-margin__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.annotator-counts {
  display: flex;
  gap: 6px;
}
.annotator-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.annotator-note {
  border: 1px solid var(--annotator-edge);
  background: var(--annotator-surface);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.annotator-note--pinned {
  border-color: var(--annotator-pin-edge);
  background: linear-gradient(0deg, var(--annotator-pin-bg), var(--annotator-pin-bg)), var(--annotator-surface);
}
.annotator-note--draft {
  border-color: var(--annotator-accent-edge);
  background: linear-gradient(0deg, var(--annotator-accent-bg), var(--annotator-accent-bg)), var(--annotator-surface);
}
.annotator-note__anchor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.annotator-note__anchor:hover .annotator-note__preview {
  color: var(--annotator-accent);
}
.annotator-note__kind {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--annotator-ink-faint);
}
.annotator-note__preview {
  font-size: 11px;
  line-height: 1.4;
  color: var(--annotator-ink-faint);
  font-style: italic;
  border-left: 2px solid var(--annotator-edge);
  padding-left: 8px;
  transition: color 100ms ease;
}
.annotator-note__body {
  font-size: 13px;
  line-height: 1.5;
  color: var(--annotator-ink);
  margin: 0;
  white-space: pre-wrap;
}
.annotator-composer {
  width: 100%;
  resize: vertical;
  border-radius: 6px;
  border: 1px solid var(--annotator-edge);
  background: var(--annotator-canvas);
  color: var(--annotator-ink);
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.45;
  outline: none;
  font-family: inherit;
}
.annotator-composer:focus {
  border-color: var(--annotator-accent-edge);
  box-shadow: 0 0 0 1px var(--annotator-accent-edge);
}
.annotator-note__actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.annotator-empty {
  border: 1px dashed var(--annotator-edge);
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--annotator-ink-faint);
  font-size: 12px;
  line-height: 1.55;
}
.annotator-empty__chip {
  align-self: flex-start;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  padding: 3px 8px;
  border: 1px solid var(--annotator-edge);
  border-radius: 999px;
  color: var(--annotator-ink-faint);
}
.annotator-empty__small {
  font-size: 11px;
  opacity: 0.8;
  margin: 0;
}
.annotator-empty p { margin: 0; }
.annotator-empty strong { color: var(--annotator-ink); font-weight: 600; }
.annotator-root .pip {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--annotator-edge);
  color: var(--annotator-ink-faint);
  background: transparent;
  white-space: nowrap;
}
.annotator-root .pip--ephemeral {
  color: var(--annotator-accent);
  border-color: var(--annotator-accent-edge);
  background: var(--annotator-accent-bg);
}
.annotator-root .pip--pinned {
  color: var(--annotator-pin);
  border-color: var(--annotator-pin-edge);
  background: var(--annotator-pin-bg);
}
.annotator-root .btn {
  font-family: inherit;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--annotator-edge);
  background: var(--annotator-surface);
  color: var(--annotator-ink);
  cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease;
}
.annotator-root .btn:hover {
  border-color: var(--annotator-accent-edge);
}
.annotator-root .btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.annotator-root .btn--primary {
  background: var(--annotator-accent-bg);
  color: var(--annotator-accent);
  border-color: var(--annotator-accent-edge);
}
.annotator-root .btn--ghost {
  background: transparent;
  color: var(--annotator-ink-faint);
}
.annotator-root .btn--ghost.is-on {
  color: var(--annotator-pin);
  border-color: var(--annotator-pin-edge);
  background: var(--annotator-pin-bg);
}
.annotator-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
}
.annotator-modal__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(4px);
}
.annotator-modal__card {
  position: relative;
  z-index: 1;
  width: min(640px, 100%);
  max-height: min(80vh, 720px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  border: 1px solid var(--annotator-edge);
  background: var(--annotator-canvas);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.4);
}
.annotator-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.annotator-modal__header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 4px 0 0;
  color: var(--annotator-ink);
}
.annotator-modal__lede {
  font-size: 12px;
  line-height: 1.55;
  color: var(--annotator-ink-faint);
  margin: 0;
}
.annotator-modal__lede em {
  color: var(--annotator-ink);
  font-style: normal;
}
.annotator-modal__payload {
  flex: 1;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.6;
  background: var(--annotator-canvas-alt);
  border: 1px solid var(--annotator-edge);
  border-radius: 8px;
  padding: 12px 14px;
  color: var(--annotator-ink);
  margin: 0;
  white-space: pre-wrap;
}
.annotator-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.annotator-modal__target {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.annotator-modal__target select {
  font: inherit;
  font-size: 12px;
  color: var(--annotator-ink);
  background: var(--annotator-canvas-alt);
  border: 1px solid var(--annotator-edge);
  border-radius: 6px;
  padding: 6px 8px;
}
`;

// Re-export kind type for consumers building their own decorator
export type {
  AnnotationBlockKind,
  AnnotationDecorator,
  MdNode,
};
