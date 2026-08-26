# Cloud studios — one host, many studios, git-push sync

A VM runs one Vite host process that serves every studio from **real source**.
Studios are small private git repos; `git push` ships them, the cloud coding
agent edits them in place, and locals pull its commits back. No built assets
cross the wire in either direction — only source, transformed per request.

## Layout on the VM

```
~/studios/<id>/                      one studio = one git repo (real source)
~/studio-cloud/bootstrap/studio/     this repository (the host runs from here)
/etc/systemd/system/studio.service   platform app  (next start, port 43210)
/etc/systemd/system/studio-host.service  multi-studio host (bun, port 43215)
```

Both services bind loopback; **nginx is the front door** — the studio host
is served at `http://<vm>/` (port 80, MagicDNS name or tailnet IP, no port),
with the HMR websocket proxied. The platform app stays at
`http://<vm-tailnet-ip>:43210/`. Loopback-only fallback is available with
`studio bootstrap --no-tailscale`.

## Getting started (a fresh remote host)

Prerequisites: SSH keys on the VM account, passwordless sudo, and a
Tailscale auth key in the local keychain (`secret set TAILSCALE_AUTHKEY`).

```bash
studio bootstrap --host <new-vm> --with-agent
```

One command provisions everything: base packages, Bun, Node 22, this repo,
both services, and (with `--with-agent`) the omp harness + Scout broker so a
cloud agent can work there. Idempotent — re-run freely.

Ship the first studio:

```bash
studio sync --dir ~/dev/talkie/design/studio --host <new-vm>
```

The folder becomes its own git repo on first sync (keep it gitignored from
its parent project — secret repos, never on GitHub). Open
`http://<vm-tailnet-ip>:43215/<id>/`.

## The sync loop

```bash
studio sync --dir <studio-folder> --host <vm>
```

- Local edits are committed (`ship <id>`) and pushed; the VM worktree uses
  `receive.denyCurrentBranch=updateInstead`, so pushes are atomic and refuse
  on a dirty tree.
- The cloud agent commits directly in the VM worktree. Sync fetches `main`
  first and rebases local commits on top, so agent work flows back to whoever
  syncs next. One writer per direction; conflicts surface as rebase
  conflicts, never silent clobbers.
- The host watches the worktrees — edits land as HMR, no restarts.

## Studio contract

`studio.json` at the studio root:

```json
{
  "id": "talkie",
  "label": "Talkie",
  "layout": "app/layout.tsx",
  "pages": [{ "path": "/agent-bay", "view": "app/agent-bay/page.tsx" }]
}
```

- **Routes**: every `app/**/page.tsx` is discovered automatically at its
  directory path, mirroring the app router. `pages` entries override or add;
  unknown paths 404 — there is no index fallback.
- **Layout**: `layout` names the real layout module; the host renders it
  around every view. Next's `<html>/<head>/<body>` nesting is harmless in the
  hosted DOM.
- **Compat shims** (host-served, one version everywhere): `next/link` renders
  a plain anchor and prefixes root-relative hrefs with the studio mount;
  `next/navigation` implements `usePathname` / `useSearchParams` /
  `useRouter` against the mounted location. React is a platform singleton —
  every studio resolves the host's copy through the shared optimized chunk.
- **Styles**: CSS is compiled by the studio's *own* tailwindcss + postcss
  install and config, resolved from the studio's `node_modules` on the VM.
  Run `bun install` in the studio directory on the VM after adding
  dependencies (sync does not install). Content globs resolve against the
  studio root regardless of the host process cwd.
- **Source assets**: any real file in the studio tree serves as-is under
  `/<id>/<path>`.

## Operating

```bash
studio host-deploy --host <vm>     # ship cloud/host/** + restart + health check
studio bootstrap --host <vm>       # full re-provision (idempotent)
studio sync --dir <dir> --host <vm>
```

- `host-deploy` after changing `cloud/host/**`. It rsyncs the host subtree,
  restarts `studio-host`, and fails if the health check does not return a
  non-empty body.
- New studio dependencies: `ssh <vm> 'cd ~/studios/<id> && ~/.bun/bin/bun install'`.
- New routes or manifests require a host restart only when the file *graph*
  changes shape; page edits are pure HMR.

## Boundaries

- Source only. Never ship `node_modules`, `.next`, or other build output;
  never commit generated assets to studio repos.
- Studio repos are private and gitignored from their parent projects.
- The first bootstrap on a brand-new VM must complete before heavy use;
  re-run it rather than hand-repairing a half-provisioned host.
- Do not restart services on shared long-lived VMs (e.g. the Scout broker on
  ocean-iron) without coordinating — lab VMs are disposable, shared hosts are
  not.

## Known gaps

- `/favicon.ico` 404s (no host-level favicon yet).
- Tailwind v4-based studios need the `@tailwindcss/postcss` pipeline wired
  alongside the v3 path the host currently drives.
- Agent commits reach locals only when someone runs `sync`; there is no
  push notification yet.
