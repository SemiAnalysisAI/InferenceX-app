#!/usr/bin/env bash
# Export, restore and check the public InferenceX weekly database dump.
#
#   db-dump.sh export  SOURCE_DATABASE_URL OUTPUT_PREFIX
#   db-dump.sh restore TARGET_DATABASE_URL [DUMP_DIR]
#   db-dump.sh check   DATABASE_URL
#
# restore needs PostgreSQL 18 client tools and zstd, and an empty
# PostgreSQL 18 target database. DUMP_DIR holds one release's assets.
#
# PG_EXEC optionally prefixes every PostgreSQL client command (for example
# "docker exec -i pg") so CI can use containerised tools. File paths must
# resolve identically inside that environment.
set -euo pipefail

# Data left out of the dump. Engine logs and eval prompts are bulky and not
# needed to reproduce published results; agentic_trace_replay ships as a
# separate export without its raw payload columns, whose single rows exceed
# pg_dump's 1 GiB per-row limit.
EXCLUDED_TABLES=(user_feedback agentic_trace_replay server_logs server_log_files benchmark_server_logs eval_samples)
AGENTX_COLUMNS='id, created_at, profile_export_uncompressed_size, server_metrics_csv_size, server_metrics_json_uncompressed_size, aggregate_stats, chart_series, request_timeline'
# benchmark_results.server_log_id points at server_logs, whose data is excluded.
SKIPPED_FOREIGN_KEY='benchmark_results_server_log_id_fkey'
PART_BYTES='1900m'

pg() {
  # shellcheck disable=SC2086 # PG_EXEC is a command prefix, split on purpose.
  ${PG_EXEC:-} "$@"
}

die() {
  echo "db-dump: $*" >&2
  exit 1
}

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

export_dump() {
  local source_url=$1 prefix=$2
  local exclude=() table
  for table in "${EXCLUDED_TABLES[@]}"; do
    exclude+=("--exclude-table-data=public.$table")
  done

  # One exported snapshot keeps the core dump and the AgentX export
  # consistent, so every benchmark_results.trace_replay_id resolves on restore.
  local fifo_dir
  fifo_dir=$(mktemp -d "${TMPDIR:-/tmp}/inferencex-snapshot.XXXXXX")
  mkfifo "$fifo_dir/in" "$fifo_dir/out"
  pg psql "$source_url" -X -q -A -t -v ON_ERROR_STOP=1 <"$fifo_dir/in" >"$fifo_dir/out" &
  local snapshot_pid=$!
  exec 3>"$fifo_dir/in" 4<"$fifo_dir/out"
  echo 'begin isolation level repeatable read read only;' >&3
  echo 'select pg_export_snapshot();' >&3
  local snapshot=''
  read -r -t 120 -u 4 snapshot || true
  [[ $snapshot =~ ^[0-9A-F-]+$ ]] || die "could not export a snapshot (got '${snapshot}')"
  echo "Exported snapshot $snapshot"

  (
    pg pg_dump --dbname="$source_url" --snapshot="$snapshot" \
      --format=custom --compress=none --no-owner --no-privileges "${exclude[@]}" --verbose \
      | zstd -q -T0 -19 --long=27 \
      | split -b "$PART_BYTES" -d -a 2 - "$prefix.dump.zst.part"
  ) &
  local dump_pid=$!
  (
    pg psql "$source_url" -X -q -v ON_ERROR_STOP=1 \
      -c 'begin isolation level repeatable read read only' \
      -c "set transaction snapshot '$snapshot'" \
      -c "\\copy (select $AGENTX_COLUMNS from public.agentic_trace_replay order by id) to pstdout" \
      -c 'commit' \
      | zstd -q -T0 -19 --long=27 \
      | split -b "$PART_BYTES" -d -a 2 - "$prefix.agentx.copy.zst.part"
  ) &
  local agentx_pid=$!

  # Keep the exporting transaction busy while the readers run, so the
  # server's idle-in-transaction timeout (5 min on Neon) cannot end it before
  # they import the snapshot. Writes run in a subshell so a lost exporter
  # cannot kill this script with SIGPIPE.
  local exporter_alive=1
  while kill -0 "$dump_pid" 2>/dev/null || kill -0 "$agentx_pid" 2>/dev/null; do
    if ((exporter_alive)); then
      if (echo 'select 1;' >&3) 2>/dev/null; then
        read -r -t 60 -u 4 _ || exporter_alive=0
      else
        exporter_alive=0
      fi
    fi
    sleep 10
  done

  local status=0
  wait "$dump_pid" || status=1
  wait "$agentx_pid" || status=1
  if ((exporter_alive)); then (echo 'commit;' >&3) 2>/dev/null || true; fi
  exec 3>&- 4<&-
  wait "$snapshot_pid" || true
  rm -rf "$fifo_dir"
  ((status == 0)) || die 'export failed'
}

restore_dump() {
  local target_url=$1 dump_dir=${2:-.}
  shopt -s nullglob
  local core_parts=("$dump_dir"/inferencex-*.dump.zst.part*)
  local agentx_parts=("$dump_dir"/inferencex-*.agentx.copy.zst.part*)
  shopt -u nullglob
  ((${#core_parts[@]} > 0)) || die "no inferencex-*.dump.zst.part* files in $dump_dir"
  ((${#agentx_parts[@]} > 0)) || die "no inferencex-*.agentx.copy.zst.part* files in $dump_dir"

  local work_dir
  work_dir=${RESTORE_WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/inferencex-restore.XXXXXX")}
  mkdir -p "$work_dir"
  local archive="$work_dir/inferencex.dump" list="$work_dir/restore.list"
  cat "${core_parts[@]}" | zstd -dcq --long=27 >"$archive"

  pg pg_restore --list "$archive" >"$list.all"
  grep -Ev "FK CONSTRAINT public benchmark_results $SKIPPED_FOREIGN_KEY( |\$)" "$list.all" >"$list" || true
  (($(wc -l <"$list.all") == $(wc -l <"$list") + 1)) \
    || die "expected exactly one $SKIPPED_FOREIGN_KEY entry in the archive"

  local options=(--exit-on-error --no-owner --no-privileges --use-list="$list" --dbname="$target_url")
  pg pg_restore "${options[@]}" --section=pre-data "$archive"
  pg pg_restore "${options[@]}" --section=data "$archive"
  cat "${agentx_parts[@]}" | zstd -dcq --long=27 \
    | pg psql "$target_url" -X -q -v ON_ERROR_STOP=1 \
      -c "\\copy public.agentic_trace_replay ($AGENTX_COLUMNS) from pstdin"
  pg pg_restore "${options[@]}" --section=post-data "$archive"

  if [[ -z ${RESTORE_WORK_DIR:-} ]]; then rm -rf "$work_dir"; fi
  echo 'Restore complete.'
}

check_dump() {
  local url=$1
  local counts
  counts=$(pg psql "$url" -X -A -t -F $'\t' -v ON_ERROR_STOP=1 -c "
    select table_name,
      (xpath('/row/c/text()', query_to_xml(
        format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by 1")
  printf 'table\trows\n%s\n' "$counts"

  local status=0 table rows
  for table in configs workflow_runs benchmark_results availability eval_results agentic_trace_replay gpu_metric_samples; do
    rows=$(awk -F '\t' -v t="$table" '$1 == t { print $2 }' <<<"$counts")
    if [[ -z $rows || $rows -eq 0 ]]; then
      echo "error: restored dump has no rows in $table" >&2
      status=1
    fi
  done
  for table in "${EXCLUDED_TABLES[@]}"; do
    [[ $table == agentic_trace_replay ]] && continue
    rows=$(awk -F '\t' -v t="$table" '$1 == t { print $2 }' <<<"$counts")
    if [[ -n $rows && $rows -ne 0 ]]; then
      echo "error: restored dump contains $rows rows of excluded table $table" >&2
      status=1
    fi
  done
  local raw_rows
  raw_rows=$(pg psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "
    select count(*) from public.agentic_trace_replay
    where profile_export_jsonl_gz is not null
       or server_metrics_csv is not null
       or server_metrics_json_gz is not null")
  if [[ $raw_rows -ne 0 ]]; then
    echo "error: restored dump contains raw trace payloads in $raw_rows agentic_trace_replay rows" >&2
    status=1
  fi
  return "$status"
}

case ${1:-} in
  export) (($# == 3)) || usage; export_dump "$2" "$3" ;;
  restore) (($# == 2 || $# == 3)) || usage; restore_dump "$2" "${3:-.}" ;;
  check) (($# == 2)) || usage; check_dump "$2" ;;
  *) usage ;;
esac
