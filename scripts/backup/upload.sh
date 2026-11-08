#!/usr/bin/env bash
# Caricamento su B2 e rotazione (ADR 0040): 30 giornalieri + il primo di ogni mese per 12 mesi.
# Uso: upload.sh <file .tar.gz.gpg>     Variabili: B2_*, ENVIRONMENT
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=b2-env.sh
source "$here/b2-env.sh"
file="${1:?file}"
env_name="${ENVIRONMENT:-dev}"
name="$(basename "$file")"
day="$(date -u +%Y-%m-%d)"
month="$(date -u +%Y-%m)"
base="s3://${B2_BUCKET}/${env_name}"

s3 cp "$file" "$base/daily/$day/$name" --only-show-errors
s3 cp "$file.sha256" "$base/daily/$day/$name.sha256" --only-show-errors
echo "Caricato: ${env_name}/daily/$day/$name"

if [ -z "$(s3 ls "$base/monthly/$month/" 2>/dev/null || true)" ]; then
  s3 cp "$file" "$base/monthly/$month/$name" --only-show-errors
  s3 cp "$file.sha256" "$base/monthly/$month/$name.sha256" --only-show-errors
  echo "Copia mensile: ${env_name}/monthly/$month/$name"
fi

# Rotazione: le cartelle sono date (AAAA-MM-GG e AAAA-MM), quindi si confrontano come testo.
cutoff_day="$(date -u -d '30 days ago' +%Y-%m-%d)"
cutoff_month="$(date -u -d '12 months ago' +%Y-%m)"
for prefix in $(s3 ls "$base/daily/" 2>/dev/null | awk '/PRE/ {print $2}' | tr -d '/'); do
  if [[ "$prefix" < "$cutoff_day" ]]; then
    s3 rm "$base/daily/$prefix/" --recursive --only-show-errors
    echo "Rimosso giornaliero $prefix"
  fi
done
for prefix in $(s3 ls "$base/monthly/" 2>/dev/null | awk '/PRE/ {print $2}' | tr -d '/'); do
  if [[ "$prefix" < "$cutoff_month" ]]; then
    s3 rm "$base/monthly/$prefix/" --recursive --only-show-errors
    echo "Rimosso mensile $prefix"
  fi
done
