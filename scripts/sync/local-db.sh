#!/usr/bin/env bash
# Database temporaneo con lo schema di PREDICTRA, per provare la copia tra ambienti
# senza toccare PROD (ADR 0055). Ruoli e schema `auth` minimi di Supabase, poi tutte
# le migrazioni del repository. Uso: local-db.sh <url del database vuoto>
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
db="${1:?url del database}"
run() { psql "$db" --no-psqlrc --quiet --variable ON_ERROR_STOP=1 "$@" >/dev/null; }
# I ruoli valgono per tutto il server: se esistono già si saltano.
sed '/^create role /d' "$root/supabase/tests/supabase-stub.sql" > /tmp/predictra-stub.sql
for r in anon authenticated service_role; do
  extra="noinherit"; [ "$r" = service_role ] && extra="noinherit bypassrls"
  run --command "do \$\$ begin create role $r nologin $extra; exception when duplicate_object then null; end \$\$"
done
run --file /tmp/predictra-stub.sql
for f in "$root"/supabase/migrations/*.sql; do run --file "$f"; done
echo "Database temporaneo pronto: $(ls "$root"/supabase/migrations/*.sql | wc -l) migrazioni applicate."
