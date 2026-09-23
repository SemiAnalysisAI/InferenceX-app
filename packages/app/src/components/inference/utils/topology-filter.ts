import type { InferenceData } from '../types';
import { meaningfulParallelismSize } from './parallelism-label';

function topologyValue(value: number | boolean | undefined) {
  return value === undefined || value === null || !Number.isFinite(Number(value))
    ? '?'
    : Number(value);
}

/** Load is deliberately excluded: a topology filter retains its whole concurrency sweep. */
export function pointTopologyKey(point: InferenceData): string {
  const fields: [string, number | boolean | undefined][] = [
    ['GPU', point.physicalChips ?? point.tp],
    ['DP', point.dp],
    ['TP', point.decode_tp],
    ['EP', point.decode_ep ?? point.ep],
    ['PP', point.decode_pp ?? point.pp],
    [
      'DCP',
      point.disagg
        ? point.decode_dcp_size
        : (meaningfulParallelismSize(point.prefill_dcp_size, point.decode_dcp_size) ??
          point.decode_dcp_size ??
          point.prefill_dcp_size),
    ],
    [
      'PCP',
      point.disagg
        ? point.decode_pcp_size
        : (meaningfulParallelismSize(point.prefill_pcp_size, point.decode_pcp_size) ??
          point.decode_pcp_size ??
          point.prefill_pcp_size),
    ],
    ['DPA', point.decode_dp_attention ?? point.dp_attention],
  ];
  if (point.disagg)
    fields.push(
      ['P-GPU', point.num_prefill_gpu],
      ['D-GPU', point.num_decode_gpu],
      ['P-workers', point.prefill_num_workers],
      ['D-workers', point.decode_num_workers],
      ['P-TP', point.prefill_tp],
      ['P-EP', point.prefill_ep],
      ['P-PP', point.prefill_pp],
      ['P-DCP', point.prefill_dcp_size],
      ['P-PCP', point.prefill_pcp_size],
      ['P-DPA', point.prefill_dp_attention],
    );
  const mode = point.disagg ? 'PD' : point.is_multinode ? 'Multi' : 'Single';
  return [
    mode,
    ...fields.map(([key, v]) => `${key}=${topologyValue(v)}`),
    `offload=${point.offload_mode ?? '?'}`,
  ].join('|');
}

/** Values stay human-readable in share links and exported filter metadata. */
export function topologyLabel(
  key: string,
  locale: 'en' | 'zh',
  availableKeys?: readonly string[],
): string {
  const [mode, ...parts] = key.split('|');
  const modes =
    locale === 'zh'
      ? { PD: '分离式', Multi: '多节点', Single: '单节点' }
      : { PD: 'Disaggregated', Multi: 'Multi-node', Single: 'Single-node' };
  // Hide shared detail, never a difference: defaults and unknowns distinguish options too.
  const peers = availableKeys?.filter((sibling) => sibling.split('|')[0] === mode);
  const visible = parts.filter((part) => {
    const name = part.split('=')[0];
    return (
      ['GPU', 'TP', 'EP', 'P-GPU', 'D-GPU', 'P-TP', 'P-EP'].includes(name) ||
      !peers?.length ||
      !peers.every((sibling) => sibling.split('|').includes(part))
    );
  });
  return [
    modes[mode as keyof typeof modes] ?? mode,
    ...visible.map((part) => part.replace('=', '')),
  ].join(' · ');
}
