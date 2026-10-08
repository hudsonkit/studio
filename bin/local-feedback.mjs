import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Agent pages and the feedback left on them, stored in the repo they belong to:
 *
 *   .studio/pages/<slug>.json      page metadata and widgets
 *   .studio/pages/<slug>.md        page body
 *   .studio/feedback/<slug>.jsonl  append-only event log, one event per line
 *
 * The host daemon is the only writer, so sequence numbers and waiters are kept
 * in memory and rebuilt from disk on first use.
 */

export const PAGE_STATUSES = ["draft", "review", "done", "archived"];
export const FIELD_TYPES = ["text", "textarea", "choice", "rating", "boolean"];
export const REVIEWER_EVENT_KINDS = ["comment", "chat", "form_response", "answer"];
export const AGENT_EVENT_KINDS = ["reply", "chat", "question"];
export const AGENT_PAGE_HREF_PREFIX = "/studio/agents/";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY_CHARS = 200_000;
const MAX_TEXT_CHARS = 8_000;

export class FeedbackError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
}

function requireSlug(slug) {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new FeedbackError(400, `Invalid page slug "${slug}". Use lowercase letters, digits and dashes.`);
  }
  return slug;
}

function requireText(value, field, { max = MAX_TEXT_CHARS, optional = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw new FeedbackError(400, `${field} is required.`);
  }
  if (typeof value !== "string") throw new FeedbackError(400, `${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed && !optional) throw new FeedbackError(400, `${field} is required.`);
  if (trimmed.length > max) throw new FeedbackError(400, `${field} is longer than ${max} characters.`);
  return trimmed || undefined;
}

function normalizeField(field, index) {
  if (!field || typeof field !== "object") throw new FeedbackError(400, `fields[${index}] must be an object.`);
  const name = requireText(field.name, `fields[${index}].name`, { max: 64 });
  if (!/^[a-zA-Z][\w-]*$/.test(name)) {
    throw new FeedbackError(400, `fields[${index}].name must start with a letter and use letters, digits, _ or -.`);
  }
  const type = field.type ?? "text";
  if (!FIELD_TYPES.includes(type)) {
    throw new FeedbackError(400, `fields[${index}].type must be one of ${FIELD_TYPES.join(", ")}.`);
  }
  const normalized = {
    name,
    label: requireText(field.label, `fields[${index}].label`, { max: 200, optional: true }) ?? name,
    type,
    required: Boolean(field.required),
  };
  if (type === "choice") {
    if (!Array.isArray(field.options) || field.options.length < 2) {
      throw new FeedbackError(400, `fields[${index}] is a choice field and needs at least two options.`);
    }
    normalized.options = field.options.map((option, optionIndex) => requireText(
      option,
      `fields[${index}].options[${optionIndex}]`,
      { max: 200 },
    ));
  }
  if (type === "rating") normalized.max = Math.min(Math.max(Number(field.max) || 5, 2), 10);
  return normalized;
}

/** Validates the widget list an agent declares on a page. */
export function normalizeWidgets(widgets) {
  if (widgets === undefined) return [{ id: "comments", kind: "comments" }];
  if (!Array.isArray(widgets)) throw new FeedbackError(400, "widgets must be an array.");
  const ids = new Set();
  return widgets.map((widget, index) => {
    if (!widget || typeof widget !== "object") throw new FeedbackError(400, `widgets[${index}] must be an object.`);
    const kind = widget.kind;
    if (!["comments", "chat", "form"].includes(kind)) {
      throw new FeedbackError(400, `widgets[${index}].kind must be comments, chat or form.`);
    }
    const id = widget.id ? requireSlug(String(widget.id)) : kind === "form" ? `form-${index + 1}` : kind;
    if (ids.has(id)) throw new FeedbackError(400, `Duplicate widget id "${id}".`);
    ids.add(id);
    if (kind !== "form") return { id, kind };
    if (!Array.isArray(widget.fields) || widget.fields.length === 0) {
      throw new FeedbackError(400, `widgets[${index}] is a form and needs at least one field.`);
    }
    return {
      id,
      kind,
      title: requireText(widget.title, `widgets[${index}].title`, { max: 200, optional: true }),
      fields: widget.fields.map(normalizeField),
    };
  });
}

function normalizeAuthor(author, role) {
  const name = requireText(
    typeof author === "string" ? author : author?.name,
    role === "reviewer" ? "Reviewer name" : "author.name",
    { max: 80 },
  );
  return { name, role };
}

function validateFormResponse(widget, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new FeedbackError(400, "Form responses need a data object.");
  }
  const clean = {};
  for (const field of widget.fields) {
    const value = data[field.name];
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (field.required) throw new FeedbackError(400, `${field.label} is required.`);
      continue;
    }
    if (field.type === "boolean") clean[field.name] = Boolean(value);
    else if (field.type === "rating") {
      const rating = Number(value);
      if (!Number.isInteger(rating) || rating < 1 || rating > field.max) {
        throw new FeedbackError(400, `${field.label} must be a whole number from 1 to ${field.max}.`);
      }
      clean[field.name] = rating;
    } else if (field.type === "choice") {
      if (!field.options.includes(value)) throw new FeedbackError(400, `${field.label} must be one of the listed options.`);
      clean[field.name] = value;
    } else clean[field.name] = requireText(value, field.label);
  }
  return clean;
}

async function writeAtomic(path, contents) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { mode: 0o644 });
  await rename(temporary, path);
}

async function readJsonLines(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const events = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn final line from a crash is skipped rather than poisoning the log.
    }
  }
  return events;
}

/**
 * Folds the event log into threads: each reviewer item with its replies and
 * whether it is still open. Resolve events close the item they point at.
 */
export function foldFeedback(events) {
  const byId = new Map();
  const roots = [];
  for (const event of events) {
    if (event.kind === "resolve" || event.kind === "reopen") {
      const target = byId.get(event.targetId);
      if (target) target.status = event.kind === "resolve" ? "resolved" : "open";
      continue;
    }
    if (event.kind === "page_updated") continue;
    const item = { ...event, replies: [], status: event.author?.role === "reviewer" ? "open" : undefined };
    byId.set(event.id, item);
    const parent = event.parentId ? byId.get(event.parentId) : undefined;
    if (parent) parent.replies.push(item);
    else roots.push(item);
  }
  return roots;
}

/** Ids of resolved items and everything threaded under them. */
function resolvedIds(events) {
  const resolved = new Set();
  const visit = (items, inherited) => {
    for (const item of items) {
      const closed = inherited || item.status === "resolved";
      if (closed) resolved.add(item.id);
      visit(item.replies, closed);
    }
  };
  const byPage = new Map();
  for (const event of events) byPage.set(event.page, [...(byPage.get(event.page) ?? []), event]);
  for (const pageEvents of byPage.values()) visit(foldFeedback(pageEvents), false);
  return resolved;
}

/** One store per repo root. Pages and events live in that repo's `.studio/`. */
export class StudioFeedbackStore {
  constructor({ studioId, repoRoot }) {
    this.studioId = studioId;
    this.repoRoot = repoRoot;
    this.pagesDir = join(repoRoot, ".studio", "pages");
    this.feedbackDir = join(repoRoot, ".studio", "feedback");
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
    this.seq = null;
    this.writes = Promise.resolve();
  }

  async ensureSeq() {
    if (this.seq !== null) return;
    let max = 0;
    let files = [];
    try {
      files = await readdir(this.feedbackDir);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;
      for (const event of await readJsonLines(join(this.feedbackDir, file))) {
        if (Number.isInteger(event.seq) && event.seq > max) max = event.seq;
      }
    }
    this.seq = max;
  }

  /** Serializes writes so sequence numbers stay ordered within a studio. */
  serialize(task) {
    const run = this.writes.then(task, task);
    this.writes = run.catch(() => {});
    return run;
  }

  pagePaths(slug) {
    requireSlug(slug);
    return {
      meta: join(this.pagesDir, `${slug}.json`),
      body: join(this.pagesDir, `${slug}.md`),
      log: join(this.feedbackDir, `${slug}.jsonl`),
    };
  }

  async readPage(slug, { withBody = false } = {}) {
    const paths = this.pagePaths(slug);
    let meta;
    try {
      meta = JSON.parse(await readFile(paths.meta, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") throw new FeedbackError(404, `No agent page "${slug}" in studio ${this.studioId}.`);
      throw error;
    }
    if (!withBody) return meta;
    let body = "";
    try {
      body = await readFile(paths.body, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { ...meta, body };
  }

  async listPages({ includeArchived = false } = {}) {
    let files = [];
    try {
      files = await readdir(this.pagesDir);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
    const pages = [];
    for (const file of files.sort()) {
      if (!file.endsWith(".json")) continue;
      try {
        const page = JSON.parse(await readFile(join(this.pagesDir, file), "utf8"));
        if (includeArchived || page.status !== "archived") pages.push(page);
      } catch {
        // Skip a page file that is mid-edit or malformed instead of hiding every page.
      }
    }
    return pages.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async createPage(input, owner) {
    const title = requireText(input.title, "title", { max: 200 });
    const slug = requireSlug(input.slug ? String(input.slug) : slugify(title));
    const body = requireText(input.body ?? "", "body", { max: MAX_BODY_CHARS, optional: true }) ?? "";
    return this.serialize(async () => {
      const paths = this.pagePaths(slug);
      try {
        await readFile(paths.meta);
        throw new FeedbackError(409, `Page "${slug}" already exists. Use update_page to change it.`);
      } catch (error) {
        if (error instanceof FeedbackError) throw error;
        if (error?.code !== "ENOENT") throw error;
      }
      const now = new Date().toISOString();
      const page = {
        slug,
        href: `${AGENT_PAGE_HREF_PREFIX}${slug}`,
        title,
        blurb: requireText(input.blurb, "blurb", { max: 500, optional: true }),
        status: "review",
        owner,
        widgets: normalizeWidgets(input.widgets),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      await mkdir(this.pagesDir, { recursive: true });
      await writeAtomic(paths.body, body);
      await writeAtomic(paths.meta, `${JSON.stringify(page, null, 2)}\n`);
      this.emitter.emit("pages", { type: "created", slug });
      return { ...page, body };
    });
  }

  async updatePage(slug, input) {
    return this.serialize(async () => {
      const current = await this.readPage(slug);
      const paths = this.pagePaths(slug);
      const next = { ...current };
      if (input.title !== undefined) next.title = requireText(input.title, "title", { max: 200 });
      if (input.blurb !== undefined) next.blurb = requireText(input.blurb, "blurb", { max: 500, optional: true });
      if (input.widgets !== undefined) next.widgets = normalizeWidgets(input.widgets);
      if (input.status !== undefined) {
        if (!PAGE_STATUSES.includes(input.status)) {
          throw new FeedbackError(400, `status must be one of ${PAGE_STATUSES.join(", ")}.`);
        }
        next.status = input.status;
      }
      const bodyChanged = input.body !== undefined;
      if (bodyChanged) {
        const body = requireText(input.body, "body", { max: MAX_BODY_CHARS, optional: true }) ?? "";
        await writeAtomic(paths.body, body);
      }
      next.revision = (current.revision ?? 1) + 1;
      next.updatedAt = new Date().toISOString();
      await writeAtomic(paths.meta, `${JSON.stringify(next, null, 2)}\n`);
      await this.appendUnlocked(slug, {
        kind: "page_updated",
        author: { name: current.owner?.name ?? "agent", role: "agent" },
        body: requireText(input.note, "note", { max: 500, optional: true }),
        data: { revision: next.revision, bodyChanged },
      });
      this.emitter.emit("pages", { type: "updated", slug });
      return next;
    });
  }

  async listEvents(slug) {
    return readJsonLines(this.pagePaths(slug).log);
  }

  async listAllEvents({ slugs, since = 0 } = {}) {
    const pages = slugs?.length ? slugs : (await this.listPages({ includeArchived: true })).map((page) => page.slug);
    const events = [];
    for (const slug of pages) {
      for (const event of await this.listEvents(slug)) {
        if (event.seq > since) events.push(event);
      }
    }
    return events.sort((a, b) => a.seq - b.seq);
  }

  async appendUnlocked(slug, event) {
    await this.ensureSeq();
    const paths = this.pagePaths(slug);
    this.seq += 1;
    const record = {
      id: randomUUID(),
      seq: this.seq,
      page: slug,
      createdAt: new Date().toISOString(),
      ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)),
    };
    await mkdir(this.feedbackDir, { recursive: true });
    await appendFile(paths.log, `${JSON.stringify(record)}\n`);
    this.emitter.emit("event", record);
    return record;
  }

  /** Records feedback a reviewer left on a page. */
  async addReviewerEvent(slug, input) {
    const kind = input.kind;
    if (!REVIEWER_EVENT_KINDS.includes(kind)) {
      throw new FeedbackError(400, `kind must be one of ${REVIEWER_EVENT_KINDS.join(", ")}.`);
    }
    return this.serialize(async () => {
      const page = await this.readPage(slug);
      const author = normalizeAuthor(input.author, "reviewer");
      const event = {
        kind,
        author,
        parentId: input.parentId || undefined,
        anchor: input.anchor || undefined,
        // Where feedback mirrored from elsewhere came from (an artifact thread). Host-set only.
        source: input.source || undefined,
      };
      if (kind === "form_response") {
        const widget = page.widgets.find((candidate) => candidate.id === input.widgetId && candidate.kind === "form");
        if (!widget) throw new FeedbackError(400, `Page "${slug}" has no form "${input.widgetId}".`);
        event.widgetId = widget.id;
        event.data = validateFormResponse(widget, input.data);
        event.body = requireText(input.body, "body", { optional: true });
      } else if (kind === "answer") {
        const events = await this.listEvents(slug);
        const question = events.find((candidate) => candidate.id === input.parentId && candidate.kind === "question");
        if (!question) throw new FeedbackError(400, "An answer needs the id of the question it answers.");
        if (question.data?.choices?.length && input.choice !== undefined) {
          if (!question.data.choices.includes(input.choice)) {
            throw new FeedbackError(400, "That answer is not one of the question's choices.");
          }
          event.data = { choice: input.choice };
        }
        event.body = requireText(input.body, "body", { optional: Boolean(event.data) });
      } else {
        event.body = requireText(input.body, "body");
      }
      return this.appendUnlocked(slug, event);
    });
  }

  /** Records something the page's agent said: a reply, a chat turn or a question. */
  async addAgentEvent(slug, input) {
    const kind = input.kind;
    if (!AGENT_EVENT_KINDS.includes(kind)) {
      throw new FeedbackError(400, `kind must be one of ${AGENT_EVENT_KINDS.join(", ")}.`);
    }
    return this.serialize(async () => {
      const page = await this.readPage(slug);
      if (input.parentId) {
        const events = await this.listEvents(slug);
        if (!events.some((event) => event.id === input.parentId)) {
          throw new FeedbackError(404, `No feedback ${input.parentId} on page "${slug}".`);
        }
      } else if (kind === "reply") {
        throw new FeedbackError(400, "A reply needs the id of the feedback it answers.");
      }
      const event = {
        kind,
        author: normalizeAuthor(input.author ?? page.owner?.name ?? "agent", "agent"),
        parentId: input.parentId || undefined,
        body: requireText(input.body, "body"),
      };
      if (kind === "question" && input.choices !== undefined) {
        if (!Array.isArray(input.choices) || input.choices.length < 2) {
          throw new FeedbackError(400, "choices needs at least two options.");
        }
        event.data = { choices: input.choices.map((choice, index) => requireText(choice, `choices[${index}]`, { max: 200 })) };
      }
      return this.appendUnlocked(slug, event);
    });
  }

  async setResolved(slug, targetId, resolved, author) {
    return this.serialize(async () => {
      const events = await this.listEvents(slug);
      if (!events.some((event) => event.id === targetId)) {
        throw new FeedbackError(404, `No feedback ${targetId} on page "${slug}".`);
      }
      return this.appendUnlocked(slug, {
        kind: resolved ? "resolve" : "reopen",
        targetId,
        author: normalizeAuthor(author, author?.role === "reviewer" ? "reviewer" : "agent"),
      });
    });
  }

  /**
   * Resolves with reviewer events after `since`, waiting up to `timeoutMs` for
   * the first one to arrive. Returns as soon as anything matching shows up.
   */
  async waitForReviewerEvents({ slugs, since = 0, timeoutMs = 60_000, signal, skipResolved = false } = {}) {
    const matches = (event) => event.author?.role === "reviewer"
      && event.seq > since
      && (!slugs?.length || slugs.includes(event.page));
    const backlog = await this.listAllEvents({ slugs, since });
    const resolved = skipResolved ? resolvedIds(backlog) : new Set();
    const existing = backlog.filter((event) => matches(event) && !resolved.has(event.id));
    if (existing.length > 0) return { events: existing, timedOut: false };
    return new Promise((resolveWait) => {
      const collected = [];
      let settleTimer;
      const finish = (timedOut) => {
        clearTimeout(deadline);
        clearTimeout(settleTimer);
        this.emitter.off("event", onEvent);
        signal?.removeEventListener?.("abort", onAbort);
        resolveWait({ events: collected, timedOut });
      };
      const onEvent = (event) => {
        if (!matches(event)) return;
        collected.push(event);
        // A form submit or a burst of comments lands as several events; wait a
        // moment so the agent gets them together.
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(false), 400);
      };
      const onAbort = () => finish(true);
      const deadline = setTimeout(() => finish(true), timeoutMs);
      this.emitter.on("event", onEvent);
      signal?.addEventListener?.("abort", onAbort);
    });
  }
}

/**
 * What a page is waiting on, from its folded threads.
 *
 * The reviewer owes: an agent question with no answer, an open reviewer thread
 * whose newest message is the agent's, and the chat when the agent spoke last.
 * The agent owes: open threads and chat where the reviewer spoke last.
 */
export function pageAttention(page, threads) {
  const items = [];
  let waitingOnAgent = 0;
  const newest = (thread) => {
    let latest = thread;
    for (const reply of thread.replies) {
      const candidate = newest(reply);
      if (candidate.seq > latest.seq) latest = candidate;
    }
    return latest;
  };
  const item = (kind, thread, message) => ({
    slug: page.slug,
    title: page.title,
    kind,
    id: thread.id,
    excerpt: excerpt(message.body ?? (typeof message.data?.choice === "string" ? message.data.choice : "")),
    author: message.author?.name,
    createdAt: message.createdAt,
  });

  let chat;
  for (const thread of threads) {
    if (thread.kind === "chat") {
      if (thread.status === "resolved") continue;
      const latest = newest(thread);
      if (!chat || latest.seq > chat.latest.seq) chat = { thread, latest };
      continue;
    }
    if (thread.kind === "question") {
      if (!thread.replies.some((reply) => reply.kind === "answer")) items.push(item("question", thread, thread));
      continue;
    }
    if (thread.status !== "open") continue;
    const latest = newest(thread);
    if (latest.author?.role === "agent") items.push(item("reply", thread, latest));
    else waitingOnAgent += 1;
  }
  if (chat) {
    if (chat.latest.author?.role === "agent") items.push(item("chat", chat.thread, chat.latest));
    else waitingOnAgent += 1;
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { needsYou: items.length, waitingOnAgent, items };
}

function excerpt(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}
