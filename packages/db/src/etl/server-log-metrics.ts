export function kvCachePoolTokensFromServerLog(serverLog: string | null): number | null {
  if (!serverLog) return null;

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
