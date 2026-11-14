#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=templates/scripts/cloudflare.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/cloudflare.sh"

if [[ ${1:-} == --help ]]; then
  printf 'Usage: FRONTEND_OUTPUT_DIR=frontend/dist PAGES_PROJECT_NAME=my-team bash scripts/deploy_frontend.sh\n'
  printf 'Optional: FRONTEND_BUILD_COMMAND (runs in frontend/), PAGES_BRANCH (default main).\n'
  exit 0
fi
[[ $# == 0 ]] || { printf 'Unexpected argument. Use --help.\n' >&2; exit 1; }
if [[ -z "${FRONTEND_OUTPUT_DIR:-}" || -z "${PAGES_PROJECT_NAME:-}" ]]; then
  printf 'Set FRONTEND_OUTPUT_DIR and PAGES_PROJECT_NAME. Run with --help for an example.\n' >&2
  exit 1
fi
if [[ -n "${FRONTEND_BUILD_COMMAND:-}" ]]; then
  (cd "$PROJECT_ROOT/frontend"; bash -euo pipefail -c "$FRONTEND_BUILD_COMMAND")
fi
output=$FRONTEND_OUTPUT_DIR
[[ "$output" == /* ]] || output="$PROJECT_ROOT/$output"
[[ -d "$output" && -f "$output/index.html" ]] || {
  printf 'Build a static frontend first; index.html is missing from %s\n' "$output" >&2
  exit 1
}
# No backend code, source directory, or secrets are uploaded as a fallback.
run_wrangler pages deploy "$output" --project-name "$PAGES_PROJECT_NAME" --branch "${PAGES_BRANCH:-main}"
