#!/usr/bin/env bash
# Scarica l'ultimo backup giornaliero da B2.
# Uso: download-latest.sh <cartella>  → stampa il percorso del file scaricato
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=b2-env.sh
source "$here/b2-env.sh"
out="${1:?cartella}"
base="s3://${B2_BUCKET}/${ENVIRONMENT:-dev}/daily"
key="$(s3 ls "$base/" --recursive | awk '{print $4}' | grep '\.tar\.gz\.gpg$' | sort | tail -1 || true)"
if [ -z "$key" ]; then
  echo "::error::Nessun backup trovato su B2" >&2
  exit 1
fi
mkdir -p "$out"
s3 cp "s3://${B2_BUCKET}/$key" "$out/$(basename "$key")" --only-show-errors >&2
s3 cp "s3://${B2_BUCKET}/$key.sha256" "$out/$(basename "$key").sha256" --only-show-errors >&2
echo "$out/$(basename "$key")"
