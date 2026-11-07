#!/usr/bin/env bash
# Runs the SQL proof scripts against SUPABASE_DB_URL. Each script rolls itself back.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then set -a; source .env; set +a; fi
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL in .env (Supabase → Connect → Session pooler URI)}"
for f in supabase/tests/*.sql; do
  echo "── $f"
  psql "$SUPABASE_DB_URL" -X -q -f "$f"
done
