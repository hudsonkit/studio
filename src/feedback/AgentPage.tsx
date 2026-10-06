"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { EngMarkdown } from "../doc";
import type { FeedbackClient } from "./client";
import { useAgentPage, useReviewerName } from "./store";
import type {
  AgentFormField,
  AgentPageDetail,
  AgentPageWidget,
  FeedbackThread,
  ReviewerFeedbackInput,
} from "./types";

export interface AgentPageProps {
  client: FeedbackClient;
  slug: string;
  /** Render the markdown body yourself, e.g. with an annotatable renderer. */
  renderBody?: (body: string) => ReactNode;
  className?: string;
}

const eyebrow = "font-mono text-[10px] uppercase tracking-eyebrow text-studio-ink-faint";
const smallCaps = "font-mono text-[9px] uppercase tracking-[0.14em]";
const inputClass =
  "w-full border border-studio-rule bg-studio-canvas px-3 py-2 text-[13px] text-studio-ink-strong outline-none transition placeholder:text-studio-ink-faint focus:border-studio-rule-strong";
const primaryButton =
  `inline-flex items-center gap-2 border border-studio-ink-strong bg-studio-ink-strong px-3 py-1.5 ${smallCaps} text-studio-canvas transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40`;
const quietButton =
  `${smallCaps} text-studio-ink-faint transition hover:text-studio-ink-strong disabled:opacity-40`;

/**
 * A page an agent published through the Studio MCP: its markdown body, the
 * feedback widgets it asked for, and any questions it is waiting on. Feedback
 * posted here reaches the agent's `wait_for_feedback` call.
 */
export function AgentPage({ client, slug, renderBody, className }: AgentPageProps) {
  const state = useAgentPage(client, slug);

  if (!state.detail) {
    return (
      <main className={className ?? "w-full px-6 py-10 lg:px-7"}>
        <div className={eyebrow}>Agent page</div>
        <p className="mt-4 text-[14px] text-studio-ink">
          {state.status === "error" ? state.error : "Loading…"}
        </p>
      </main>
    );
  }

  const { page, threads } = state.detail;
  const questions = threads.filter((thread) => thread.kind === "question");

  return (
    <main className={className ?? "w-full px-6 py-10 lg:px-7"}>
      <header className="max-w-[980px] border-b border-studio-rule pb-7">
        <div className={eyebrow}>
          Agent page
          {page.owner?.name ? ` · ${page.owner.name}` : ""}
          {page.owner?.client && page.owner.client !== page.owner.name ? ` via ${page.owner.client}` : ""}
          {` · rev ${page.revision} · ${page.status}`}
        </div>
        <h1 className="mt-4 text-[38px] font-light leading-tight text-studio-ink-strong">{page.title}</h1>
        {page.blurb ? (
          <p
            className="mt-4 max-w-[66ch] text-[15px] leading-[1.7] text-studio-ink"
            style={{ fontFamily: "var(--studio-font-prose)", fontWeight: "var(--studio-font-prose-weight)" }}
          >
            {page.blurb}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className={`mt-4 ${smallCaps} text-studio-ink-faint`}>Offline · {state.error}</p>
        ) : null}
      </header>

      <div className="grid max-w-[1180px] gap-10 py-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 max-w-[900px]">
          {questions.length > 0 ? (
            <div className="mb-8 flex flex-col gap-3">
              {questions.map((question) => (
                <QuestionCard key={question.id} client={client} slug={slug} question={question} />
              ))}
            </div>
          ) : null}
          {page.body.trim()
            ? (renderBody ? renderBody(page.body) : <EngMarkdown body={page.body} />)
            : <p className="text-[14px] text-studio-ink-faint">This page has no body yet.</p>}
        </section>

        <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-6 xl:self-start">
          <ReviewerIdentity />
          {page.widgets.map((widget) => (
            <Widget key={widget.id} client={client} slug={slug} widget={widget} detail={state.detail!} />
          ))}
        </aside>
      </div>
    </main>
  );
}

function Widget({
  client,
  slug,
  widget,
  detail,
}: {
  client: FeedbackClient;
  slug: string;
  widget: AgentPageWidget;
  detail: AgentPageDetail;
}) {
  if (widget.kind === "comments") return <CommentsWidget client={client} slug={slug} threads={detail.threads} />;
  if (widget.kind === "chat") return <ChatWidget client={client} slug={slug} threads={detail.threads} />;
  return <FormWidget client={client} slug={slug} widget={widget} threads={detail.threads} />;
}

/** Posts as the remembered reviewer and tracks the in-flight state. */
function usePost(client: FeedbackClient, slug: string) {
  const [reviewer] = useReviewerName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function post(input: ReviewerFeedbackInput): Promise<boolean> {
    if (!reviewer) {
      setError("Add your name above first.");
      return false;
    }
    setBusy(true);
    setError(undefined);
    try {
      await client.postFeedback(slug, input, reviewer);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function resolve(feedbackId: string, resolved: boolean) {
    if (!reviewer) return setError("Add your name above first.");
    try {
      await client.setResolved(slug, feedbackId, resolved, reviewer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }
  return { reviewer, busy, error, post, resolve };
}

function ReviewerIdentity() {
  const [reviewer, setReviewer] = useReviewerName();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (reviewer && !editing) {
    return (
      <div className={`flex items-center justify-between border-b border-studio-rule pb-3 ${smallCaps} text-studio-ink-faint`}>
        <span>
          Reviewing as <span className="text-studio-ink-strong">{reviewer}</span>
        </span>
        <button type="button" className={quietButton} onClick={() => { setDraft(reviewer); setEditing(true); }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 border border-studio-rule bg-studio-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim()) return;
        setReviewer(draft);
        setEditing(false);
      }}
    >
      <label className={`${smallCaps} text-studio-ink-faint`} htmlFor="studio-reviewer-name">
        Your name, so the agent knows who is talking
      </label>
      <div className="flex gap-2">
        <input
          id="studio-reviewer-name"
          className={inputClass}
          value={draft}
          maxLength={80}
          autoComplete="name"
          placeholder="Name"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className={primaryButton} disabled={!draft.trim()}>Save</button>
      </div>
    </form>
  );
}

function Composer({
  placeholder,
  submitLabel,
  busy,
  onSubmit,
  autoFocus,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  busy: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim() || busy) return;
    if (await onSubmit(body)) setBody("");
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <textarea
        className={`${inputClass} min-h-[64px] resize-y leading-relaxed`}
        value={body}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
          if (event.key === "Escape") onCancel?.();
        }}
      />
      <div className="flex items-center justify-end gap-3">
        {onCancel ? <button type="button" className={quietButton} onClick={onCancel}>Cancel</button> : null}
        <button type="submit" className={primaryButton} disabled={busy || !body.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}

function WidgetFrame({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="border border-studio-rule bg-studio-surface">
      <div className="flex items-center justify-between border-b border-studio-rule px-4 py-2.5">
        <span className={`${smallCaps} font-medium text-studio-ink-faint`}>{title}</span>
        {meta ? <span className={`${smallCaps} text-studio-ink-faint`}>{meta}</span> : null}
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

function ErrorLine({ error }: { error?: string }) {
  return error ? <p role="alert" className="text-[12px] text-studio-ink">{error}</p> : null;
}

function CommentsWidget({ client, slug, threads }: { client: FeedbackClient; slug: string; threads: FeedbackThread[] }) {
  const { busy, error, post, resolve } = usePost(client, slug);
  const [showResolved, setShowResolved] = useState(false);
  const comments = threads.filter((thread) => thread.kind === "comment");
  const open = comments.filter((thread) => thread.status !== "resolved");
  const resolved = comments.filter((thread) => thread.status === "resolved");

  return (
    <WidgetFrame title="Comments" meta={`${open.length} open`}>
      <Composer
        placeholder="Leave a comment for the agent"
        submitLabel="Comment"
        busy={busy}
        onSubmit={(body) => post({ kind: "comment", body })}
      />
      <ErrorLine error={error} />
      {open.map((thread) => (
        <CommentThread key={thread.id} thread={thread} busy={busy} post={post} resolve={resolve} />
      ))}
      {resolved.length > 0 ? (
        <button type="button" className={`${quietButton} self-start`} onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? "Hide" : "Show"} {resolved.length} resolved
        </button>
      ) : null}
      {showResolved
        ? resolved.map((thread) => (
            <CommentThread key={thread.id} thread={thread} busy={busy} post={post} resolve={resolve} />
          ))
        : null}
    </WidgetFrame>
  );
}

function CommentThread({
  thread,
  busy,
  post,
  resolve,
}: {
  thread: FeedbackThread;
  busy: boolean;
  post: (input: ReviewerFeedbackInput) => Promise<boolean>;
  resolve: (feedbackId: string, resolved: boolean) => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);
  const isResolved = thread.status === "resolved";
  return (
    <article className={`border-t border-studio-rule pt-3 ${isResolved ? "opacity-60" : ""}`}>
      <Message item={thread} />
      {flatten(thread.replies).map((reply) => (
        <div key={reply.id} className="mt-3 border-l border-studio-rule pl-3">
          <Message item={reply} />
        </div>
      ))}
      <div className="mt-2 flex gap-4">
        {!isResolved ? (
          <button type="button" className={quietButton} onClick={() => setReplying(true)}>Reply</button>
        ) : null}
        <button type="button" className={quietButton} onClick={() => void resolve(thread.id, !isResolved)}>
          {isResolved ? "Reopen" : "Resolve"}
        </button>
      </div>
      {replying ? (
        <div className="mt-2">
          <Composer
            placeholder="Reply"
            submitLabel="Reply"
            busy={busy}
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const ok = await post({ kind: "comment", body, parentId: thread.id });
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      ) : null}
    </article>
  );
}

function ChatWidget({ client, slug, threads }: { client: FeedbackClient; slug: string; threads: FeedbackThread[] }) {
  const { reviewer, busy, error, post } = usePost(client, slug);
  const messages = flatten(threads.filter((thread) => thread.kind === "chat"));
  return (
    <WidgetFrame title="Chat" meta={messages.length ? `${messages.length} messages` : undefined}>
      {messages.length === 0 ? (
        <p className="text-[12px] text-studio-ink-faint">Say something to the agent working on this page.</p>
      ) : (
        <ol className="flex max-h-[420px] flex-col gap-3 overflow-y-auto">
          {messages.map((message) => {
            const mine = message.author.role === "reviewer" && message.author.name === reviewer;
            return (
              <li
                key={message.id}
                className={`max-w-[88%] border px-3 py-2 ${mine ? "self-end border-studio-rule-strong" : "self-start border-studio-rule bg-studio-canvas"}`}
              >
                <Message item={message} />
              </li>
            );
          })}
        </ol>
      )}
      <Composer placeholder="Message the agent" submitLabel="Send" busy={busy} onSubmit={(body) => post({ kind: "chat", body })} />
      <ErrorLine error={error} />
    </WidgetFrame>
  );
}

function FormWidget({
  client,
  slug,
  widget,
  threads,
}: {
  client: FeedbackClient;
  slug: string;
  widget: Extract<AgentPageWidget, { kind: "form" }>;
  threads: FeedbackThread[];
}) {
  const { busy, error, post } = usePost(client, slug);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const responses = threads.filter((thread) => thread.kind === "form_response" && thread.widgetId === widget.id);
  const missing = widget.fields.some((field) => field.required && (values[field.name] === undefined || values[field.name] === ""));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await post({ kind: "form_response", widgetId: widget.id, data: values, body: note.trim() || undefined });
    if (ok) {
      setValues({});
      setNote("");
    }
  }

  return (
    <WidgetFrame title={widget.title ?? "Form"} meta={responses.length ? `${responses.length} sent` : undefined}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {widget.fields.map((field) => (
          <FormField
            key={field.name}
            id={`${widget.id}-${field.name}`}
            field={field}
            value={values[field.name]}
            onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          />
        ))}
        <textarea
          className={`${inputClass} min-h-[48px] resize-y`}
          value={note}
          placeholder="Anything else? (optional)"
          aria-label="Additional note"
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit" className={`${primaryButton} self-end`} disabled={busy || missing}>Send</button>
      </form>
      <ErrorLine error={error} />
      {responses.map((response) => (
        <article key={response.id} className="border-t border-studio-rule pt-3">
          <Message item={response} />
          {flatten(response.replies).map((reply) => (
            <div key={reply.id} className="mt-3 border-l border-studio-rule pl-3"><Message item={reply} /></div>
          ))}
        </article>
      ))}
    </WidgetFrame>
  );
}

function FormField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: AgentFormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <span className={`${smallCaps} text-studio-ink-faint`}>
      {field.label}
      {field.required ? " *" : ""}
    </span>
  );

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[13px] text-studio-ink" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === "choice" || field.type === "rating") {
    const options = field.type === "choice"
      ? (field.options ?? []).map((option) => ({ value: option as unknown, label: option }))
      : Array.from({ length: field.max ?? 5 }, (_, index) => ({ value: index + 1 as unknown, label: String(index + 1) }));
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2">{label}</legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={value === option.value}
              className={`border px-2.5 py-1 text-[12px] transition ${value === option.value ? "border-studio-ink-strong bg-studio-ink-strong text-studio-canvas" : "border-studio-rule text-studio-ink hover:border-studio-rule-strong"}`}
              onClick={() => onChange(value === option.value ? undefined : option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <label className="flex flex-col gap-2" htmlFor={id}>
      {label}
      {field.type === "textarea" ? (
        <textarea
          id={id}
          className={`${inputClass} min-h-[72px] resize-y`}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

function QuestionCard({ client, slug, question }: { client: FeedbackClient; slug: string; question: FeedbackThread }) {
  const { busy, error, post } = usePost(client, slug);
  const answers = question.replies.filter((reply) => reply.kind === "answer");
  const choices = Array.isArray(question.data?.choices) ? (question.data.choices as string[]) : [];
  const answered = answers.length > 0;

  return (
    <section className={`border px-4 py-3 ${answered ? "border-studio-rule" : "border-studio-rule-strong bg-studio-surface"}`}>
      <div className={`${smallCaps} ${answered ? "text-studio-ink-faint" : "text-scout-accent"}`}>
        {question.author.name} {answered ? "asked" : "is asking"}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-studio-ink-strong">{question.body}</p>
      {answers.map((answer) => (
        <p key={answer.id} className="mt-2 text-[13px] text-studio-ink">
          <span className="text-studio-ink-strong">{answer.author.name}:</span>{" "}
          {typeof answer.data?.choice === "string" ? answer.data.choice : null}
          {answer.body ? `${typeof answer.data?.choice === "string" ? " — " : ""}${answer.body}` : null}
        </p>
      ))}
      {!answered ? (
        <div className="mt-3 flex flex-col gap-2">
          {choices.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  disabled={busy}
                  className="border border-studio-rule px-3 py-1.5 text-[13px] text-studio-ink transition hover:border-studio-ink-strong hover:text-studio-ink-strong disabled:opacity-40"
                  onClick={() => void post({ kind: "answer", parentId: question.id, choice })}
                >
                  {choice}
                </button>
              ))}
            </div>
          ) : null}
          <Composer
            placeholder={choices.length ? "Or answer in your own words" : "Your answer"}
            submitLabel="Answer"
            busy={busy}
            onSubmit={(body) => post({ kind: "answer", parentId: question.id, body })}
          />
          <ErrorLine error={error} />
        </div>
      ) : null}
    </section>
  );
}

function Message({ item }: { item: FeedbackThread }) {
  const agent = item.author.role === "agent";
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-medium text-studio-ink-strong">{item.author.name}</span>
        {agent ? <span className={`${smallCaps} text-scout-accent`}>agent</span> : null}
        <time className={`${smallCaps} text-studio-ink-faint`} dateTime={item.createdAt} title={item.createdAt}>
          {relativeTime(item.createdAt)}
        </time>
      </div>
      {item.data && item.kind === "form_response" ? (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[12px]">
          {Object.entries(item.data).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-mono text-studio-ink-faint">{key}</dt>
              <dd className="text-studio-ink">{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.body ? <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-studio-ink">{item.body}</p> : null}
    </div>
  );
}

/** Replies at any depth, oldest first, for flat rendering under a root. */
function flatten(items: FeedbackThread[]): FeedbackThread[] {
  const out: FeedbackThread[] = [];
  const visit = (list: FeedbackThread[]) => {
    for (const item of list) {
      out.push(item);
      visit(item.replies);
    }
  };
  visit(items);
  return out.sort((a, b) => a.seq - b.seq);
}

const relativeFormat = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : undefined;

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (!relativeFormat || Number.isNaN(seconds)) return iso;
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3_600) return relativeFormat.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3_600), "hour");
  return relativeFormat.format(Math.round(seconds / 86_400), "day");
}
