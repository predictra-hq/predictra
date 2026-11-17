#!/usr/bin/env bash
# Copia dei dati calcistici e calcolati da un database Supabase a un altro (ADR 0055).
#
# Nessuna chiamata alle fonti esterne: si leggono i dati già salvati nel database di
# origine e si riscrivono, uguali (stessi id), in quello di destinazione. Nella
# destinazione si sostituiscono solo le tabelle copiate; account e dati personali
# (bankroll, giocate) restano quelli che c'erano.
#
# Uso: copy-data.sh
# Variabili:
#   SUPABASE_ACCESS_TOKEN                  token della Management API (indirizzi dei database)
#   SRC_PROJECT_ID, SRC_DB_PASSWORD        origine
#   DST_PROJECT_ID, DST_DB_PASSWORD        destinazione, oppure DST_DB_URL (es. Postgres locale)
#   WITH_SEED_TABLES=1                     copia anche lo stato dell'agente (solo avvio di PROD)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=tables.sh
source "$here/tables.sh"
if [ -z "${SRC_DB_URL:-}" ]; then
  : "${SUPABASE_ACCESS_TOKEN:?}" "${SRC_PROJECT_ID:?}" "${SRC_DB_PASSWORD:?}"
fi

# Indirizzo del pooler di Supabase (modalità session, porta 5432): il collegamento
# diretto al database è solo IPv6, che i runner di GitHub non hanno.
pooler_url() {
  local ref="$1" password="$2" config
  config="$(curl -fsS -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/$ref/config/database/pooler")"
  POOLER_CONFIG="$config" DB_PASSWORD="$password" python3 -c '
import json, os, urllib.parse
configs = json.loads(os.environ["POOLER_CONFIG"])
primary = next(c for c in configs if c.get("database_type", "PRIMARY") == "PRIMARY")
user = urllib.parse.quote(primary["db_user"], safe="")
secret = urllib.parse.quote(os.environ["DB_PASSWORD"], safe="")
host = primary["db_host"]
name = primary.get("db_name") or "postgres"
print(f"postgresql://{user}:{secret}@{host}:5432/{name}?sslmode=require")
'
}

# SRC_DB_URL e DST_DB_URL: database raggiungibili direttamente (prove in locale o nel runner).
if [ -n "${SRC_DB_URL:-}" ]; then
  src="$SRC_DB_URL"
else
  src="$(pooler_url "$SRC_PROJECT_ID" "$SRC_DB_PASSWORD")"
fi
if [ -n "${DST_DB_URL:-}" ]; then
  dst="$DST_DB_URL"
else
  : "${DST_PROJECT_ID:?}" "${DST_DB_PASSWORD:?}"
  dst="$(pooler_url "$DST_PROJECT_ID" "$DST_DB_PASSWORD")"
fi

q() { psql "$1" --no-psqlrc --quiet --tuples-only --no-align --variable ON_ERROR_STOP=1 --command "$2"; }
public_tables() { q "$1" "select tablename from pg_tables where schemaname = 'public' order by 1"; }

wanted=("${SYNC_TABLES[@]}")
if [ "${WITH_SEED_TABLES:-0}" = "1" ]; then wanted+=("${SEED_ONLY_TABLES[@]}"); fi

mapfile -t src_tables < <(public_tables "$src")
mapfile -t dst_tables < <(public_tables "$dst")
has() { local x="$1"; shift; printf '%s\n' "$@" | grep -qx "$x"; }

tables=()
for t in "${wanted[@]}"; do
  if has "$t" "${src_tables[@]}" && has "$t" "${dst_tables[@]}"; then
    tables+=("$t")
  else
    echo "::warning title=Copia dati::$t non c'è in uno dei due database: saltata"
  fi
done
[ "${#tables[@]}" -gt 0 ] || { echo "::error::Nessuna tabella da copiare"; exit 1; }

exclude=()
for t in "${src_tables[@]}"; do has "$t" "${tables[@]}" || exclude+=("public.$t"); done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Dati dell'origine: solo le tabelle copiate (le altre escluse), come istruzioni COPY.
if [ -n "${SRC_DB_URL:-}" ]; then
  # Origine locale: pg_dump con l'elenco delle tabelle.
  pg_dump "$src" --data-only --no-owner --no-privileges \
    $(printf -- '--table=public.%s ' "${tables[@]}") -f "$work/data.sql"
else
  # Progetto Supabase: la CLI usa un pg_dump della stessa versione del database.
  exclude_csv="$(IFS=,; echo "${exclude[*]}")"
  supabase db dump --remote="$SRC_PROJECT_ID" --password "$SRC_DB_PASSWORD" \
    --data-only --use-copy --schema public ${exclude_csv:+--exclude "$exclude_csv"} \
    -f "$work/data.sql"
fi

# Caricamento in un'unica transazione: se qualcosa va storto la destinazione resta com'era.
# `session_replication_role = replica` sospende trigger e controlli delle chiavi esterne
# durante la sostituzione (stessa procedura dei ripristini di Supabase): le giocate
# della destinazione che puntano a una partita o a una previsione non vengono toccate.
{
  echo "SET session_replication_role = replica;"
  echo "SET statement_timeout = 0;"
  echo "SET lock_timeout = '60s';"
  for t in "${tables[@]}"; do echo "DELETE FROM public.\"$t\";"; done
  echo "\\i $work/data.sql"
  echo "SET session_replication_role = replica;"
  # Chi ha attivato un modello è un account dell'origine: nella destinazione non esiste.
  if has model_versions "${tables[@]}"; then
    echo "UPDATE public.model_versions SET activated_by = NULL WHERE activated_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = activated_by);"
  fi
} > "$work/load.sql"
psql "$dst" --no-psqlrc --quiet --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$work/load.sql" >/dev/null

# Verifica: stesse righe nelle due basi per ogni tabella copiata.
failed=0
printf '%-28s %10s %10s\n' "tabella" "origine" "destinazione"
for t in "${tables[@]}"; do
  a="$(q "$src" "select count(*) from public.\"$t\"")"
  b="$(q "$dst" "select count(*) from public.\"$t\"")"
  mark=""
  # L'origine può ricevere righe nuove durante la copia (agente in servizio): conta
  # come errore solo una destinazione con più righe o con molte meno.
  if [ "$b" -gt "$a" ] || [ $((a - b)) -gt $((a / 100 + 50)) ]; then mark="  <-- diverso"; failed=1; fi
  printf '%-28s %10s %10s%s\n' "$t" "$a" "$b" "$mark"
done
[ "$failed" -eq 0 ] || { echo "::error title=Copia dati::Conteggi diversi tra origine e destinazione"; exit 1; }
echo "Copia completata: ${#tables[@]} tabelle."

# Spazio occupato dall'origine (piano Free di Supabase: 500 MB), per tenerlo d'occhio.
echo "Spazio del database di origine: $(q "$src" "select pg_size_pretty(pg_database_size(current_database()))")"
q "$src" "select relname || ': ' || pg_size_pretty(pg_total_relation_size(c.oid))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by pg_total_relation_size(c.oid) desc limit 8" | sed 's/^/  /'

