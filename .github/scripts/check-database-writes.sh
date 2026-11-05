#!/usr/bin/env bash
# Report the ingest's database write receipt (DATABASE_WRITE_RECEIPT, written by
# packages/db/src/ingest-ci-run.ts) as GitHub annotations.
#
# Usage: check-database-writes.sh <receipt.json>
#
# - Each error becomes ::error, each warning ::warning, naming kind, subject
#   and code. Annotation text is escaped (%, CR, LF).
# - Writes `summary` (plain text) and `summary_json` (the same text escaped
#   for a JSON string, without quotes) to $GITHUB_OUTPUT when set.
# - Exits 1 when the receipt holds errors, 0 otherwise. A missing receipt is
#   not an error: the ingest step failed before writing it, and that step's
#   own failure is what gets reported.
set -euo pipefail

receipt="${1:?usage: check-database-writes.sh <receipt.json>}"
max_annotations=50

escape_data() {
  local s="$1"
  s="${s//'%'/'%25'}"
  s="${s//$'\r'/'%0D'}"
  s="${s//$'\n'/'%0A'}"
  printf '%s' "$s"
}

set_output() {
  local name="$1" value="$2" delimiter
  [ -n "${GITHUB_OUTPUT:-}" ] || return 0
  delimiter="EOF_$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
  {
    printf '%s<<%s\n' "$name" "$delimiter"
    printf '%s\n' "$value"
    printf '%s\n' "$delimiter"
  } >>"$GITHUB_OUTPUT"
}

write_summary() {
  local text="$1"
  set_output summary "$text"
  set_output summary_json "$(jq -Rsj '.[:-1] | @json | .[1:-1]' <<<"$text")"
  printf '%s\n' "$text"
}

if [ ! -f "$receipt" ]; then
  write_summary "Database write receipt not found: ${receipt}"
  exit 0
fi

if ! jq -e '.version == 1 and (.errors | type == "array") and (.warnings | type == "array")' \
  "$receipt" >/dev/null 2>&1; then
  printf '::error title=Database writes::%s\n' \
    "$(escape_data "Invalid database write receipt: ${receipt}")"
  write_summary "Invalid database write receipt"
  exit 1
fi

# One annotation per entry. Workflow-command escaping happens in jq, so no
# raw CR or LF from a message can reach the command stream.
jq -r --argjson max "$max_annotations" '
  def escape: gsub("%"; "%25") | gsub("\r"; "%0D") | gsub("\n"; "%0A");
  def annotate($level):
    "::\($level) title=Database write \($level)::"
    + ("\(.kind) for \(.subject)"
       + (if .code then " (code \(.code))" else "" end)
       + ": \(.message)" | escape);
  (.errors[:$max][] | annotate("error")), (.warnings[:$max][] | annotate("warning"))
' "$receipt"

errors="$(jq '.errors | length' "$receipt")"
warnings="$(jq '.warnings | length' "$receipt")"
for level in error warning; do
  count="$errors"
  [ "$level" = warning ] && count="$warnings"
  if [ "$count" -gt "$max_annotations" ]; then
    printf '::%s title=Database write %s::%s\n' "$level" "$level" \
      "$((count - max_annotations)) more ${level}(s) in ${receipt}"
  fi
done

if [ "$errors" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  write_summary "Database writes: no failures"
  exit 0
fi

# Short summary: counts, then up to five entries per level, one line each.
details="$(jq -r '
  def line: "\(.kind) \(.subject)" + (if .code then " [\(.code)]" else "" end);
  ((.errors[:5] | map("error: " + line)) + (.warnings[:5] | map("warning: " + line)))
  | .[] | gsub("[\r\n]+"; " ")' "$receipt")"
write_summary "$(printf 'Database writes: %s error(s), %s warning(s)\n%s' "$errors" "$warnings" "$details")"

if [ "$errors" -gt 0 ]; then
  exit 1
fi
