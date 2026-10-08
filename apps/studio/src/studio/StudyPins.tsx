"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, X } from "lucide-react";
import { useAgentPage, useReviewerName, type FeedbackClient, type FeedbackThread } from "studio/feedback";
import { feedbackClient } from "@/studio/agentPages";

/**
 * Artifact comment threads pinned on the local study.
 *
 * `artifact_import_comments` keeps each thread's anchor: the CSS selector the
 * artifact recorded (rooted at the artifact's `#root`) and its location label.
 * The study renders here as the first child of the wrapper, the same way it
 * renders under `#root` in the artifact, so the selector resolves against the
 * wrapper. The label (`button "Follow a thought"`) is the fallback when the
 * structure has moved.
 *
 * Off when no host daemon is configured (the static site), so it never polls.
 */
export function StudyPins({ slug, children }: { slug: string; children: ReactNode }) {
  if (!feedbackClient.studioId) return <>{children}</>;
  return <PinnedStudy client={feedbackClient} slug={slug}>{children}</PinnedStudy>;
}

interface ArtifactAnchor {
  kind: "artifact-element";
  selector?: string;
  location?: string;
}

interface Placed {
  thread: FeedbackThread;
  n: number;
  box?: { top: number; left: number; width: number; height: number };
}

// Pins arrive while you watch; a fresh one pulses for this long.
const FRESH_MS = 8_000;

function isArtifactAnchor(anchor: unknown): anchor is ArtifactAnchor {
  return Boolean(anchor) && (anchor as ArtifactAnchor).kind === "artifact-element";
}

function findAnchor(root: HTMLElement, anchor: ArtifactAnchor): Element | null {
  const selector = anchor.selector?.replace(/^#root\s*>\s*/, "");
  if (selector) {
    try {
      const element = root.querySelector(`:scope > ${selector}`);
      if (element) return element;
    } catch {
      // Not a selector this browser accepts; try the label.
    }
  }
  const label = anchor.location?.match(/([a-z][a-z0-9-]*) "([^"]+)"\s*$/i);
  if (!label) return null;
  const text = label[2].toLowerCase();
  for (const element of root.querySelectorAll(label[1])) {
    if (element.textContent?.trim().toLowerCase().includes(text)) return element;
  }
  return null;
}

function PinnedStudy({ client, slug, children }: { client: FeedbackClient; slug: string; children: ReactNode }) {
  const state = useAgentPage(client, slug);
  const rootRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [openId, setOpenId] = useState<string>();
  const [hoverId, setHoverId] = useState<string>();

  const threads = (state.detail?.threads ?? []).filter(
    (thread) => isArtifactAnchor(thread.anchor) && thread.status !== "resolved",
  );
  const key = threads.map((thread) => `${thread.id}:${thread.replies.length}`).join(",");

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    setPlaced(threads.map((thread, index) => {
      const element = findAnchor(root, thread.anchor as ArtifactAnchor);
      if (!element) return { thread, n: index + 1 };
      const rect = element.getBoundingClientRect();
      return {
        thread,
        n: index + 1,
        box: { top: rect.top - origin.top, left: rect.left - origin.left, width: rect.width, height: rect.height },
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    window.addEventListener("resize", measure);
    // Studies animate and swap states; a slow re-measure keeps pins on their element.
    const timer = setInterval(measure, 1_000);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearInterval(timer);
    };
  }, [measure]);

  useEffect(() => {
    if (openId && !threads.some((thread) => thread.id === openId)) setOpenId(undefined);
  }, [key, openId, threads]);

  const width = rootRef.current?.clientWidth ?? 0;

  return (
    <div ref={rootRef} className="relative">
      {children}
      {placed.map(({ thread, n, box }) => {
        if (!box) return null;
        const open = openId === thread.id;
        const lit = open || hoverId === thread.id;
        const fresh = Date.now() - Date.parse(thread.createdAt) < FRESH_MS;
        const pinLeft = box.left + box.width - 6;
        const pinTop = box.top - 18;
        const cardLeft = Math.max(8, Math.min(box.left - 4, width - 348));
        return (
          <div key={thread.id}>
            <div
              aria-hidden
              className={`pointer-events-none absolute rounded-[3px] ring-2 ring-amber-400 transition-opacity duration-200 ${lit ? "opacity-100" : "opacity-0"}`}
              style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
            />
            <button
              type="button"
              aria-label={`Artifact comment ${n}: ${thread.body ?? ""}`}
              aria-expanded={open}
              onClick={() => setOpenId(open ? undefined : thread.id)}
              onMouseEnter={() => setHoverId(thread.id)}
              onMouseLeave={() => setHoverId(undefined)}
              className="absolute z-20 grid size-7 place-items-center rounded-full rounded-bl-none bg-amber-400 font-mono text-[11px] font-semibold text-[#1c1a17] shadow-[0_4px_14px_rgba(0,0,0,0.35)] transition hover:scale-110"
              style={{ top: pinTop, left: pinLeft }}
            >
              {fresh ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full rounded-bl-none bg-amber-400/70" /> : null}
              <span className="relative">{n}</span>
            </button>
            {open ? (
              <ThreadCard
                client={client}
                slug={slug}
                thread={thread}
                style={{ top: box.top + box.height + 12, left: cardLeft }}
                onClose={() => setOpenId(undefined)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const smallCaps = "font-mono text-[9px] uppercase tracking-[0.14em]";

// Artifact comments can be imported after Studio replies that came later; order by when each was written.
function writtenAt(message: FeedbackThread) {
  return Date.parse(message.source?.at ?? message.createdAt);
}

function flatten(thread: FeedbackThread): FeedbackThread[] {
  const replies = (reply: FeedbackThread): FeedbackThread[] => [reply, ...reply.replies.flatMap(replies)];
  const rest = thread.replies.flatMap(replies).sort((a, b) => writtenAt(a) - writtenAt(b) || a.seq - b.seq);
  return [thread, ...rest];
}

function ThreadCard({
  client,
  slug,
  thread,
  style,
  onClose,
}: {
  client: FeedbackClient;
  slug: string;
  thread: FeedbackThread;
  style: { top: number; left: number };
  onClose: () => void;
}) {
  const [reviewer, setReviewer] = useReviewerName();
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const anchor = thread.anchor as ArtifactAnchor;
  const messages = flatten(thread);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await task();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Artifact comment thread"
      className="absolute z-30 w-[340px] rounded-md border border-studio-rule-strong bg-studio-canvas/95 text-studio-ink shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur"
      style={style}
    >
      <div className="flex items-start justify-between gap-3 border-b border-studio-rule px-3.5 py-2.5">
        <div className="min-w-0">
          <div className={`${smallCaps} text-amber-400`}>From the Claude artifact</div>
          {anchor.location ? (
            <div className="mt-1 truncate text-[11px] text-studio-ink-faint" title={anchor.location}>
              {anchor.location.split("›").pop()?.trim()}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {thread.source?.url ? (
            <a
              href={thread.source.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the artifact"
              className="grid size-6 place-items-center rounded text-studio-ink-faint hover:bg-studio-chip-bg hover:text-studio-ink-strong"
            >
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-studio-ink-faint hover:bg-studio-chip-bg hover:text-studio-ink-strong"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      <ol className="flex max-h-[280px] flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {messages.map((message) => (
          <li key={message.id}>
            <div className="flex items-baseline gap-2">
              <span className="text-[12px] font-medium text-studio-ink-strong">{message.author.name}</span>
              <span className={`${smallCaps} text-studio-ink-faint`}>
                {message.source ? "on the artifact" : message.author.role === "agent" ? "agent" : "in Studio"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug">{message.body}</p>
          </li>
        ))}
      </ol>

      <div className="border-t border-studio-rule px-3.5 py-3">
        {reviewer ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              const ok = await run(() => client.postFeedback(slug, { kind: "comment", body: draft.trim(), parentId: thread.id }, reviewer));
              if (ok) setDraft("");
            }}
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Reply. It goes back to the artifact thread."
              rows={2}
              className="w-full resize-none rounded border border-studio-rule bg-studio-surface px-2.5 py-2 text-[13px] text-studio-ink-strong outline-none placeholder:text-studio-ink-faint focus:border-studio-rule-strong"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => client.setResolved(slug, thread.id, true, reviewer))}
                className={`${smallCaps} text-studio-ink-faint hover:text-studio-ink-strong disabled:opacity-40`}
              >
                Resolve
              </button>
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className={`rounded bg-studio-ink-strong px-3 py-1.5 ${smallCaps} text-studio-canvas transition hover:opacity-85 disabled:opacity-40`}
              >
                Reply
              </button>
            </div>
          </form>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) setReviewer(name);
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name, to reply"
              autoComplete="name"
              className="min-w-0 flex-1 rounded border border-studio-rule bg-studio-surface px-2.5 py-1.5 text-[13px] text-studio-ink-strong outline-none placeholder:text-studio-ink-faint"
            />
            <button type="submit" className={`rounded bg-studio-ink-strong px-3 py-1.5 ${smallCaps} text-studio-canvas`}>
              Save
            </button>
          </form>
        )}
        {error ? <p className="mt-2 text-[12px] text-amber-400">{error}</p> : null}
      </div>
    </div>
  );
}
