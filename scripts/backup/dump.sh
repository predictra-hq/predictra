#!/usr/bin/env bash
# Dump cifrato del database (ADR 0040).
# Uso: dump.sh <cartella di uscita>   → stampa il percorso del file .tar.gz.gpg
# Variabili: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID, SUPABASE_DB_PASSWORD,
#            SUPABASE_SECRET_KEY, BACKUP_PASSPHRASE, ENVIRONMENT (dev|prod)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tables.sh
source "$here/tables.sh"
: "${SUPABASE_PROJECT_ID:?}" "${SUPABASE_DB_PASSWORD:?}" "${SUPABASE_SECRET_KEY:?}" "${BACKUP_PASSPHRASE:?}"
out="${1:?cartella di uscita}"
env_name="${ENVIRONMENT:-dev}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out" "$work/backup"

# Conteggi delle righe prima del dump (chiave secret: ignora la RLS).
url="https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1"
counts="{}"
for t in "${BACKUP_TABLES[@]}"; do
  total="$(curl -fsS -o /dev/null -D - "$url/$t?select=*&limit=1" \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Prefer: count=exact" \
    | tr -d '\r' | awk -F/ 'tolower($0) ~ /^content-range:/ {print $2}')"
  counts="$(jq --arg t "$t" --argjson n "${total:-0}" '. + {($t): $n}' <<<"$counts")"
done

remote=(--remote="$SUPABASE_PROJECT_ID" --password "$SUPABASE_DB_PASSWORD")
supabase db dump "${remote[@]}" --role-only -f "$work/backup/roles.sql"
supabase db dump "${remote[@]}" -f "$work/backup/schema.sql"
supabase db dump "${remote[@]}" --data-only --use-copy -f "$work/backup/data.sql"

sha() { sha256sum "$1" | cut -d' ' -f1; }
jq -n \
  --arg environment "$env_name" \
  --arg created_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg commit "${GITHUB_SHA:-unknown}" \
  --argjson counts "$counts" \
  --arg roles "$(sha "$work/backup/roles.sql")" \
  --arg schema "$(sha "$work/backup/schema.sql")" \
  --arg data "$(sha "$work/backup/data.sql")" \
  '{environment: $environment, created_at: $created_at, commit: $commit,
    row_counts: $counts,
    sha256: {"roles.sql": $roles, "schema.sql": $schema, "data.sql": $data}}' \
  > "$work/backup/manifest.json"

name="predictra-${env_name}-${stamp}.tar.gz.gpg"
tar -C "$work" -czf - backup \
  | gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 --output "$out/$name" 3<<<"$BACKUP_PASSPHRASE"
sha "$out/$name" > "$out/$name.sha256"
size() { stat -c%s "$1"; }
echo "Dimensioni (byte): roles $(size "$work/backup/roles.sql"), schema $(size "$work/backup/schema.sql"), data $(size "$work/backup/data.sql"), cifrato $(size "$out/$name")" >&2
echo "Righe: $(jq -c . <<<"$counts")" >&2
echo "$out/$name"
