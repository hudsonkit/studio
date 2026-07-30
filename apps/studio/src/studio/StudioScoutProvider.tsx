"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpRight, MessageSquareText, Plus, Quote, RefreshCw, Trash2, X } from "lucide-react";
import { useStudioRouter } from "studio/router";
import {
  loadStudioScoutAgents,
  loadStudioScoutConnection,
  studioScoutComposerUrl,
  type StudioScoutAgentOption,
  type StudioScoutConnection,
  type StudioScoutContextItem,
} from "studio/scout";
import { registry } from "@/studio/studioRegistry";

type StudioScoutContextValue = {
  connection: StudioScoutConnection | null;
  loading: boolean;
  open: boolean;
  openScout: () => void;
  closeScout: () => void;
  refreshConnection: () => Promise<void>;
  /** Registered dispatch targets from the manifest, resolved against Scout. */
  agents: StudioScoutAgentOption[];
  /** The target the drawer addresses. Null until the agents list loads. */
  target: StudioScoutAgentOption | null;
  selectTarget: (selector: string) => void;
};

const StudioScoutContext = createContext<StudioScoutContextValue | null>(null);

export function StudioScoutProvider({ children }: { children: ReactNode }) {
  const pathname = useStudioRouter().usePathname();
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState<StudioScoutConnection | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [pageTitle, setPageTitle] = useState("Studio");
  const [pageUrl, setPageUrl] = useState("");
  const [appliedContext, setAppliedContext] = useState<StudioScoutContextItem[]>([]);
  const [agents, setAgents] = useState<StudioScoutAgentOption[]>([]);
  const [targetSelector, setTargetSelector] = useState<string | null>(null);

  const refreshConnection = useCallback(async () => {
    setLoading(true);
    try {
      setConnection(await loadStudioScoutConnection());
    } catch (error) {
      setConnection({
        configured: false,
        connected: false,
        studio: { id: "studio", label: "Studio" },
        identity: null,
        webBaseUrl: null,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConnection();
  }, [refreshConnection]);

  useEffect(() => {
    let cancelled = false;
    loadStudioScoutAgents()
      .then((response) => {
        if (!cancelled) setAgents(response.agents);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPageTitle(registry.pageForPath(pathname ?? "")?.label ?? document.title ?? "Studio");
    setPageUrl(window.location.href);
  }, [pathname]);

  useEffect(() => {
    const rememberSelection = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      const next = window.getSelection()?.toString().trim() ?? "";
      if (next) setSelection(next.slice(0, 1_200));
    };
    document.addEventListener("selectionchange", rememberSelection);
    return () => document.removeEventListener("selectionchange", rememberSelection);
  }, []);

  const draftContext = useMemo<StudioScoutContextItem[]>(() => {
    const items: StudioScoutContextItem[] = [
      { label: "Page", value: pageTitle },
      { label: "URL", value: pageUrl },
    ];
    if (selection) items.push({ label: "Selection", value: selection });
    notes.forEach((note, index) => items.push({ label: `Note ${index + 1}`, value: note }));
    return items.filter((item) => item.value);
  }, [notes, pageTitle, pageUrl, selection]);

  const contextChanged = JSON.stringify(draftContext) !== JSON.stringify(appliedContext);

  const openScout = useCallback(() => {
    setAppliedContext(draftContext);
    setOpen(true);
  }, [draftContext]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const target = useMemo<StudioScoutAgentOption | null>(() => {
    if (agents.length === 0) return null;
    return agents.find((option) => option.selector === targetSelector) ?? agents[0];
  }, [agents, targetSelector]);

  const selectTarget = useCallback((selector: string) => {
    setTargetSelector(selector);
  }, []);

  const embedUrl = useMemo(() => {
    if (!connection?.connected || !connection.webBaseUrl) return null;
    return studioScoutComposerUrl(connection.webBaseUrl, {
      agentId: target?.agent?.id ?? connection.identity?.agent?.id,
      context: appliedContext,
    }).toString();
  }, [appliedContext, connection, target]);

  const value = useMemo<StudioScoutContextValue>(() => ({
    connection,
    loading,
    open,
    openScout,
    closeScout: () => setOpen(false),
    refreshConnection,
    agents,
    target,
    selectTarget,
  }), [agents, connection, loading, open, openScout, refreshConnection, selectTarget, target]);

  function addNote() {
    const note = noteDraft.trim();
    if (!note || notes.length >= 8) return;
    setNotes((current) => [...current, note.slice(0, 2_000)]);
    setNoteDraft("");
  }

  return (
    <StudioScoutContext.Provider value={value}>
      {children}
      {open ? (
        <div className="fixed inset-0 z-[90] bg-black/35 backdrop-blur-[2px]" role="presentation" onMouseDown={() => setOpen(false)}>
          <aside
            className="absolute inset-y-0 right-0 grid w-full max-w-[920px] grid-rows-[auto_minmax(0,1fr)] border-l border-studio-rule-strong bg-studio-canvas shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Message Scout with Studio context"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-studio-rule px-4 py-3 sm:px-5">
              <div className="flex items-center gap-3">
                <MessageSquareText size={15} />
                <div>
                  <div className="text-[13px] font-medium text-studio-ink-strong">Scout</div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.16em] text-studio-ink-faint">native composer / studio context</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {agents.length >= 2 && target ? (
                  <label className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.14em] text-studio-ink-faint">
                    to
                    <select
                      value={target.selector}
                      onChange={(event) => selectTarget(event.target.value)}
                      aria-label="Dispatch target agent"
                      className="border border-studio-rule bg-studio-surface px-2 py-1.5 font-mono text-[10px] normal-case tracking-normal text-studio-ink-strong outline-none focus:border-studio-rule-strong"
                    >
                      {agents.map((option) => (
                        <option key={option.selector} value={option.selector}>
                          {option.label}
                          {option.online === false ? " (offline)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {connection?.webBaseUrl ? (
                  <a href={connection.webBaseUrl} target="_blank" rel="noreferrer" className="p-2 text-studio-ink-faint hover:text-studio-ink-strong" aria-label="Open Scout">
                    <ArrowUpRight size={14} />
                  </a>
                ) : null}
                <button type="button" onClick={() => setOpen(false)} className="p-2 text-studio-ink-faint hover:text-studio-ink-strong" aria-label="Close Scout drawer">
                  <X size={15} />
                </button>
              </div>
            </header>

            <div className="grid min-h-0 md:grid-cols-[260px_minmax(0,1fr)]">
              <section className="overflow-y-auto border-b border-studio-rule bg-studio-canvas-alt p-4 md:border-b-0 md:border-r">
                <div className="font-mono text-[9px] uppercase tracking-eyebrow text-studio-ink-faint">Attached context</div>
                <div className="mt-3 grid gap-2">
                  {draftContext.map((item, index) => {
                    const noteIndex = item.label.startsWith("Note ")
                      ? Number.parseInt(item.label.slice(5), 10) - 1
                      : -1;
                    return (
                      <div key={`${item.label}:${index}`} className="border border-studio-rule bg-studio-surface px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[8px] uppercase tracking-[0.13em] text-studio-ink-faint">{item.label}</span>
                          {item.label === "Selection" || noteIndex >= 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (item.label === "Selection") setSelection("");
                                else setNotes((current) => current.filter((_, candidate) => candidate !== noteIndex));
                              }}
                              className="text-studio-ink-faint hover:text-studio-ink-strong"
                              aria-label={item.label === "Selection" ? "Remove selected text" : `Remove ${item.label.toLowerCase()}`}
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-all text-[11px] leading-relaxed text-studio-ink">{item.value}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-studio-rule pt-4">
                  <label htmlFor="scout-context-note" className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.13em] text-studio-ink-faint">
                    <Quote size={10} /> Add a note
                  </label>
                  <textarea
                    id="scout-context-note"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        addNote();
                      }
                    }}
                    rows={3}
                    maxLength={2_000}
                    placeholder="Decision, constraint, or question…"
                    className="mt-2 w-full resize-none border border-studio-rule bg-studio-surface px-3 py-2 text-[11px] leading-relaxed text-studio-ink-strong outline-none focus:border-studio-rule-strong"
                  />
                  <button type="button" onClick={addNote} disabled={!noteDraft.trim() || notes.length >= 8} className="mt-2 inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.13em] text-studio-ink-faint hover:text-studio-ink-strong disabled:opacity-35">
                    <Plus size={10} /> Add note
                  </button>
                </div>

                {contextChanged ? (
                  <button type="button" onClick={() => setAppliedContext(draftContext)} className="mt-5 flex w-full items-center justify-center gap-2 border border-studio-ink-strong px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-studio-ink-strong">
                    <RefreshCw size={10} /> Update Scout context
                  </button>
                ) : null}
              </section>

              <section className="min-h-0 bg-studio-surface">
                {loading ? (
                  <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.16em] text-studio-ink-faint">Connecting to Scout…</div>
                ) : embedUrl ? (
                  <iframe
                    key={embedUrl}
                    src={embedUrl}
                    title="Scout message composer"
                    className="h-full min-h-[520px] w-full border-0"
                    allow="clipboard-read; clipboard-write"
                  />
                ) : (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 text-center">
                    <p className="text-[14px] font-medium text-studio-ink-strong">Scout is unavailable</p>
                    <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-studio-ink-faint">{connection?.error ?? "Start the Scout web service, then refresh the connection."}</p>
                    <button type="button" onClick={() => void refreshConnection()} className="mt-4 border border-studio-rule px-3 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-studio-ink-faint hover:text-studio-ink-strong">Retry</button>
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </StudioScoutContext.Provider>
  );
}

export function useStudioScout(): StudioScoutContextValue {
  const value = useContext(StudioScoutContext);
  if (!value) throw new Error("useStudioScout must be used inside StudioScoutProvider.");
  return value;
}
