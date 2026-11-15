#!/usr/bin/env bash
# Configura la AWS CLI per l'API S3 di Backblaze B2 a partire dai segreti
# B2_KEY_ID, B2_APPLICATION_KEY, B2_ENDPOINT (es. https://s3.eu-central-003.backblazeb2.com).
set -euo pipefail
: "${B2_KEY_ID:?}" "${B2_APPLICATION_KEY:?}" "${B2_ENDPOINT:?}" "${B2_BUCKET:?}"
endpoint="${B2_ENDPOINT%/}"
case "$endpoint" in https://*) ;; *) endpoint="https://${endpoint}" ;; esac
host="${endpoint#https://}"
region="$(printf '%s' "$host" | sed -E 's/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/\1/')"
if [ "$region" = "$host" ]; then
  echo "::error::B2_ENDPOINT non ha la forma s3.<regione>.backblazeb2.com"
  exit 1
fi
export AWS_ACCESS_KEY_ID="$B2_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$B2_APPLICATION_KEY"
export AWS_DEFAULT_REGION="$region"
export B2_ENDPOINT_URL="$endpoint"
export B2_REGION="$region"
s3() { aws s3 --endpoint-url "$B2_ENDPOINT_URL" "$@"; }
s3api() { aws s3api --endpoint-url "$B2_ENDPOINT_URL" "$@"; }
