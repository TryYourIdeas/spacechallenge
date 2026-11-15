#!/usr/bin/env bash
# Run on the VM by deploy_backend.sh; no laptop credentials are copied here.
set -euo pipefail
root=$1 project=$2 release=$3 domain=$4 health_path=$5
exec 9> "$root/deploy.lock"
flock -n 9 || { printf 'Another deployment is active. Retry after it finishes.\n' >&2; exit 1; }
umask 077
identity="$root/shared/compose-project"
environment="$root/shared/backend.env"
if [[ -e "$identity" && ! -f "$environment" ]]; then
  printf 'Existing deployment is missing its environment file; restore the server secrets before deploying.\n' >&2
  exit 1
fi
if [[ -f "$identity" && "$(cat "$identity")" != "$project" ]]; then
  printf 'Compose project name differs from the existing deployment; refusing to switch data volumes.\n' >&2
  exit 1
fi
printf '%s\n' "$project" > "$identity"
if [[ ! -e "$environment" ]]; then
  password="$(openssl rand -hex 24)"
  sed '/^POSTGRES_PASSWORD=/d' "$root/releases/$release/backend/docker/.env.example" > "$environment"
  printf '\nPOSTGRES_PASSWORD=%s\n' "$password" >> "$environment"
  unset password
fi
[[ -f "$environment" ]] || { printf 'Expected a regular server environment file.\n' >&2; exit 1; }
chmod 600 "$environment"
temporary="$(mktemp "$root/shared/env.XXXXXXXX")"
trap 'rm -f -- "$temporary"' EXIT
sed '/^BACKEND_DOMAIN=/d' "$environment" > "$temporary"
printf '\nBACKEND_DOMAIN=%s\n' "$domain" >> "$temporary"
mv -- "$temporary" "$environment"
ln -s "$environment" "$root/releases/$release/backend/docker/.env"
compose=(env COMPOSE_PROJECT_NAME="$project" bash "$root/releases/$release/backend/docker/compose.sh")
export BACKEND_DEPLOYMENT=vm
"${compose[@]}" config --quiet
"${compose[@]}" pull --ignore-buildable
"${compose[@]}" up --detach --build --wait --wait-timeout 180 --remove-orphans
if ! curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors \
    --max-time 10 --output /dev/null "https://$domain$health_path"; then
  printf 'HTTPS health check failed. Inspect services before retrying; no data volumes were removed.\n' >&2
  exit 1
fi
# current records the last successful deploy; failure does not update it.
if [[ -e "$root/current" && ! -L "$root/current" ]]; then
  printf 'Expected current to be a release symlink.\n' >&2
  exit 1
fi
ln -sfn "releases/$release" "$root/current"
"${compose[@]}" ps
printf 'Backend deployed at https://%s\n' "$domain"
