#!/usr/bin/env bash
# Converts a GeoJSON file to a CSV with lat and lon columns (written beside it unless
# an output path is given). Usage: scripts/geojson_to_csv.sh <file.geojson> [out.csv]
set -euo pipefail
{ [ $# -ge 1 ] && [ $# -le 2 ]; } || { echo "Usage: $0 <file.geojson> [out.csv]" >&2; exit 2; }
root="$(cd "$(dirname "$0")/.." && pwd)"
abs() { echo "$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; }
args=("$(abs "$1")"); [ $# -eq 2 ] && args+=("$(abs "$2")")
cd "$root/frontend"
exec npm run --silent geojson-to-csv -- "${args[@]}"
