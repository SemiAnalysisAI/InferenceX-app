/**
 * Derive server-side scalars from the captured vLLM server log
 * (`server_logs.server_log`). These come from startup log lines rather than the
 * scraped Prometheus `/metrics`, because for MLA / sparse-attention models the
 * `vllm:cache_config_info` labels (num_gpu_blocks × block_size) do NOT
 * reconstruct the real KV-cache token capacity — they undercount by a
 * non-constant factor. vLLM's own `GPU KV cache size: N tokens` line is the
 * authoritative number.
 */

/**
 * Total KV-cache pool size in tokens.
 *
 * vLLM prints one `GPU KV cache size: N tokens` line per engine core (one per
 * data-parallel rank; tensor-parallel is already aggregated into that single
 * per-engine number). We sum across distinct engine cores so the result is the
 * deployment-wide total:
 *
 *   (EngineCore pid=…)      GPU KV cache size: 11,294,463 tokens   → ep1 total
 *   (EngineCore_DP0 pid=…)  GPU KV cache size: 11,577,333 tokens   ┐
 *   (EngineCore_DP1 pid=…)  GPU KV cache size: 11,577,333 tokens   ┘ → ×8 = total
 *
 * Returns null when the log has no such line (non-vLLM frameworks, or a log
 * that didn't capture engine startup).
 */
export function kvCachePoolTokensFromServerLog(serverLog: string | null): number | null {
  if (!serverLog) return null;

  // Scan line-by-line. We deliberately avoid a global regex over the whole blob
  // with a lazy `[^\n]*?` bridge between the engine tag and the size: some logs
  // contain multi-megabyte single lines (progress bars, tracebacks) that make
  // such a regex recurse and blow the stack. A per-line substring pre-filter
  // means the (cheap) regexes only ever run on the short KV-size lines.
  //
  // Each engine core prints one line; the tag (e.g. `EngineCore_DP3`) is stable
  // across a run while the pid is not, so key on the tag to dedup reprints and
  // sum across data-parallel ranks.
  const tagRe = /\((?<tag>EngineCore(?:_DP\d+)?)\s+pid=\d+\)/u;
  const sizeRe = /GPU KV cache size:\s*(?<tokens>[\d,]+)\s*tokens/u;
  const perEngine = new Map<string, number>();
  let bareTotal = 0;
  let bareFound = false;
  for (const line of serverLog.split('\n')) {
    if (!line.includes('GPU KV cache size')) continue;
    const sizeMatch = sizeRe.exec(line);
    if (!sizeMatch) continue;
    const tokens = Number(sizeMatch.groups!.tokens!.replaceAll(',', ''));
    if (!Number.isFinite(tokens) || tokens <= 0) continue;
    const tagMatch = tagRe.exec(line);
    if (tagMatch) {
      perEngine.set(tagMatch.groups!.tag!, tokens);
    } else {
      // Fallback for logs without the engine-core prefix: count each occurrence
      // (one per engine when there are no reprints). Best-effort only.
      bareTotal += tokens;
      bareFound = true;
    }
  }
  if (perEngine.size > 0) {
    let total = 0;
    for (const v of perEngine.values()) total += v;
    return total;
  }
  return bareFound ? bareTotal : null;
}
