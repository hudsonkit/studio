# AGENTS.md

Working guide for coding agents in this repository. Humans: same facts, see
`README.md` and `docs/`.

## What this repo is

Studio is a TypeScript package (shell, registry, docs viewer, code
viewer, scout integration) plus two runtimes:

- **Local platform app** — `apps/studio`, a Next app; the canonical
  first-party studio.
- **Cloud host** — `cloud/host/main.ts`, a Vite middleware server that serves
  N studios of real source from one process on a VM. `cloud/bootstrap.sh`
  provisions a VM end to end; `bin/local-deploy.mjs` implements the deploy /
  sync / host-deploy commands that `bin/studio.mjs` dispatches.

## Commands

```bash
bun test                # full suite — run before claiming done
bun dev                 # local platform app dev
bunx tsc --noEmit       # typecheck src/
studio host-deploy --host <vm>   # ship cloud/host/** to a VM + restart
studio sync --dir <dir> --host <vm>
```

## Working on the cloud host

Changes to `cloud/host/**` are proven against a live VM, not just by unit
tests:

1. `studio host-deploy --host <vm>` (lab VMs like `studio-lab-3.exe.xyz` are
   disposable; never restart services on shared VMs without coordinating).
2. Headless-render the affected pages with puppeteer and assert content and
   computed styles — "the route returned 200" is not proof. Screenshots for
   anything visual.
3. `bun test` must stay green.

Host architecture facts that bite:

- React is a platform singleton: never alias bare `react` imports to a
  directory — it splits the instance from Vite's optimized chunk and hooks
  throw. All studios share the host's optimized deps.
- Tailwind runs per studio from the studio's own `node_modules` and config;
  content globs must be absolutized because tailwind resolves them against
  the process cwd.
- The host binds the VM's tailnet IP, not loopback. Probe
  `http://$(tailscale ip -4 | head -1):43215` from the VM, or the tailnet
  address from anywhere on the tailnet.
- Block comments must not contain glob sequences like `app/**/page.tsx` —
  the `*/` inside terminates the comment.

## Studio collaboration loop

Studios are real source trees in private git repos (`~/studios/<id>` on the
VM, mirrored locally). `studio sync` commits local edits, fetches the cloud
agent's commits, rebases, and pushes. Never force-push a studio repo; never
ship `node_modules` or build output; keep studio repos gitignored from their
parent projects.

## Secrets

Credentials live in the macOS keychain via `~/.local/bin/secret`
(`secret get KEY`, `secret run KEY -- cmd`). Never read dotenv files with
file tools, never pass secrets as argv, never print them. If a secret leaks
into a transcript or log, stop and tell the operator to rotate.

## Documentation

Docs are kept with [Dewey](https://github.com/arach/dewey). Guides and
references in `docs/` build the public docs site and `llms.txt`; `*.agent.md`
maps describe source areas for agents. After changing a covered area, update
its map, run `dewey review <doc>`, then `dewey build` and `dewey check`.

## Commits

Gitmoji prefix (`✨` feature, `🚑` fix, `📝` docs, `♻️` refactor). No
co-author footers, no "Generated with" lines.

<!-- dewey:begin observed -->
## Commands

- `bun run build:site`
- `bun run dev`
- `bun run dev:raw`
- `bun run dev:site`
- `bun run flows:serve`
- `bun run flows:smoke`
- `bun run local`
- `bun run local:edge`
- `bun run local:serve`
- `bun run test`
- `bun run typecheck`

## Where to work

- Working on `.` → read `docs/local-host.agent.md`.
- Working on `apps/studio/src/studio` → read `docs/studio-app.agent.md`.
- Working on `src` → read `docs/local-host.agent.md`.
- Working on `src/agents` → read `docs/collaboration.agent.md`.
- Working on `src/app-shell` → read `docs/ui-primitives.agent.md`.
- Working on `src/artifacts` → read `docs/artifacts.agent.md`.
- Working on `src/atoms` → read `docs/ui-primitives.agent.md`.
- Working on `src/code` → read `docs/viewers.agent.md`.
- Working on `src/components` → read `docs/local-host.agent.md`.
- Working on `src/doc` → read `docs/viewers.agent.md`.
- Working on `src/feedback` → read `docs/collaboration.agent.md`.
- Working on `src/flows` → read `docs/local-host.agent.md`.
- Working on `src/injection` → read `docs/ui-primitives.agent.md`.
- Working on `src/local` → read `docs/local-host.agent.md`.
- Working on `src/registry` → read `docs/ui-primitives.agent.md`.
- Working on `src/router` → read `docs/ui-primitives.agent.md`.
- Working on `src/scout` → read `docs/collaboration.agent.md`.
- Working on `src/shell` → read `docs/ui-primitives.agent.md`.
- Working on `src/theme` → read `docs/ui-primitives.agent.md`.

## Documentation loop

- Read `.agents/skills/dewey-author/SKILL.md` when maintaining docs.
- Run `dewey build`, then `dewey check`.
- Review covered-code changes with `dewey review <document>`.
- Site output: `.dewey/site/`; agent index: `llms.txt`.
<!-- dewey:end observed -->
