---
kind: history
---

# Studio server migration plan

## Decision

Studio will become one application server at `http://studio.local`. It will serve the dashboard and every migrated project under a path such as `http://studio.local/talkie/`; projects will no longer start a server, choose a port, register a lease, generate a Caddy route, or advertise a hostname.

The target is **one Studio-owned Next application with project mount modules**, not several independent Next servers hidden behind a new proxy. A project's `.studio/project.json` declares its identity and mount entry. Studio discovers those manifests on disk, loads the declared source into its own build, and owns routing, assets, errors, and health from request to response.

This is a deliberate application contract change. An arbitrary Next application cannot be mounted safely inside another running Next application. Next configuration is process-wide, route manifests and middleware are build-wide, React/Next versions may differ, and each app may have its own PostCSS/Tailwind plugins and dependency graph. Pretending those applications share a process would merely move the routing failures inside Studio.

## Composition options considered

### Run each existing Next app and reverse-proxy it

This preserves every app and HMR with little migration work. A supervisor could allocate ephemeral ports and proxy `/talkie/*` to a child process. It is rejected as the target: it retains child-process startup, ports, readiness races, rewriting, and the possibility that Studio returns a response different from the app. It is a temporary compatibility bridge only.

### Build each app and serve static output

This removes live ports and respects each app's build-time configuration. It is viable for frozen review artifacts, but not as the universal development model: server features, route handlers, filesystem-backed pages, image optimization, and HMR do not survive static export. Builds also duplicate caches on a disk-constrained machine. Static artifacts can become an optional mount later.

### Iframe each project

An iframe gives CSS isolation, but still needs an independently served document. With a dev server it preserves the rejected routing system; with static output it has the limitations above. Deep links, focus, accessibility, history, and cross-frame tooling get worse. It is rejected except for short-lived compatibility.

### One Studio app with source-level project mounts — recommended

Each project exposes a small React mount module—page registry/root component plus optional scoped CSS and server-side loaders—instead of a Next application boundary. Studio's single Next app compiles those modules and serves them below `/<project-id>/`. Studio owns the Next version, `next.config`, React runtime, route handlers, error boundary, asset namespace, and development server.

This is the only option that is honestly one server. Its cost is migration. Project-specific Next routes, configuration, plugins, and global CSS must move behind a Studio mount contract. Dependencies imported by a mount resolve from the project's source tree and `node_modules`; runtime singletons (`next`, `react`, and `react-dom`) resolve to Studio's versions. Studio's bundler root must include discovered repositories, with one central transpilation allowlist. Tailwind/PostCSS cannot vary per mounted page, so projects either ship ordinary/scoped CSS or adopt Studio's central pipeline. Conflicting global styles must be scoped to the project mount root.

Discovery changes regenerate a deterministic mount index and restart the one dev process. Editing an already discovered mount stays inside Next's module graph and must hot-reload without a restart. For example, after `design/studio/app/foo/page.tsx` has been adapted or imported by a mount, editing that file must update the browser through HMR; only adding, removing, or changing a manifest/mount entry may restart Studio.

## Mount contract

Extend `.studio/project.json` with a server-owned mount while accepting version 1 during migration:

```json
{
  "version": 2,
  "id": "talkie",
  "label": "Talkie",
  "mount": {
    "kind": "module",
    "entry": "design/studio/studio.mount.tsx"
  }
}
```

The module exports data rather than a server:

```ts
export default defineStudioProject({
  pages: [{ path: "/mac-meeting-opus", component: MacMeetingOpus }]
});
```

The API should reuse Studio's page registry and shell types. It supports a stable identity, project-relative routes, lazy components, navigation metadata, server-side loaders, scoped stylesheet entries, and packages requiring central transpilation. A migrated module does not accept `start`, `host`, `preferredPort`, `healthPath`, or a lease; version 1 fields remain readable only for the bridge.

## Addressing

Canonical URLs use one origin:

- `http://studio.local/` — dashboard;
- `http://studio.local/talkie/mac-meeting-opus`;
- `http://studio.local/action/...`;
- `http://studio.local/fieldwork/...`;
- `http://studio.local/openscout/...`.

Paths remove per-project DNS and mDNS. Only `studio.local` must resolve, and the server also binds loopback as a no-DNS fallback.

The cost is that apps written for `/` may generate absolute URLs such as `/_next/...`, `/api/...`, or `/image.png`. Next's `basePath` is build-wide and cannot differ per mount. Migrated modules use Studio routing helpers for links and APIs, import assets through the bundler, and avoid project-owned absolute paths. Studio owns the single `/_next/` namespace. Legacy hostnames keep their current servers until migration because a redirect cannot repair root-relative assets inside an old app.

## Discovery replaces registration

Studio scans configured repository roots (initially `~/dev`, configurable in one local settings file) for `.studio/project.json`. It validates manifests, rejects duplicate ids, and produces one deterministic mount index. The dashboard and request router consume that same index; there is no second registry.

Discovery has no TTL, heartbeat, process announcement, generated Caddyfile, host, or port. A malformed or incompatible manifest appears as an explicit dashboard error and a non-200 project response. Unknown projects return 404 with a body. Health checks assert response content as well as status so a zero-byte 200 cannot pass.

Scanning is bounded: inspect direct children of configured roots for the conventional manifest, not `node_modules` or the whole home directory. A watcher can regenerate the index and show “restart required” when the module graph changes.

## Migration without breaking current studios

Migration is project-by-project. Existing edge routes, hostnames, registrations, and dev processes remain untouched until each replacement passes parity. In particular, do not restart or change Talkie on `127.0.0.1:5193`, its `/mac-meeting-{opus,fable,fable-2,kimi,ox}` pages, or Action's current hostname while the server is built.

### Phase 0 — make the bridge correct

The bridge cannot remain operational merely by preserving its current code. Before the server foundation, fix the live split-brain failure without restarting the shared host, edge, or Talkie process:

1. Change `discoverSharedCaddy` from an admin-plane check into a data-plane proof. Install a unique temporary probe route through the candidate Caddy admin API, request that route through port 80 with its probe `Host` header, and accept the Caddy instance only when the response body contains the unique nonce. Remove the probe route afterward. An answer from `:2019` alone is not proof because `SO_REUSEPORT` can send admin and data traffic to different processes.
2. Give Caddy an explicit final unmatched-host handler that returns HTTP 404 with a non-empty diagnostic body. A zero-byte 200 is always a failure.
3. Add a regression test that models a responding admin plane whose route is absent from the data plane, plus an integration check that an unmatched hostname returns the expected status and body.
4. Keep the existing processes alive while applying and verifying the configuration. If live correction would require restarting the edge or shared host, stop and coordinate first.

This data-plane probe and explicit fallback are the bridge's correctness source during Phases 1 and 2. They are removed with Caddy in Phase 3.

### Phase 1 — server foundation

1. Add manifest discovery and one generated project catalog.
2. Add `/<id>/...` routing, project error boundaries, non-empty error responses, and content-aware health checks to the Studio app.
3. Define the mount contract with two fixture projects. Give both fixtures the same token/class names with different values, load them on the same document, and prove each mount retains its own appearance without leaking into the dashboard or the other mount. If clean scoping requires per-project PostCSS/Tailwind pipelines or iframe isolation, revise the architecture before migrating a real project.
4. Prove the editing loop. Start the one Studio process with both fixtures, edit an already imported page module, record the time from saved file to updated browser content, and verify the server PID does not change. Publish the measured HMR latency with the Phase 1 result. A page edit that restarts the server fails this phase; manifest/mount graph edits may restart it.
5. Keep legacy Caddy and registration commands operational but deprecated. Do not rewrite or restart the existing edge.

### Phase 2 — migrate four projects

1. **Action:** expose studies as a mount and scope styles; verify `/action/...` while `action.studio.local` remains live.
2. **Talkie:** add a mount outside `design/studio/app/**`; do not edit the five review routes. Verify every `/talkie/mac-meeting-*` route by body content before changing any command.
3. **OpenScout:** adapt its large lazy route registry and filesystem dependencies to mount loaders. Preserve on-demand compilation and avoid static cache duplication.
4. **Fieldwork:** mount its `/studio` surface at `/fieldwork/`, translating its root path instead of nesting `/studio` twice.

Parity covers route inventory, status, non-empty body, recognizable content, hydration, assets, navigation, and HMR. Old hostname and new path overlap until each migration passes.

### Phase 3 — cut over and remove routing

1. Make `studio` start only the Studio application server and advertise only `studio.local` plus loopback.
2. Change project dev scripts to open their Studio path or report that discovery requires a restart; they do not start Next.
3. Remove version 1 runtime fields from migrated manifests.
4. Remove TTL registration, process supervision, port allocation, project vhost generation, and project mDNS.
5. Keep old hostnames as explicit redirects for one release only if this does not reintroduce generated state, then remove them.

## Tests and acceptance

Add tests proving the Phase 0 admin/data-plane distinction and non-empty unmatched-host 404; disk discovery and duplicate rejection; one catalog for dashboard and routing; correct mount dispatch without a child listener; coexistence despite identical historical ports; diagnostic non-200 responses; content-aware health; mount-safe assets and links; style isolation between two colliding fixture projects; HMR without a PID change; and one server PID/listening port for all fixtures.

Run the complete `bun test` suite in every phase. `test/local-caddy.test.ts` remains applicable during the bridge. When Caddy generation is removed, replace that test in the same commit with path-routing and legacy-redirect coverage, documenting that the deleted production behavior—not a skipped failure—made it obsolete.

## Implementation boundaries

- Do not modify `talkie/design/studio/app/**` in the Talkie repo.
- Do not stop or restart port `5193`, the shared host, or the edge without coordination.
- Do not install packages or add large dependencies unless the mount proof requires it.
- Build the fixture and foundation before changing project defaults.
- Never report a project served from status alone; require a non-empty body and project-specific content marker.
