#!/usr/bin/env bash
# Test di ripristino (ADR 0040): decifra un backup, lo ripristina in un Postgres
# Supabase locale nel runner e confronta i conteggi con il manifest.
# Uso: restore-verify.sh <file .tar.gz.gpg>    Variabili: BACKUP_PASSPHRASE
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tables.sh
source "$here/tables.sh"
file="${1:?file del backup}"
: "${BACKUP_PASSPHRASE:?}"
work="$(mktemp -d)"
project="$(mktemp -d)"

if [ -f "$file.sha256" ] && [ "$(sha256sum "$file" | cut -d' ' -f1)" != "$(cat "$file.sha256")" ]; then
  echo "::error::SHA-256 del backup diverso da quello registrato"
  exit 1
fi
gpg --batch --pinentry-mode loopback --decrypt --passphrase-fd 3 "$file" 3<<<"$BACKUP_PASSPHRASE" \
  | tar -C "$work" -xzf -
for f in roles.sql schema.sql data.sql; do
  expected="$(jq -r --arg f "$f" '.sha256[$f]' "$work/backup/manifest.json")"
  if [ "$(sha256sum "$work/backup/$f" | cut -d' ' -f1)" != "$expected" ]; then
    echo "::error::SHA-256 di $f diverso dal manifest"
    exit 1
  fi
done
echo "Decifratura e integrità dei file: OK"

# Postgres Supabase locale vuoto (stessi ruoli e schemi di base di un progetto nuovo).
supabase init --workdir "$project" >/dev/null
supabase db start --workdir "$project"
db="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Procedura di ripristino della documentazione Supabase: ruoli, schema, dati.
psql --single-transaction --variable ON_ERROR_STOP=1 --quiet \
  --file "$work/backup/roles.sql" \
  --file "$work/backup/schema.sql" \
  --command "SET session_replication_role = replica" \
  --file "$work/backup/data.sql" \
  --dbname "$db" >/dev/null

fail=0
for t in "${BACKUP_TABLES[@]}"; do
  expected="$(jq -r --arg t "$t" '.row_counts[$t] // 0' "$work/backup/manifest.json")"
  restored="$(psql -tA --dbname "$db" -c "select count(*) from public.$t")"
  diff=$((restored - expected))
  tolerance=$((expected / 100 + 5))
  status="OK"
  if [ "$expected" -gt 0 ] && [ "$restored" -eq 0 ]; then status="KO"; fi
  if [ "${diff#-}" -gt "$tolerance" ]; then status="KO"; fi
  if [ "$status" = "KO" ]; then fail=1; fi
  printf '%-3s %-20s manifest=%-8s ripristinate=%s\n' "$status" "$t" "$expected" "$restored"
done
policies="$(psql -tA --dbname "$db" -c "select count(*) from pg_policies where schemaname = 'public'")"
rls_off="$(psql -tA --dbname "$db" -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")"
echo "Policy RLS ripristinate: $policies; tabelle public senza RLS: $rls_off"
if [ "$policies" -eq 0 ] || [ "$rls_off" -ne 0 ]; then fail=1; fi
supabase stop --workdir "$project" --no-backup >/dev/null 2>&1 || true
if [ "$fail" -ne 0 ]; then
  echo "::error::Test di ripristino NON superato"
  exit 1
fi
echo "Test di ripristino superato"
