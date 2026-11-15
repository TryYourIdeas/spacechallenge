#!/usr/bin/env bash
# Imports a CSV file into the PostgreSQL database named by DATABASE_URL
# (environment, else backend/docker/.env). Usage: scripts/import_csv.sh <file.csv>
set -euo pipefail
[ $# -eq 1 ] || { echo "Usage: $0 <file.csv>" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
cd "$root/frontend"
exec npm run --silent import -- "$file"
