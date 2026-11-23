#!/usr/bin/env bash
# Versione mostrata nel sito, calcolata al deploy dalla storia git (ADR 0066).
# Nessun commit di versione: ogni deploy ha il suo numero senza far ripartire le pipeline.
#
#   PROD (main): MAGGIORE.(MINORE base + merge su main dopo la base).0
#   DEV  (dev):  MAGGIORE.(minore di PROD).(commit di dev non ancora su main)
#
# La base è in apps/web/release.json: la versione di PROD in un commit di main. Uso:
#   scripts/release/version.sh prod|dev
# Serve la storia di main e del branch (checkout con fetch-depth: 0).
set -euo pipefail

env_name="${1:?uso: version.sh prod|dev}"
root="$(git rev-parse --show-toplevel)"
base_file="$root/apps/web/release.json"
base_version="$(sed -n 's/.*"version": *"\([0-9.]*\)".*/\1/p' "$base_file")"
base_commit="$(sed -n 's/.*"mainCommit": *"\([0-9a-f]*\)".*/\1/p' "$base_file")"
major="${base_version%%.*}"
rest="${base_version#*.}"
minor="${rest%%.*}"

main_ref="origin/main"
git rev-parse --verify --quiet "$main_ref" >/dev/null || main_ref="HEAD"

case "$env_name" in
  prod)
    merges="$(git rev-list --count --first-parent "$base_commit..HEAD")"
    echo "$major.$((minor + merges)).0"
    ;;
  dev)
    merges="$(git rev-list --count --first-parent "$base_commit..$main_ref")"
    pending="$(git rev-list --count --first-parent "$main_ref..HEAD")"
    echo "$major.$((minor + merges)).$pending"
    ;;
  *)
    echo "Ambiente sconosciuto: $env_name" >&2
    exit 2
    ;;
esac
