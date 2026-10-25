"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivePin } from "./stage";
import type { LiveChange, LivePageRef, LiveServerEvent } from "./types";

export type LiveFeedStatus = "connecting" | "live" | "missing" | "offline";

export interface LiveFeed {
  status: LiveFeedStatus;
  changes: LiveChange[];
  /** Files and pages the host found, from its last hello. */
  watching?: { files: number; pages: number; root: string };
  /** Epoch ms the session started; changes before it are not shown. */
  openedAt: number;
  pin?: LivePin;
  setPin(pin: LivePin | undefined): void;
  /** Forget this session's changes and pin, and start a new one now. */
  reset(): void;
}

interface StoredSession {
  openedAt: number;
  pin?: LivePin;
}

const RETRY_MS = [1000, 2000, 5000];

function storageKey(endpoint: string): string {
  return `studio.live.session:${endpoint}`;
}

function readSession(endpoint: string): StoredSession | undefined {
  try {
    const raw = window.sessionStorage.getItem(storageKey(endpoint));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredSession;
    return typeof parsed.openedAt === "number" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeSession(endpoint: string, session: StoredSession) {
  try {
    window.sessionStorage.setItem(storageKey(endpoint), JSON.stringify(session));
  } catch {
    // Private windows and blocked storage: the session lasts as long as the view.
  }
}

function changeKey(change: LiveChange): string {
  return `${change.at}:${change.file}`;
}

/**
 * Follow the host's live route. The session start and pin live in
 * sessionStorage so a shell re-render or a hot reload of the host's app
 * module keeps the person's place; reconnects replay from the session start.
 */
export function useLiveFeed(endpoint: string, pages: readonly LivePageRef[]): LiveFeed {
  const [session, setSession] = useState<StoredSession>(() => {
    const now = Date.now();
    if (typeof window === "undefined") return { openedAt: now };
    const stored = readSession(endpoint);
    if (stored) return stored;
    const fresh = { openedAt: now };
    writeSession(endpoint, fresh);
    return fresh;
  });
  const [status, setStatus] = useState<LiveFeedStatus>("connecting");
  const [changes, setChanges] = useState<LiveChange[]>([]);
  const [watching, setWatching] = useState<LiveFeed["watching"]>();

  // Re-subscribe only when what the host needs to know changes.
  const signature = useMemo(() => JSON.stringify(pages), [pages]);

  useEffect(() => {
    const body = JSON.stringify({ pages: JSON.parse(signature), since: session.openedAt });
    let stopped = false;
    let attempt = 0;
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const handle = (event: LiveServerEvent) => {
      if (event.type === "hello") {
        attempt = 0;
        setStatus("live");
        setWatching({ files: event.watching, pages: event.resolved, root: event.root });
      } else if (event.type === "change") {
        const key = changeKey(event.change);
        setChanges((prior) => {
          // A replay after reconnect re-resolves changes we already hold.
          const next = prior.filter((change) => changeKey(change) !== key);
          next.push(event.change);
          return next;
        });
      }
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok || !response.body) throw new Error(`live route ${response.status}`);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            try {
              handle(JSON.parse(data) as LiveServerEvent);
            } catch {
              // A malformed frame is skipped, not fatal.
            }
          }
        }
        throw new Error("live route closed");
      } catch {
        if (stopped) return;
        setStatus("offline");
        const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]!;
        attempt += 1;
        retry = setTimeout(connect, delay);
      }
    };

    setStatus("connecting");
    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      controller?.abort();
    };
  }, [endpoint, signature, session.openedAt]);

  const setPin = useCallback(
    (pin: LivePin | undefined) => {
      setSession((prior) => {
        const next = { openedAt: prior.openedAt, ...(pin ? { pin } : {}) };
        writeSession(endpoint, next);
        return next;
      });
    },
    [endpoint],
  );

  const reset = useCallback(() => {
    const next = { openedAt: Date.now() };
    writeSession(endpoint, next);
    setChanges([]);
    setSession(next);
  }, [endpoint]);

  return {
    status,
    changes,
    watching,
    openedAt: session.openedAt,
    pin: session.pin,
    setPin,
    reset,
  };
}
