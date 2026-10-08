import { EventEmitter } from "node:events";

/**
 * Agent presence, in memory on the host daemon.
 *
 * Every MCP tool call marks its session seen. A session inside
 * `wait_for_feedback` is listening. The host reports raw facts (listening now,
 * when the last wait ended and how, when the session was last seen); the page
 * derives "listening / working / idle" from them on its own clock, so idle
 * needs no server timer.
 *
 * Sessions are not persisted. After a daemon restart an agent reappears on its
 * next tool call, under the same `mcp-session-id`.
 */

const FORGET_AFTER_MS = 12 * 60 * 60 * 1000;

export class StudioPresence {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.sessions = new Map();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
  }

  entry(sessionId, studioId) {
    const key = `${studioId}\u0000${sessionId}`;
    let value = this.sessions.get(key);
    if (!value) {
      value = {
        session: sessionId,
        studio: studioId,
        name: undefined,
        client: undefined,
        waits: 0,
        slugs: null,
        lastSeenAt: this.now(),
        lastWaitEndedAt: undefined,
        lastWaitTimedOut: false,
      };
      this.sessions.set(key, value);
    }
    return value;
  }

  /** Any tool call. Names come from create_page's `agent` or the MCP client info. */
  touch(sessionId, studioId, { name, client } = {}) {
    const value = this.entry(sessionId, studioId);
    const fresh = (name && value.name === undefined) || (value.name === undefined && value.client === undefined);
    if (name) value.name = name;
    if (client) value.client = client;
    value.lastSeenAt = this.now();
    this.prune();
    if (fresh) this.emitter.emit("change", studioId);
  }

  named(sessionId, studioId) {
    return this.sessions.get(`${studioId}\u0000${sessionId}`)?.name !== undefined;
  }

  /** Marks the session listening until the returned function is called. */
  listen(sessionId, studioId, slugs) {
    const value = this.entry(sessionId, studioId);
    value.waits += 1;
    value.slugs = Array.isArray(slugs) && slugs.length ? [...slugs] : null;
    value.lastSeenAt = this.now();
    this.emitter.emit("change", studioId);
    let done = false;
    return ({ timedOut = false } = {}) => {
      if (done) return;
      done = true;
      value.waits = Math.max(0, value.waits - 1);
      value.lastSeenAt = this.now();
      value.lastWaitEndedAt = this.now();
      value.lastWaitTimedOut = timedOut;
      this.emitter.emit("change", studioId);
    };
  }

  /** Agents seen in a studio, most recent first. */
  agents(studioId) {
    return [...this.sessions.values()]
      .filter((value) => value.studio === studioId)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
      .map((value) => ({
        session: value.session,
        name: value.name ?? value.client ?? "agent",
        client: value.client,
        listening: value.waits > 0,
        slugs: value.slugs,
        lastSeenAt: new Date(value.lastSeenAt).toISOString(),
        lastWaitEndedAt: value.lastWaitEndedAt ? new Date(value.lastWaitEndedAt).toISOString() : undefined,
        lastWaitTimedOut: value.lastWaitTimedOut,
      }));
  }

  prune() {
    const cutoff = this.now() - FORGET_AFTER_MS;
    for (const [key, value] of this.sessions) {
      if (value.waits === 0 && value.lastSeenAt < cutoff) this.sessions.delete(key);
    }
  }
}

/**
 * The agent that speaks for one page: a session listening on it, else the
 * session that created it. Null when neither has been seen since the host
 * started.
 */
export function pagePresence(page, agents) {
  const covers = (agent) => agent.slugs === null || agent.slugs.includes(page.slug);
  const listening = agents.find((agent) => agent.listening && covers(agent));
  if (listening) return listening;
  const owner = page.owner?.session ? agents.find((agent) => agent.session === page.owner.session) : undefined;
  if (owner) return owner;
  // A recent wait that just ended still covers the page until the agent calls again.
  return agents.find((agent) => agent.lastWaitEndedAt && covers(agent)) ?? null;
}
