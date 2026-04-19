#!/usr/bin/env bash
# Remove resolved / dismissed annotations older than DAYS from the agentation
# SQLite store. Keeps the pending queue intact.
#
# Usage:
#   bin/purge-resolved.sh            # default retention: 14 days
#   bin/purge-resolved.sh 30         # keep resolved/dismissed for 30 days
#   DRY_RUN=1 bin/purge-resolved.sh  # show what would be deleted, change nothing
set -euo pipefail

DAYS="${1:-14}"
DB="${AGENTATION_DB:-$HOME/.agentation/store.db}"

if [ ! -f "$DB" ]; then
  echo "agentation DB not found at $DB" >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required" >&2
  exit 1
fi

# Agentation stores timestamps as epoch milliseconds in the `timestamp` column.
CUTOFF_MS=$(( ($(date +%s) - DAYS * 86400) * 1000 ))

SELECT_SQL="SELECT id, status, comment FROM annotations WHERE status IN ('resolved','dismissed') AND timestamp < $CUTOFF_MS;"
DELETE_SQL="DELETE FROM annotations WHERE status IN ('resolved','dismissed') AND timestamp < $CUTOFF_MS;"

if [ -n "${DRY_RUN:-}" ]; then
  echo "Would delete (older than $DAYS days):"
  sqlite3 -header -column "$DB" "$SELECT_SQL" || true
  exit 0
fi

BEFORE=$(sqlite3 "$DB" "SELECT count(*) FROM annotations;")
sqlite3 "$DB" "$DELETE_SQL"
AFTER=$(sqlite3 "$DB" "SELECT count(*) FROM annotations;")
echo "Purged $((BEFORE - AFTER)) row(s). Remaining: $AFTER."
