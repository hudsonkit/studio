#!/usr/bin/env bash
# studio dev helpers — single allowlist target for repetitive ops
#
# Usage: ./dev.sh <command> [args]
#
# Commands:
#   dev                  Start studio-dev Next server (port 3210)
#   typecheck            Typecheck studio + studio-dev
#   install              bun install in studio-dev (which symlinks studio + hudsonkit)
#   reinstall            Wipe node_modules + bun.lock in studio and studio-dev, then install
#   status               Report symlink + typecheck state across studio / studio-dev / hudsonkit
#   lattices:reinstall   Wipe + reinstall lattices (will fail until lattices adds hudsonkit to workspaces)
#   help                 This message

set -euo pipefail

STUDIO_DIR="$(cd "$(dirname "$0")" && pwd)"
STUDIO_DEV_DIR="$(cd "$STUDIO_DIR/../studio-dev" && pwd)"
HUDSONKIT_DIR="$(cd "$STUDIO_DIR/../hudson/packages/web/hudsonkit" && pwd)"
LATTICES_DIR="/Users/arach/dev/lattices"

cmd="${1:-help}"
shift || true

case "$cmd" in
  dev)
    cd "$STUDIO_DEV_DIR"
    exec bun dev
    ;;

  typecheck)
    echo "→ typecheck studio"
    (cd "$STUDIO_DIR" && bun run typecheck)
    echo "→ typecheck studio-dev"
    (cd "$STUDIO_DEV_DIR" && bun run typecheck)
    ;;

  install)
    cd "$STUDIO_DEV_DIR"
    bun install
    ;;

  reinstall)
    echo "→ wiping studio and studio-dev install state"
    rm -rf "$STUDIO_DIR/node_modules" "$STUDIO_DIR/bun.lock"
    rm -rf "$STUDIO_DEV_DIR/node_modules" "$STUDIO_DEV_DIR/bun.lock"
    cd "$STUDIO_DEV_DIR"
    bun install
    ;;

  status)
    echo "studio:       $STUDIO_DIR"
    echo "studio-dev:   $STUDIO_DEV_DIR"
    echo "hudsonkit:    $HUDSONKIT_DIR"
    echo
    echo "→ symlinks in studio-dev/node_modules"
    for pkg in studio hudsonkit; do
      link="$STUDIO_DEV_DIR/node_modules/$pkg"
      if [ -L "$link" ]; then
        printf "  %-10s → %s\n" "$pkg" "$(readlink "$link")"
      else
        printf "  %-10s MISSING\n" "$pkg"
      fi
    done
    echo
    echo "→ typecheck studio"
    (cd "$STUDIO_DIR" && bun run typecheck) && echo "  clean"
    echo "→ typecheck studio-dev"
    (cd "$STUDIO_DEV_DIR" && bun run typecheck) && echo "  clean"
    ;;

  lattices:reinstall)
    if [ ! -d "$LATTICES_DIR" ]; then
      echo "lattices not found at $LATTICES_DIR" >&2
      exit 1
    fi
    echo "⚠  This will fail unless lattices' package.json workspaces includes:"
    echo "     \"../hudson/packages/web/hudsonkit\""
    echo "   (studio now declares hudsonkit: workspace:*)"
    echo
    cd "$LATTICES_DIR"
    rm -rf node_modules bun.lock
    bun install 2>&1 | tail -10
    ;;

  help|-h|--help)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    ;;

  *)
    echo "unknown command: $cmd" >&2
    echo "run './dev.sh help' for usage" >&2
    exit 1
    ;;
esac
