---
kind: map
title: "Live study view"
covers: ["src/live/**"]
---

# Live study view

## Files

- `src/live/types.ts` defines page subscriptions, candidate distances, file changes, and stream events.
- `src/live/graph.ts` resolves route-name entries, local imports, tsconfig aliases, and public assets into shortest import distances.
- `src/live/server.ts` owns filesystem watchers, change replay, page attribution, and the POST event stream. `createStudioLiveHandler` accepts an explicit host root; `POST` uses the process working directory.
- `src/live/stage.ts` chooses the stage from changes and an optional time-stamped pin.
- `src/live/useLiveFeed.ts` consumes the stream, reconnects, deduplicates replayed changes, and stores the session start and pin in sessionStorage.
- `src/live/LiveView.tsx` renders the current study, touched pages, and connection state. Its stage router supplies the selected page's path while the outer location remains the live route.
- `src/live/index.ts` exports the browser-safe view, hook, types, and stage helpers. The filesystem server has its own `studio/live/server` export.
- `apps/studio/app/api/studio/live/route.ts` mounts the handler in Studio's own host.
- `tests/live.test.ts` verifies graph resolution, pins, stream replay, and multiple source files sharing an outside directory.

## Data flow

The view POSTs its registry pages and session start to `/api/studio/live`. One recursive watcher per host root indexes supported source files and parses imports. Registry source files outside the host directory are watched separately, provided they remain inside the repository and have a content extension. Files in the same outside directory share a watcher but each receives its own index record.

After a 120 ms settle interval, a file event increments the graph version and emits candidates sorted by distance. The nearest candidate wins. A tie retains the current page when possible; more than two equally near candidates otherwise count as shared infrastructure. A manual pin holds until a newer attributed change. A new connection receives a hello event and up to 500 in-memory changes since its requested time.

## Invariants and traps

- Mount the route only in the local development host. It watches source and exposes relative paths; it does not authenticate requests.
- Keep `src/live/server.ts` out of browser barrels. The root `studio` export includes the client module, not Node filesystem imports.
- Source paths are repository-relative. Files outside the repository and native source files outside the host root are ignored.
- Build directories, dependencies, Git metadata, and generated Next environment declarations are ignored. Binary asset changes are not watched, even though source references to those assets can be parsed.
- Import parsing is intentionally lightweight; dynamically computed paths and package dependencies are not followed. Aliases load from the host's own tsconfig or jsconfig when the watcher starts.
- Replay is process-local and bounded; it is not a persistent change history. Pins and the session start are tab-local.
- `closeStudioLiveWatchers` is test cleanup. Cancel stream readers before closing watchers so subscription ping intervals are also cleared.

For host adoption, see [Follow study edits](reference.md#follow-study-edits).
