---
kind: map
title: "Local host, component registry, and flows"
covers: ["src/local/**", "src/components/**", "src/flows/**", "src/index.ts", "studio.components.ts"]
---

# Local host, component registry, and flows

## Files

- `src/index.ts` — root barrel. Re-exports registry, components, router, shell, doc, code, injection, atoms, flows, scout, agents. It does not export `src/local` (node-only, reached via `studio/local`).
- `studio.components.ts` — this repo's component registry file. Exports `manifests: ComponentManifest[]` (today only `statusPillManifest` from `src/atoms/StatusPill.manifest.ts`).
- `src/local/ids.ts` — `normalizeStudioId`, `normalizeStudioHost`, `defaultHostForStudioId` (`<id>.studio.local`), `normalizeRelativeDir`.
- `src/local/urls.ts` — constants: portal host `studio.local`, supervisor port 43180, port start 5200, `/__studio` control prefix, supervisor API paths.
- `src/local/paths.ts` — support dir (`~/Library/Application Support/Studio` on macOS, `~/.studio-local` elsewhere, or `STUDIO_LOCAL_SUPPORT_DIR`): registry.json, `runtime/`, `logs/`, `local-edge/Caddyfile`.
- `src/local/types.ts` — `StudioProjectManifest` (`.studio/project.json`), `EnabledStudio`, `ResolvedStudio`, `StudioRuntimeStatus`.
- `src/local/manifest.ts` — parse, validate, find, and write `.studio/project.json` (previews, scout, agents included).
- `src/local/registry.ts` — machine registry read/write, `registerStudio`, `allocateStudioPort`, `resolveStudio`, `discoverStudioProjects` (walks for manifests, depth 3).
- `src/local/caddy.ts` — renders the Caddyfile: one portal block plus one proxy block per enabled studio and preview.
- `src/local/processes.ts` — `StudioProcessSupervisor`: spawns a studio's `start` command, logs to `logs/<id>.log`, health-checks it.
- `src/local/server.ts` — Bun supervisor HTTP server: dashboard, JSON API, start/stop, fallback "Start Studio" page.
- `src/local/shared-host.ts` — registers studio-local routes with the persistent host in `bin/local-host.mjs` when that host runs a shared Caddy edge.
- `src/local/installer.ts` — ensures Caddy (Homebrew on macOS), writes the Caddyfile, installs the `dev.studio.local` LaunchAgent.
- `src/local/cli.ts` — `studio-local` bin (`bun run local`): `init`, `ensure`, `install`, `enable`, `disable`, `scan`, `list`, `caddyfile`, `serve`, `edge`.
- `src/local/index.ts` — barrel for `studio/local`.
- `src/components/manifest.ts` — `ComponentManifest` schema, status vocab (`draft | candidate | graduated`), port status, `defaultAuditRules`, `auditManifest`, `meetsStatus`, `searchManifests`.
- `src/components/registry.ts` — `createComponentRegistry`: `all`, `get`, `byStatus`, `find`, `health`.
- `src/components/verify.ts` — node-only filesystem checks: source files exist, exports and props are real, port hashes match; `findRepoRoot`, `portHashes`.
- `src/components/cli.ts` — `studio components list|find|show|audit|verify|port|hashes`.
- `src/components/index.ts` — browser-safe barrel (no `verify`).
- `src/flows/model.ts` — Flow file v2 schema, the closed `PRIMITIVES` allowlist, layout constants, product packs, scaffolds, `parseFlowFile`.
- `src/flows/render.tsx` — `CompRenderer` and `FlowCanvas`: render `CompNode` trees with HTML stand-ins or injected Hud components. `Embed` defaults to an iframe.
- `src/flows/HudsonApp.tsx` — `createStudioFlowsApp(options)`: a Hudson `HudsonApp` (canvas mode) with providers, slots, and hooks.
- `src/flows/index.ts` — `studio/flows` barrel (model, render, app, UI pieces).
- `src/flows/styles.css` — Tailwind v4 `@source` and theme tokens for hosts.
- `src/flows/server/` — Bun service: `src/flows/server/store.ts` (JSON files), `src/flows/server/mcp-http.ts` (server), `src/flows/server/tools.ts` (MCP tools), `src/flows/server/http-api.ts` (REST and handoffs), `src/flows/server/discuss.ts` (`scout ask`), `src/flows/server/browse.ts` (HTML list), `src/flows/server/session.ts` (open file per MCP session), `src/flows/server/cli.ts` (`studio-flows`), `src/flows/server/smoke.ts`, `src/flows/server/index.ts`.
- `src/flows/ui/` — canvas client: `src/flows/ui/FlowState.tsx` (state, fetches), `src/flows/ui/FlowWorld.tsx` (world-space pages), `src/flows/ui/FlowMinimap.tsx`, `src/flows/ui/inspect.ts` and `src/flows/ui/FlowInspectContext.tsx` (selection model), `src/flows/ui/embedSurfaces.tsx` (embed registry), `src/flows/ui/FlowRuntime.tsx` (discuss target), `src/flows/ui/hooks.ts` (Cmd+K commands), `src/flows/ui/types.ts`.
- `src/flows/ui/slots/` — Hudson slot components: `LeftPanel`, `LeftFooter`, `Inspector` (selection plus discuss chat), `SettingsTool`.

Related files that are not covered here: `bin/studio.mjs` (CLI entry), `bin/local-dev.mjs` (`studio dev`), `bin/local-host.mjs` (persistent host daemon), `bin/local-ports.mjs` (port allocator), `bin/local-host.d.mts` (types for `src/local/shared-host.ts`), `.studio/project.json`.

## Data flow

**`studio dev` (the current path, in `bin/`).** `bin/studio.mjs dev` calls `runLocalDev`. It resolves the git root, then takes the id from the `remote.origin.url` repo name (or the directory basename), normalized by `normalizeRepoName`. It calls `ensureStudioHost`, which spawns `studio host run` detached if `~/.studio/host/api.sock` does not answer. The port comes from, in order: `--port`, a literal `next --port N` in the child command, or `allocateDevPort`. The allocator tries the remembered port in `~/.studio/host/dev-ports.json`, then `preferredPort` from `.studio/project.json`, then a sha256-derived home in 43200–43299, then the rest of that range. It skips ports held by other registrations and ports that fail a bind check. `{port}` in the child command is substituted. The wrapper PUTs `/v1/registrations/<id>` over the unix socket, then spawns the child with `PORT`, `STUDIO_URL`, `NEXT_PUBLIC_STUDIO_ID`, and local `node_modules/.bin` on `PATH`. It heartbeats every TTL/3 (15 s TTL) and re-registers if the host restarted. On exit it DELETEs the lease. The host proxies `<id>.studio.local` on :80. If :80 is taken, it falls back to a shared Caddy (admin `127.0.0.1:2019`), installs routes there, and listens internally on 43150.

**studio-local supervisor (`src/local`).** `studio-local ensure <repo>` registers the repo in registry.json: it keeps the existing id, host, and port, or uses manifest values, or the first free port from 5200. It then writes the Caddyfile and installs a LaunchAgent that runs `src/local/cli.ts edge`. `edge` writes the Caddyfile and starts the supervisor on 43180. If a shared-caddy host is up on :80, `edge` registers routes with it. If not, it spawns its own `caddy run` and `dns-sd -P` mDNS proxies. Each Caddy proxy block sends `/__studio/start` and `/__studio/status` to the supervisor and everything else to `127.0.0.1:<port>`. On upstream errors it rewrites to `/__studio/fallback/<id>`, which serves a page that POSTs start and polls until the app answers. The supervisor runs `sh -lc <start>` in `studioDir`, with `{id}/{host}/{port}` replaced and `PORT`, `STUDIO_PORT`, and `STUDIO_HOST` set. It then waits up to 20 s for `healthPath` to return a status below 500.

**Component registry.** Manifests sit next to their components as `<Name>.manifest.ts` and are listed by hand in `studio.components.ts`. `bin/studio.mjs components` runs `bun src/components/cli.ts` with stdio inherited. The CLI finds the nearest `.git` root, imports `studio.components.{ts,mts,mjs,js}` (or `--registry`), reads `manifests` or `default`, and wraps the result in `createComponentRegistry`. `audit` checks each manifest against itself. `verify` checks it against the filesystem. `hashes` prints `port.ref` plus `verifiedAgainst` for `source[0]` and `port.target`.

**Flows.** Files are stored in `~/.studio/flows/<id>.flow.json` (`STUDIO_FLOWS_ROOT` overrides). `studio-flows serve` starts `Bun.serve` on 127.0.0.1:29982 with these routes: `/health`, `/browse`, `/mcp` (Streamable HTTP JSON-RPC; tools in `src/flows/server/tools.ts`), and `/api/*` plus `/view/*` (`src/flows/server/http-api.ts`). MCP tools mutate the file and save it atomically (tmp file, then rename). The session's open file is held in memory. `open_in_studio` writes a handoff to `~/.studio/flows/handoffs` and builds URLs from `STUDIO_FLOWS_STUDIO_URL` (default `http://localhost:3033`). In the browser, `createStudioFlowsApp` mounts `FlowStateProvider`. It fetches the relative paths `/api/files` and `/api/files/<id>/canvas`, and the Inspector POSTs `/api/discuss`, which runs `scout ask --harness claude` in the project root.

## Invariants and traps

- Two local-edge systems coexist. `bin/local-host.mjs` keeps its state in `~/.studio/host`, uses ports 43200+, and takes its id from the git remote. `src/local` keeps its state in the Application Support registry.json, uses ports 5200+, and takes its id from `.studio/project.json`. Their ids are normalized differently (`normalizeRepoName` caps at 63 chars and applies NFKD; `normalizeStudioId` does neither). Do not assume one system's registry knows about the other.
- `edge` defers to the shared host only when that host reports `edge: "shared-caddy"` on port 80. When the host owns :80 directly, `edge` still spawns its own Caddy on :80. `installStudioLocalService` will not start the LaunchAgent if 80/443 is already listening.
- Shared-host registration requires every route's host to equal `<id>.studio.local` and to be unique. A custom `host` in the manifest throws.
- `allocateStudioPort` (src/local) checks only registry collisions, never whether the port is bindable. `allocateDevPort` (bin) checks bindability, but only at one moment. `runLocalDev` retries up to 4 times when the child dies within 15 s and its port is taken. An explicit `--port` gets one attempt.
- `studio dev --port A -- next dev --port B` throws when A ≠ B. `{port}` is a placeholder, not an explicit choice.
- `src/local/server.ts` throws unless it runs under Bun. `src/local/shared-host.ts` imports `bin/local-host.mjs` directly.
- `src/components/index.ts` must never import `node:*`. Filesystem checks belong in `src/components/verify.ts` behind `studio/components/verify`.
- `graduated` is earned: `meetsStatus` fails on audit errors only, and warnings never block. `verify` reports changed port hashes as warnings and missing hashed files as errors. A duplicate id is a registry error. `audit` and `verify` exit 1 on errors. `--json` must print only JSON to stdout.
- Flow agents cannot invent components. Node types outside `PRIMITIVES` are rejected, and `parseFlowFile` accepts only `version: 2`.
- The flows UI fetches relative `/api/...`, so the host must proxy those paths to the flows service. CORS allows only `GET, OPTIONS`, so a cross-origin `POST /api/discuss` fails preflight.
- `src/flows/server/tools.ts` defaults `serverCtx.port` to 29980 until `startServer` calls `setServerContext`. Handoff URLs use `STUDIO_FLOWS_PUBLIC_PORT` when it is set.
- MCP session open-file state lives in memory and is lost on restart. Tools then need `open_file` again.
