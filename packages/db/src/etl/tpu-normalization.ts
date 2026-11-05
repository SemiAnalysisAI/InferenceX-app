export function physicalChipCount(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const n = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

export function roleChipCount(value: unknown): number | undefined {
  return value === 0 || value === '0' ? 0 : physicalChipCount(value);
}

export function normalizeLegacyTpuRow(
  row: Record<string, any>,
  runId?: string | number | null,
): Record<string, any> {
  if (
    String(runId) !== '30864013158' ||
    String(row.hw).toLowerCase() !== 'tpuv7' ||
    row.model !== 'Qwen/Qwen3.5-397B-A17B-FP8' ||
    row.framework !== 'vllm' ||
    row.precision !== 'fp8' ||
    row.spec_decoding !== 'none' ||
    Number(row.isl) !== 8192 ||
    Number(row.osl) !== 1024 ||
    ![1, 8].includes(Number(row.tp)) ||
    Number(row.ep) !== 1 ||
    row.disagg === true ||
    row.disagg === 'true' ||
    row.is_multinode === true ||
    row.is_multinode === 'true' ||
    row.num_gpus !== undefined ||
    row.num_prefill_gpu !== undefined ||
    row.num_decode_gpu !== undefined ||
    row.dp !== undefined
  )
    return row;

  const dp = Number(row.tp) === 1 ? 8 : 1;
  const normalized: Record<string, any> = {
    ...row,
    num_gpus: 4,
    dp,
    disagg: false,
    ...('prefill_tp' in row ? { prefill_num_workers: 0, decode_num_workers: 0 } : {}),
  };
  for (const key of ['tput_per_gpu', 'input_tput_per_gpu', 'output_tput_per_gpu']) {
    if (typeof row[key] === 'number') normalized[key] = row[key] / dp;
  }
  return normalized;
}

export function artifactRunId(runUrl: string | null | undefined): string | undefined {
  return runUrl?.match(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/(?<runId>\d+)(?:\/|$)/u,
  )?.[1];
}
