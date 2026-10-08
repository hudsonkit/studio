"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { FeedbackClient } from "./client";
import type { AgentPageDetail, AgentPageSummary, AgentPresence } from "./types";

export type AgentPagesState =
  | { status: "loading"; pages: AgentPageSummary[]; agents: AgentPresence[] }
  | { status: "ready"; pages: AgentPageSummary[]; agents: AgentPresence[] }
  | { status: "offline"; pages: AgentPageSummary[]; agents: AgentPresence[]; error: string };

export type AgentPageState =
  | { status: "loading"; detail?: AgentPageDetail }
  | { status: "ready"; detail: AgentPageDetail }
  | { status: "error"; detail?: AgentPageDetail; error: string };

const LOADING_PAGES: AgentPagesState = { status: "loading", pages: [], agents: [] };
const LOADING_PAGE: AgentPageState = { status: "loading" };
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];
// Feedback and presence arrive in bursts (a wait ends, the agent replies, waits again).
const LIST_DEBOUNCE_MS = 300;

/**
 * Live view of one studio's agent pages. The SSE stream is opened only while
 * something is subscribed and only after the daemon has answered once, so a
 * studio running without the host daemon stays quiet instead of retrying a
 * refused EventSource every few seconds.
 */
class AgentPagesStore {
  private listeners = new Set<() => void>();
  private pagesState: AgentPagesState = LOADING_PAGES;
  private pageStates = new Map<string, AgentPageState>();
  private watched = new Map<string, number>();
  private closeStream?: () => void;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private retryIndex = 0;
  private listTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly client: FeedbackClient) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) void this.refresh();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  getPages = () => this.pagesState;

  getPage(slug: string): AgentPageState {
    return this.pageStates.get(slug) ?? LOADING_PAGE;
  }

  watch(slug: string) {
    this.watched.set(slug, (this.watched.get(slug) ?? 0) + 1);
    void this.loadPage(slug);
    return () => {
      const count = (this.watched.get(slug) ?? 1) - 1;
      if (count > 0) this.watched.set(slug, count);
      else this.watched.delete(slug);
    };
  }

  /** Re-reads the page list and every watched page, then (re)opens the stream. */
  refresh = async () => {
    clearTimeout(this.retryTimer);
    try {
      const { pages, agents } = await this.client.getOverview();
      this.pagesState = { status: "ready", pages, agents };
      this.retryIndex = 0;
      this.emit();
      await Promise.all([...this.watched.keys()].map((slug) => this.loadPage(slug)));
      if (!this.closeStream && this.listeners.size > 0) this.openStream();
    } catch (error) {
      this.pagesState = {
        status: "offline",
        pages: this.pagesState.pages,
        agents: this.pagesState.agents,
        error: messageOf(error),
      };
      this.emit();
      this.scheduleRetry();
    }
  };

  async loadPage(slug: string) {
    const previous = this.pageStates.get(slug);
    try {
      const detail = await this.client.getPage(slug);
      this.pageStates.set(slug, { status: "ready", detail });
    } catch (error) {
      this.pageStates.set(slug, { status: "error", detail: previous?.detail, error: messageOf(error) });
    }
    this.emit();
  }

  private openStream() {
    this.closeStream = this.client.subscribe({
      onFeedback: (event) => {
        if (this.watched.has(event.page)) void this.loadPage(event.page);
        this.reloadList();
      },
      onPages: (change) => {
        this.reloadList();
        if (this.watched.has(change.slug)) void this.loadPage(change.slug);
      },
      onPresence: () => this.reloadList(),
      onError: () => {
        // Hand reconnection to our own backoff so a stopped daemon is not polled hot.
        this.closeStream?.();
        this.closeStream = undefined;
        this.scheduleRetry();
      },
    });
  }

  private reloadList() {
    clearTimeout(this.listTimer);
    this.listTimer = setTimeout(() => {
      void this.client.getOverview().then(({ pages, agents }) => {
        this.pagesState = { status: "ready", pages, agents };
        this.emit();
      }, () => {});
    }, LIST_DEBOUNCE_MS);
  }

  private scheduleRetry() {
    if (this.listeners.size === 0) return;
    clearTimeout(this.retryTimer);
    const delay = RETRY_MS[Math.min(this.retryIndex, RETRY_MS.length - 1)];
    this.retryIndex += 1;
    this.retryTimer = setTimeout(() => void this.refresh(), delay);
  }

  private stop() {
    clearTimeout(this.retryTimer);
    clearTimeout(this.listTimer);
    this.closeStream?.();
    this.closeStream = undefined;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

const stores = new WeakMap<FeedbackClient, AgentPagesStore>();

function storeFor(client: FeedbackClient): AgentPagesStore {
  let store = stores.get(client);
  if (!store) {
    store = new AgentPagesStore(client);
    stores.set(client, store);
  }
  return store;
}

/** Agent pages in this studio, kept current over the host's event stream. */
export function useAgentPages(client: FeedbackClient): AgentPagesState {
  const store = storeFor(client);
  return useSyncExternalStore(store.subscribe, store.getPages, () => LOADING_PAGES);
}

/** One agent page with its folded feedback threads, kept current live. */
export function useAgentPage(
  client: FeedbackClient,
  slug: string,
): AgentPageState & { reload: () => Promise<void> } {
  const store = storeFor(client);
  useEffect(() => store.watch(slug), [store, slug]);
  const state = useSyncExternalStore(
    store.subscribe,
    () => store.getPage(slug),
    () => LOADING_PAGE,
  );
  const reload = useCallback(() => store.loadPage(slug), [store, slug]);
  return { ...state, reload };
}

const REVIEWER_STORAGE_KEY = "studio.reviewer";
const reviewerListeners = new Set<() => void>();
// Fallback for windows that refuse localStorage, so a name still lasts the session.
let sessionReviewer = "";

function readReviewer(): string {
  try {
    return window.localStorage.getItem(REVIEWER_STORAGE_KEY) ?? sessionReviewer;
  } catch {
    return sessionReviewer;
  }
}

function subscribeReviewer(listener: () => void) {
  reviewerListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    reviewerListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The reviewer's display name, remembered in this browser. */
export function useReviewerName(): [string, (name: string) => void] {
  const name = useSyncExternalStore(subscribeReviewer, readReviewer, () => "");
  const setName = useCallback((next: string) => {
    sessionReviewer = next.trim();
    try {
      window.localStorage.setItem(REVIEWER_STORAGE_KEY, sessionReviewer);
    } catch {
      // Storage refused: sessionReviewer carries the name until reload.
    }
    for (const listener of reviewerListeners) listener();
  }, []);
  return [name, setName];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
