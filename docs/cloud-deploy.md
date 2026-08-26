# Cloud deploy

> Shipping design studios to a VM's multi-studio host? See
> `docs/cloud-studios.md` — this document covers the platform app deploy
> (`studio.service`, releases under `~/studio-cloud/<release-id>`).

Studio runs as one application server on an exe.dev VM, reachable only over
tailscale. The VM is the compute host: it installs dependencies, builds the
Next app, and serves the current release. The local machine only ships
sources over SSH.

## Layout on the VM

```
~/studio-cloud/<release-id>/studio/                 this repository
~/studio-cloud/<release-id>/hudson/…/hudsonkit/     workspace dependency (dist included)
~/studio-cloud/<release-id>/lattices/design/studio/ workspace dependency
~/studio-cloud/<release-id>/action/design/studio/   manifest only (not imported by the build)
~/studio-cloud/current -> <release-id>              atomic flip target
```

A `studio.service` systemd unit runs `next start` from
`current/studio/apps/studio`, bound to the VM's tailnet IPv4 on port 43210.

## Commands

```sh
studio deploy                 # ship, install, build, flip, restart, health check
studio deploy --skip-build    # update sources in the current built release, restart
studio deploy --host <vm> --port <p> --keep <n> --json
```

Deploy prints the served URL and fails if the health check does not return a
non-empty body from this machine over the tailnet.

## Notes

- Releases are timestamped (`YYYYMMDD-HHMMSS-<sha>`); the deploy keeps the
  newest five and prunes the rest.
- External workspace members resolve from their real paths, so the deploy
  links the hoisted `node_modules` to the release root. Without that link,
  bundlers cannot resolve `hudsonkit/*` from `~/studio-cloud/<id>/hudson/…`.
- Turbopack is attempted first; if it fails the deploy falls back to
  `next build --webpack` and fails only when both fail.
- The build runs on the VM; local resources are not used beyond rsync.

## Scout peer on the VM

The VM runs a Scout broker (tmux session `openscout-broker-byok`) and an
`exedev` agent backed by omp on the shared opencode-go account. Bring-up
order that works on a headless Linux node:

```sh
scout mesh bind local        # withdraw any wedged advertise scope
# restart the broker, then:
scout mesh announce          # opens mesh TLS on non-loopback addresses
scout mesh enroll ssh://…    # from the peer; exchanges cards + SPKI pins
scout restart                # spawns configured agents (relay-* tmux sessions)
```

Ask the agent with the short id (`scout ask --to exedev …`); the qualified
sender-id form (`exedev.ocean-iron`) is not a routable target.

Known upstream gap: mesh discovery probes candidate `/v1/node` URLs with a
plain fetch and never applies the enrolled SPKI pin, so self-signed peers are
rejected before registration. Until that is fixed upstream, register the VM
node once by hand:

```sh
curl -sk https://<vm-tailnet-ip>:43110/v1/node            # fetch its card
curl -s http://127.0.0.1:43110/v1/nodes -d '{…}'          # POST /v1/nodes
```

Use the VM's tailnet address as `brokerUrl` — the VM advertises its LAN IP
first, which is unreachable from remote peers.
