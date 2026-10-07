---
kind: map
title: "Agent pages, reviewer feedback and Scout dispatch"
covers: ["src/feedback/**", "src/agents/**", "src/scout/**"]
---

# Agent pages, reviewer feedback and Scout dispatch

## Files

- `src/feedback/types.ts` — wire types for agent pages, widgets, feedback events, folded threads and reviewer input, as the host serves them.
- `src/feedback/client.ts` — `createFeedbackClient`: fetch and SSE client for the host's `/__studio/api`; picks same-origin or the loopback daemon port.
- `src/feedback/store.ts` — `useAgentPages`, `useAgentPage`, `useReviewerName`: one external store per client, live over SSE with backoff.
- `src/feedback/AgentPage.tsx` — renders an agent page: markdown body, question cards, and the comments, chat and form widgets the agent declared.
- `src/feedback/index.ts` — barrel for `studio/feedback`.
- `src/agents/types.ts` — `StudioAgentTarget` (portable Scout selector) and the HUD-011-aligned `StudioCapabilityRequest`/`Result` shapes.
- `src/agents/registry.ts` — `createAgentRegistry`: selector lookup, default target, strict `resolve`.
- `src/agents/dispatch.ts` — pure mappers: annotation pass to capability request, Scout receipt to capability result.
- `src/agents/index.ts` — browser-safe barrel for `studio/agents`.
- `src/scout/types.ts` — manifest `scout` config, connection, agent option, message input and receipt types.
- `src/scout/paths.ts` — Studio API and Scout web paths, `normalizeScoutWebBaseUrl`, composer URL builder.
- `src/scout/client.ts` — browser fetchers for the app's `/api/scout*` and `/api/studio/scout/pairing` routes.
- `src/scout/server.ts` — Node side: reads `.studio/project.json`, resolves selectors against Scout `/api/agents`, posts messages, builds the agent registry.
- `src/scout/pairing.ts` — reads and writes `.studio/review-pairing.json` (one paired review agent per project).
- `src/scout/index.ts` — browser barrel for `studio/scout` (client, paths, types only).

Related, not covered: `bin/local-agent-api.mjs` (Studio MCP + `/__studio/api` HTTP), `bin/local-feedback.mjs` (`StudioFeedbackStore`, on-disk log), `bin/local-host.mjs` (mounts the service on the proxy and the MCP port), `apps/studio/app/api/scout/**` and `apps/studio/app/api/studio/scout/pairing/route.ts` (Next routes over `studio/scout/server`), `apps/studio/src/studio/agentPages.tsx`, `apps/studio/src/studio/AnnotatableMarkdown.tsx`, `apps/studio/src/studio/StudioScoutProvider.tsx`.

## Data flow

Two separate channels. Agent pages are pull: an agent publishes and then waits on the host. Scout dispatch is push: Studio sends a message to an agent. They share no code path.

**Agent pages and feedback (host MCP).**
1. A coding agent calls MCP tools on the host daemon (`POST /mcp`, default port 43148). `create_page` writes `.studio/pages/<slug>.json` and `<slug>.md` in the studio's repo and returns a URL under `/studio/agents/<slug>`.
2. The page UI uses `createFeedbackClient`. On `*.studio.local` it calls same-origin `/__studio/api` and the Host header names the studio. Elsewhere it calls `http://127.0.0.1:43148/__studio/api?studio=<id>`.
3. `AgentPagesStore` calls `listPages`, loads watched pages, and only then opens the SSE stream (`/events`). A `feedback` event refetches the whole page detail for a watched slug. A `pages` event refetches the list.
4. Reviewer actions post `comment`, `chat`, `form_response` or `answer` to `/pages/:slug/feedback`, and resolve/reopen to `/feedback/:id/resolve`. The host appends one JSON line to `.studio/feedback/<slug>.jsonl` with a studio-wide `seq`.
5. The agent's `wait_for_feedback` returns reviewer events after its cursor. It then calls `reply`, `ask`, `update_page` or `resolve_feedback`, which append agent events that the page sees over SSE.
6. `foldFeedback` (host) turns the log into `FeedbackThread`s: replies nest by `parentId`, `resolve`/`reopen` set `status` on reviewer items, `page_updated` is dropped.

**Scout dispatch (annotations and the drawer).**
1. `loadStudioAgentRegistry` builds targets from manifest `agents`, or falls back to `[scout.identity]`.
2. The browser calls `sendStudioScoutMessage` → Next route `/api/scout/messages`, which rejects a `target` not in the registry, then calls `postStudioScoutMessage`.
3. `postStudioScoutMessage` resolves the sender (`scout.identity`) and the recipient (target or identity), appends a `Studio:/Surface:/Source:` footer, then either posts to Scout `/api/ask` (intent `request`) or opens `/api/conversations/direct` and posts to `/api/send` with intent `tell` (intent `message`). It returns a `StudioScoutReceipt`.
4. Intent comes from `input.intent`, else the target's `intent`, else `message`.
5. Review pairing: `POST /api/studio/scout/pairing` checks the registry, then `writeStudioReviewPairing` stores `{ pairedAgent, pairedAt }`.

## Invariants and traps

- The host daemon is the only writer of `.studio/pages` and `.studio/feedback`. `seq` is kept in memory and rebuilt from the max on disk on first use. A second writer would produce duplicate `seq` values.
- MCP sessions and their per-studio cursors are in memory. After a daemon restart, the first `wait_for_feedback` uses `skipResolved` and returns the open backlog again, not only new events.
- `wait_for_feedback` waits 400 ms after the first matching event to batch bursts. Default timeout 50 s, max 300 s, and it aborts when the HTTP response closes.
- `source` on a feedback event marks mirrored artifact comments. `handleApi` strips it from page posts. Only host code (`bin/local-artifacts.mjs`) may set it.
- Page slugs must match `^[a-z0-9][a-z0-9-]{0,63}$`. The API route regex accepts only `[a-z0-9-]+` slugs and `[0-9a-f-]+` feedback ids.
- `/__studio/api/pages` hides archived pages. MCP `list_pages` hides them unless `include_archived`.
- The host rejects untrusted Host headers (421) and Origins (403). Only loopback names and `*.studio.local` pass.
- `AgentPagesStore` is cached in a `WeakMap` per client object. Create the client once at module scope (as `apps/studio/src/studio/agentPages.tsx` does), or each render gets a new store and stream.
- On SSE error the store closes the stream and retries on its own backoff (2, 5, 15, 30 s) so a stopped daemon is not polled hot. A failed fetch surfaces as `FeedbackRequestError` with status 0.
- Posting needs a reviewer name. `AgentPage` checks it client-side, and the host rejects a missing `author.name` (max 80 chars). The name is in `localStorage` key `studio.reviewer`, with an in-memory fallback.
- `AgentPage` shows question cards only for root-level `question` threads. A question counts as answered once any `answer` reply exists.
- Form responses are validated on the host against the widget's fields: required fields, choice options, ratings 1..max, booleans coerced.
- `src/scout/server.ts` and `src/scout/pairing.ts` import `node:*`. Import them only through `studio/scout/server`. The `studio/scout` and `studio/agents` barrels must stay browser-safe.
- `registry.resolve(selector)` returns `undefined` for an unknown selector instead of the default target. `default()` throws if `defaultTarget` names an unregistered agent.
- Selector matching lowercases, trims and strips a leading `@`. On Scout, an exact id match wins. Several non-id matches throw "ambiguous", and none throws "not found". Scout web calls time out after 5 s.
- `postStudioScoutMessage` does not check the registry itself. The Next route does. Direct callers must validate targets.
- `STUDIO_SCOUT_WEB_BASE_URL` overrides `scout.webBaseUrl`. The base URL must be a bare http(s) origin with no path, query, hash or credentials.
- `pairStudioReviewAgent` ignores the response status, so a rejected pairing fails silently in the browser.
- `annotationPassToCapabilityRequest` and `receiptToCapabilityResult` are exported and tested (`test/agents.test.ts`) but not called by the app yet. `apps/studio/src/studio/AnnotatableMarkdown.tsx` calls `sendStudioScoutMessage` directly.
- `.studio/pages/`, `.studio/feedback/` and `.studio/review-pairing.json` are gitignored in this repo.
