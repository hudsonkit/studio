/**
 * Right rail — selection + quick agent chat.
 *
 * No preemptive region catalog. Click on the card (or keep page-level),
 * then talk about that selection with context attached.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFlowState } from "../FlowState";
import { formatSelectionBrief, pageEmbedSlug } from "../inspect";
import { useFlowEmbeds } from "../embedSurfaces";
import { useFlowRuntime } from "../FlowRuntime";

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  at: number;
};

const REF_KEY = "studio.flows.discuss.ref";

function loadRef(): string | null {
  try {
    return sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

function saveRef(ref: string | null) {
  try {
    if (ref) sessionStorage.setItem(REF_KEY, ref);
    else sessionStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

export function FlowInspector() {
  const embeds = useFlowEmbeds();
  const { discuss } = useFlowRuntime();
  const {
    pageId,
    payload,
    view,
    selection,
    setSelection,
    inspectMode,
    setInspectMode,
    focusPage,
  } = useFlowState();

  const page = payload?.pages.find((p) => p.id === pageId) ?? null;
  const embedSlug = pageEmbedSlug(page);
  const isEmbed = page?.root.type === "Embed";

  const brief = useMemo(
    () =>
      formatSelectionBrief({
        mapName: view.mapName,
        page,
        selection:
          selection ?? (pageId ? { kind: "page", pageId } : null),
        embeds,
      }),
    [view.mapName, page, selection, pageId, embeds],
  );

  const [includeContext, setIncludeContext] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [threadRef, setThreadRef] = useState<string | null>(() => loadRef());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset chat when map selection identity changes (new page/region/node)
  const selectionKey = useMemo(() => {
    if (!selection) return pageId ?? "";
    if (selection.kind === "page") return `page:${selection.pageId}`;
    if (selection.kind === "region")
      return `region:${selection.pageId}:${selection.regionId}`;
    return `node:${selection.pageId}:${selection.nodeId}`;
  }, [selection, pageId]);

  const prevKey = useRef(selectionKey);
  useEffect(() => {
    if (prevKey.current !== selectionKey) {
      prevKey.current = selectionKey;
      // Keep thread; only clear if jumping to a totally different page
      // User can still clear thread manually.
    }
  }, [selectionKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const selectionTitle = useMemo(() => {
    if (!page) return null;
    if (!selection || selection.kind === "page") {
      return [page.journeyName, page.name].filter(Boolean).join(" · ");
    }
    if (selection.kind === "region") return selection.label;
    return `${selection.type}`;
  }, [page, selection]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    const userMsg: ChatMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      text,
      at: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const res = await fetch("/api/discuss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: brief,
          includeContext,
          ref: threadRef,
          projectName: discuss?.projectName,
          projectRoot: discuss?.projectRoot,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        ref?: string;
        error?: string;
        projectName?: string;
      };
      if (data.ref) {
        setThreadRef(data.ref);
        saveRef(data.ref);
      }
      setMessages((m) => [
        ...m,
        {
          id: `a_${Date.now()}`,
          role: data.ok ? "assistant" : "system",
          text: data.ok
            ? (data.reply ?? "(empty reply)")
            : data.error ?? `discuss failed (${res.status})`,
          at: Date.now(),
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `e_${Date.now()}`,
          role: "system",
          text: e instanceof Error ? e.message : "network error",
          at: Date.now(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }, [draft, busy, brief, includeContext, threadRef, discuss]);

  const clearThread = () => {
    setMessages([]);
    setThreadRef(null);
    saveRef(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col font-mono text-[11px]">
      {/* Header */}
      <div className="flow-section-head justify-between shrink-0">
        <span className="flex items-center gap-2">
          Discuss
          {discuss?.projectName ? (
            <span className="font-normal normal-case tracking-normal text-muted-foreground">
              · {discuss.projectName}
            </span>
          ) : null}
        </span>
        <label className="flex items-center gap-1.5 font-normal normal-case tracking-normal text-muted-foreground">
          <input
            type="checkbox"
            checked={inspectMode}
            onChange={(e) => setInspectMode(e.target.checked)}
            className="accent-[oklch(var(--accent))]"
          />
          <span className="text-[10px]">Pick</span>
        </label>
      </div>

      {/* Compact page + selection */}
      <div className="shrink-0 border-b border-border/60 px-3 py-2.5 space-y-1.5">
        {!page ? (
          <p className="text-muted-foreground normal-case tracking-normal">
            Select a page on the map.
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium tracking-tight text-foreground normal-case">
                  {selectionTitle}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground normal-case tracking-normal">
                  {[page.journeyName, page.name].filter(Boolean).join(" · ")}
                  {selection?.kind === "region"
                    ? ` · ${selection.regionId}`
                    : selection?.kind === "node"
                      ? ` · ${selection.nodeId}`
                      : " · page"}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded border border-border/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => focusPage(page.id)}
                title="Focus page on map"
              >
                Focus
              </button>
            </div>

            {selection?.kind === "region" && selection.note ? (
              <p className="text-[10px] leading-relaxed text-muted-foreground normal-case tracking-normal">
                {selection.note}
              </p>
            ) : null}
            {selection?.kind === "region" && selection.text ? (
              <p className="max-h-16 overflow-y-auto rounded border border-border/50 bg-muted/25 px-2 py-1.5 text-[10px] leading-relaxed text-foreground/90 normal-case tracking-normal">
                {selection.text}
              </p>
            ) : null}
            {(!selection || selection.kind === "page") && (
              <p className="text-[10px] text-muted-foreground normal-case tracking-normal">
                {inspectMode
                  ? isEmbed
                    ? "Click a region on the card to narrow the discuss target."
                    : "Entire page selected."
                  : "Turn Pick on, then click a region on the card."}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground normal-case tracking-normal">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  className="accent-[oklch(var(--accent))]"
                />
                Include selection context
              </label>
              <button
                type="button"
                className="text-[10px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground normal-case tracking-normal"
                onClick={() => setContextOpen((o) => !o)}
              >
                {contextOpen ? "Hide context" : "Show context"}
              </button>
              {selection && selection.kind !== "page" ? (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground normal-case tracking-normal"
                  onClick={() =>
                    setSelection({ kind: "page", pageId: page.id })
                  }
                >
                  Clear to page
                </button>
              ) : null}
            </div>

            {contextOpen ? (
              <pre className="mt-1 max-h-28 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[9px] leading-relaxed text-foreground/85 whitespace-pre-wrap normal-case tracking-normal">
                {brief}
              </pre>
            ) : null}

            {embedSlug ? (
              <p className="font-mono text-[9px] text-muted-foreground/70">
                surface · {embedSlug}
              </p>
            ) : null}
          </>
        )}
      </div>

      {/* Chat thread */}
      <div className="min-h-0 flex-1 overflow-y-auto frame-scrollbar px-3 py-2 space-y-2">
        {messages.length === 0 ? (
          <p className="py-4 text-center text-[10px] leading-relaxed text-muted-foreground normal-case tracking-normal">
            Quick feedback on the selection.
            <br />
            Context is attached when the box above is checked.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-md px-2.5 py-2 text-[11px] leading-relaxed normal-case tracking-normal ${
                m.role === "user"
                  ? "ml-4 bg-foreground/90 text-background"
                  : m.role === "system"
                    ? "border border-warning/40 bg-warning/10 text-warning"
                    : "mr-2 border border-border/60 bg-muted/30 text-foreground"
              }`}
            >
              {m.text}
            </div>
          ))
        )}
        {busy ? (
          <p className="text-[10px] text-muted-foreground normal-case tracking-normal">
            Asking agent…
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border/60 p-2 space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          disabled={!page || busy}
          placeholder={
            page
              ? selection?.kind === "region"
                ? `Feedback on “${selection.label}”…`
                : "Quick note or question…"
              : "Select a page first"
          }
          className="w-full resize-none rounded border border-border/70 bg-background px-2.5 py-2 font-sans text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clearThread}
            disabled={messages.length === 0 && !threadRef}
            className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Clear thread
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={!page || busy || !draft.trim()}
            className="rounded bg-foreground px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-background disabled:opacity-40"
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
