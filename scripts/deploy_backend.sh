#!/usr/bin/env bash
# Deploy any Docker-based backend to a persistent Linux VM.
set -euo pipefail
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
fail() { printf 'deploy_backend: %s\n' "$*" >&2; exit 1; }
if [[ ${1:-} == --help ]]; then
  cat <<'HELP'
Usage: BACKEND_SSH_HOST=deploy@vm BACKEND_DEPLOY_DIR=/srv/my-team \
       BACKEND_DOMAIN=api.example.com bash scripts/deploy_backend.sh [--dry-run]

Requires an existing Linux VM, SSH access, Docker with Compose, and persistent
disk. Uses SSH config for authentication. Optional: BACKEND_SSH_PORT,
BACKEND_PROJECT_NAME, BACKEND_HEALTH_PATH (default /).
--dry-run prints the deployment plan without connecting to the VM.
HELP
  exit 0
fi
[[ $# == 0 || ( $# == 1 && "$1" == --dry-run ) ]] || fail 'use --help'
host=${BACKEND_SSH_HOST:-}
directory=${BACKEND_DEPLOY_DIR:-}
domain=${BACKEND_DOMAIN:-}
project=${BACKEND_PROJECT_NAME:-}
health_path=${BACKEND_HEALTH_PATH:-/}
if [[ -z "$project" ]]; then
  project="$(printf '%s' "${PROJECT_ROOT##*/}" | LC_ALL=C tr '[:upper:]' '[:lower:]' | LC_ALL=C tr -cs 'a-z0-9_-' '-')"
  case "$project" in [a-z0-9]*) ;; *) project="project-$project" ;; esac
fi
# Arguments cross SSH's remote-shell boundary. Use an SSH-config alias for
# IPv6 or complex hosts; remote paths intentionally exclude shell metacharacters.
[[ "$host" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || fail 'set BACKEND_SSH_HOST to an SSH alias or user@hostname'
[[ "$directory" =~ ^/[a-zA-Z0-9_./-]+$ && "$directory" != / && "$directory" != */ ]] || fail 'set BACKEND_DEPLOY_DIR to an absolute path without spaces or trailing slash'
case "/$directory/" in */../*|*/./*) fail 'deployment path must not contain . or .. components' ;; esac
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ && "$domain" == *.* ]] || fail 'set BACKEND_DOMAIN to the API hostname, without scheme or port'
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || fail 'BACKEND_PROJECT_NAME must be a lowercase Compose project name'
[[ "$health_path" =~ ^/[a-zA-Z0-9/_.~-]*$ ]] || fail 'BACKEND_HEALTH_PATH must be a simple absolute HTTP path'
ssh_options=(-o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10)
if [[ -n "${BACKEND_SSH_PORT:-}" ]]; then
  [[ "$BACKEND_SSH_PORT" =~ ^[0-9]+$ && ${#BACKEND_SSH_PORT} -le 5 ]] || fail 'invalid BACKEND_SSH_PORT'
  (( 10#$BACKEND_SSH_PORT >= 1 && 10#$BACKEND_SSH_PORT <= 65535 )) || fail 'invalid BACKEND_SSH_PORT'
  ssh_options+=(-p "$BACKEND_SSH_PORT")
fi
if [[ ${1:-} == --dry-run ]]; then
  printf 'Host: %s\nDirectory: %s\nCompose project: %s\nAPI: https://%s%s\n' "$host" "$directory" "$project" "$domain" "$health_path"
  printf 'Plan: upload backend source, preserve server secrets and volumes, build/start all services, verify HTTPS.\n'
  exit 0
fi
for dependency in ssh rsync; do command -v "$dependency" >/dev/null 2>&1 || fail "install $dependency first"; done
release="$(date -u +%Y%m%dT%H%M%SZ)-$$-$RANDOM"
remote="bash -s -- '$directory' '$project' '$release' '$domain' '$health_path'"
# shellcheck disable=SC2029 # All remote arguments are validated and individually quoted above.
ssh "${ssh_options[@]}" "$host" "$remote" <<'PREPARE'
set -euo pipefail
for dependency in docker rsync openssl flock curl; do
  command -v "$dependency" >/dev/null || { printf 'Install %s on the VM first.\n' "$dependency" >&2; exit 1; }
done
docker info >/dev/null
docker compose version
mkdir -p -- "$1/shared" "$1/releases/$3"
chmod 700 "$1/shared"
PREPARE
printf -v transport '%q ' ssh "${ssh_options[@]}"
rsync -az -e "$transport" \
  --include=.env.example --exclude='.env*' --exclude='.dev.vars*' \
  --exclude=.git/ --exclude=node_modules/ --exclude=.venv/ --exclude=__pycache__/ \
  --exclude=compose.local.yaml \
  "$PROJECT_ROOT/backend/" "$host:$directory/releases/$release/"
# Source releases change; server secrets and project-scoped volumes stay stable.
# shellcheck disable=SC2029 # Same validated command; stdin carries the remote script.
ssh "${ssh_options[@]}" "$host" "$remote" < "$PROJECT_ROOT/scripts/vm_activate.sh"
