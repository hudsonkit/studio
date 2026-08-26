#!/usr/bin/env bash
#
# studio bootstrap — provision a fresh exe.dev (or any Debian/Ubuntu) VM into
# a full cloud studio workshop, from source. Run from the operator machine:
#
#   studio bootstrap --host <new-vm> [--with-agent]
#
# Idempotent: safe to re-run. Assumes passwordless sudo and key-based SSH,
# and that the VM is joined to your tailscale network (the script checks and
# exits with instructions if not).
#
# Installs:
#   1. git, curl, xz-utils (apt)
#   2. Node 22 (user-local tarball)  — needed by Next tooling
#   3. Bun                            — runtime + package manager
#   4. The studio repository          — rsynced from this machine, built on the VM
#   5. studio.service (platform app)  + studio-host.service (multi-studio host)
#   6. [--with-agent] omp + opencode-go credentials + Scout broker + agent manifest
#
set -euo pipefail

HOST="ocean-iron.exe.xyz"
WITH_AGENT=0
NO_TAILSCALE=0

USER="${USER:-$(id -un)}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2;;
    --user) USER="$2"; shift 2;;
    --with-agent) WITH_AGENT=1; shift;;
    --no-tailscale) NO_TAILSCALE=1; shift;;
    --help|-h) WITH_HELP=1; break;;
    *) echo "unknown flag: $1"; exit 1;;
  esac
done
WITH_HELP="${WITH_HELP:-0}"

log() { printf '==> %s\n' "$*"; }
vm() { ssh -o BatchMode=yes "${USER:+$USER@}$HOST" "$@"; }
BIND="127.0.0.1"
if [[ "$NO_TAILSCALE" != "1" ]]; then
  if vm 'tailscale ip -4 2>/dev/null | grep -q 100.'; then
    log "Tailscale already connected"
  else
    AUTHKEY=""
    if command -v "$HOME/.local/bin/secret" >/dev/null 2>&1; then
      AUTHKEY=$("$HOME/.local/bin/secret" get TAILSCALE_AUTHKEY 2>/dev/null || true)
    fi
    if [[ -n "$AUTHKEY" ]]; then
      log "Joining tailscale with stored auth key"
      printf '%s' "$AUTHKEY" | vm 'umask 077; cat > ~/.studio-ts.key; sudo systemctl start tailscaled 2>/dev/null || (sudo tailscaled --tun=userspace-networking >/dev/null 2>&1 &); sleep 1; sudo tailscale up --auth-key=file:$HOME/.studio-ts.key >/dev/null 2>&1; rm -f ~/.studio-ts.key'
      vm 'sudo tailscale ip -4 | grep -q 100.' || { echo "auth key rejected or expired"; exit 1; }
    else
      vm 'sudo systemctl start tailscaled 2>/dev/null || true; sudo tailscale login > /tmp/ts-login.log 2>&1 &'
      sleep 8
      AUTH_URL=$(vm 'grep -oE "https://login.tailscale.com[a-zA-Z0-9/._-]*" /tmp/ts-login.log 2>/dev/null | head -1')
      echo "tailscale needs interactive auth. Visit: ${AUTH_URL:-<see /tmp/ts-login.log on the VM>}"
      echo "Re-run after approving (or store a reusable key: secret set TAILSCALE_AUTHKEY)."
      exit 1
    fi
    vm 'sudo tailscale ip -4 | grep -q 100.' || { echo "tailscale did not join"; exit 1; }
  fi
fi

VM_USER=$(vm 'whoami')
VM_HOME=$(vm 'echo $HOME')

log "Installing base packages"
vm 'sudo apt-get update -qq && sudo apt-get install -y -qq git curl xz-utils >/dev/null; echo base-ok'

log "Installing Bun"
vm 'command -v bun >/dev/null || (curl -fsSL https://bun.sh/install | bash) >/dev/null 2>&1; ~/.bun/bin/bun --version'

log "Installing Node 22 (user-local)"
vm '
mkdir -p ~/.local/node
if [ ! -x ~/.local/node/bin/node ]; then
  cd /tmp
  curl -fsSL -o node.tar.xz https://nodejs.org/dist/v22.20.0/node-v22.20.0-linux-x64.tar.xz
  tar -xJf node.tar.xz -C ~/.local/node --strip-components=1
  rm node.tar.xz
fi
~/.local/node/bin/node --version'

DEST="${USER:+$USER@}$HOST"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log "Shipping studio repository"
STUDIO_DEST="studio-cloud/bootstrap"
vm "mkdir -p ~/$STUDIO_DEST/studio ~/$STUDIO_DEST/hudson/packages/web/hudsonkit ~/$STUDIO_DEST/lattices/design/studio ~/$STUDIO_DEST/action/design/studio"
rsync_excludes=(--exclude node_modules --exclude .next --exclude .git --exclude '*.tsbuildinfo' --exclude .DS_Store)
rsync -az --delete "${rsync_excludes[@]}" "$REPO_ROOT/" "$DEST:$STUDIO_DEST/studio/"
rsync -az --delete "${rsync_excludes[@]/.next/}" "$REPO_ROOT/../hudson/packages/web/hudsonkit/" "$DEST:$STUDIO_DEST/hudson/packages/web/hudsonkit/"
rsync -az --delete --exclude node_modules --exclude .git --exclude .DS_Store \
  "$REPO_ROOT/../lattices/design/studio/" "$DEST:$STUDIO_DEST/lattices/design/studio/"
rsync -az "$REPO_ROOT/../action/design/studio/package.json" \
  "$DEST:$STUDIO_DEST/action/design/studio/package.json"

log "Installing dependencies and building platform app"
vm "export PATH=\"\$HOME/.local/node/bin:\$HOME/.bun/bin:\$PATH\"
cd ~/$STUDIO_DEST
ln -sfn studio/node_modules node_modules
cd studio
bun install
bun run --cwd apps/studio build 2>&1 || bun run --cwd apps/studio build --webpack 2>&1"

log "Installing platform + host services"
vm "sudo tee /etc/systemd/system/studio.service >/dev/null <<UNIT
[Unit]
Description=Studio application server
After=network-online.target

[Service]
User=$VM_USER
WorkingDirectory=$VM_HOME/$STUDIO_DEST/studio/apps/studio
Environment=STUDIO_HOST=$BIND
Environment=STUDIO_PORT=43210
ExecStart=$VM_HOME/.local/node/bin/node $VM_HOME/$STUDIO_DEST/studio/node_modules/next/dist/bin/next start -H $BIND -p 43210
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now studio >/dev/null"

vm "sudo tee /etc/systemd/system/studio-host.service >/dev/null <<UNIT
[Unit]
Description=Studio cloud host (multi-studio Vite server)
After=network-online.target

[Service]
User=$VM_USER
WorkingDirectory=$VM_HOME/$STUDIO_DEST/studio
Environment=STUDIOS_DIR=$VM_HOME/studios
Environment=STUDIO_HOST_BIND=$BIND
Environment=STUDIO_HOST_PORT=43215
Environment=PATH=$VM_HOME/.local/node/bin:$VM_HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$VM_HOME/.bun/bin/bun cloud/host/main.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload && sudo systemctl enable --now studio-host >/dev/null"


log "Installing nginx front door (port 80 → studio host)"
vm 'sudo apt-get install -y -qq nginx >/dev/null 2>&1; sudo tee /etc/nginx/sites-available/studio >/dev/null <<NGINX
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:43215;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 1h;
    }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/studio /etc/nginx/sites-enabled/studio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable --now nginx >/dev/null 2>&1 && sudo systemctl reload nginx'
if [[ "$WITH_AGENT" == "1" ]]; then
  log "Installing omp harness + opencode-go credentials"
  vm 'export PATH="$HOME/.bun/bin:$PATH"
bun install -g @oh-my-pi/pi-coding-agent >/dev/null 2>&1
omp --version'
  ~/.local/bin/secret get OPENCODE_GO_API_KEY | vm 'umask 077; mkdir -p ~/.config
printf "export OPENCODE_API_KEY=%s\nexport OMPCODE=1\n" "$(cat)" > ~/.config/opencode-go.env
chmod 600 ~/.config/opencode-go.env
grep -q opencode-go.env ~/.bashrc || echo ". ~/.config/opencode-go.env" >> ~/.bashrc'

  log "Installing omp model config + self-test"
  vm 'mkdir -p ~/.omp/agent
cat > ~/.omp/agent/config.yml <<EOF
modelRoles:
  default: opencode-go/ox-alpha-free:high
  advisor: opencode-go/ox-alpha-free:max
  designer: opencode-go/ox-alpha-free:max
symbolPreset: unicode
setupVersion: 2
EOF
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$PATH"
. ~/.config/opencode-go.env
timeout 120 omp -p "Reply with exactly: $(hostname) omp online" </dev/null 2>&1 | tail -1'

  log "Installing Scout broker + agent manifest"
  vm 'export PATH="$HOME/.bun/bin:$PATH"
command -v scout >/dev/null || bun install -g @openscout/scout >/dev/null 2>&1
scout version
tmux has-session -t openscout-broker-byok 2>/dev/null || \
  tmux new-session -d -s openscout-broker-byok env PATH="$HOME/.bun/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin" \
  "$HOME/.bun/bin/bun" "$HOME/.bun/install/global/node_modules/@openscout/scout/bin/openscout-runtime.mjs" broker
sleep 4
curl -sf http://127.0.0.1:43110/health >/dev/null && echo broker-up
mkdir -p ~/.openscout
[ -f ~/.openscout/project.json ] || cat > ~/.openscout/project.json <<JSON
{
  "version": 1,
  "project": { "id": "exedev", "name": "Exedev", "root": "." },
  "agent": {
    "id": "exedev",
    "displayName": "Exedev",
    "prompt": {},
    "runtime": {
      "defaultHarness": "pi",
      "profiles": { "pi": { "cwd": ".", "transport": "tmux", "sessionId": "relay-exedev-pi", "launchArgs": [] } }
    }
  }
}
JSON
# omp-backed pi shim (scout launches harness "pi" by catalog binary name)
cat > ~/.bun/bin/pi <<'"'"'SHIM'"'"'
#!/usr/bin/env bash
. "$HOME/.config/opencode-go.env"
exec "$HOME/.bun/bin/omp" "$@"
SHIM
chmod +x ~/.bun/bin/pi
scout restart >/dev/null 2>&1 || true'
fi

log "Health checks"
sleep 3
vm "curl -sf -m 5 http://127.0.0.1:43210/ >/dev/null && echo platform-ok
curl -sf -m 5 http://127.0.0.1:80/api/health && echo"

echo
echo "Bootstrap complete on $HOST"
echo "  Studio host  : http://$HOST/   (studios land in ~/studios/<id>/)"
echo "  Platform app : http://$BIND:43210/"
[[ "$NO_TAILSCALE" == "1" ]] && echo "  (loopback mode: ssh -L 80:127.0.0.1:80 -L 43210:127.0.0.1:43210 $DEST)"
echo "  Ship a studio: git remote add vm $DEST:studios/<id> && git push vm main"
if [[ "$WITH_AGENT" == "1" ]]; then
  echo "  Agent        : scout ask --to exedev   (from the VM; after mesh enrollment, routable fleet-wide)"
fi
exit 0
