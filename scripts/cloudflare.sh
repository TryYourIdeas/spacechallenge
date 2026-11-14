#!/usr/bin/env bash
# Shared deploy tooling; application build tools remain the team's choice.
set -euo pipefail
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
export PROJECT_ROOT
WRANGLER_VERSION=4.161.0

run_wrangler() {
  if [[ -n "${WRANGLER_BIN:-}" ]]; then
    "$WRANGLER_BIN" "$@"
  else
    command -v npx >/dev/null 2>&1 || {
      printf 'Install Node.js with npm for the Cloudflare CLI, or set WRANGLER_BIN.\n' >&2
      return 1
    }
    npx --yes "wrangler@$WRANGLER_VERSION" "$@"
  fi
}
