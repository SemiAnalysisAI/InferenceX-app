import type { InferenceData } from '../types';
import { meaningfulParallelismSize } from './parallelism-label';

function topologyValue(value: number | boolean | undefined) {
  return value === undefined || value === null || !Number.isFinite(Number(value))
    ? '?'
    : Number(value);
}

export function pointTopologyKey(point: InferenceData): string {
  const dcpSize = point.disagg
    ? point.decode_dcp_size
    : (meaningfulParallelismSize(point.prefill_dcp_size, point.decode_dcp_size) ??
      point.decode_dcp_size ??
      point.prefill_dcp_size);
  const pcpSize = point.disagg
    ? point.decode_pcp_size
    : (meaningfulParallelismSize(point.prefill_pcp_size, point.decode_pcp_size) ??
      point.decode_pcp_size ??
      point.prefill_pcp_size);
  const mode = point.disagg ? 'PD' : point.is_multinode ? 'Multi' : 'Single';
  let key =
    `${mode}|GPU=${topologyValue(point.physicalChips ?? point.tp)}` +
    `|DP=${topologyValue(point.dp)}|TP=${topologyValue(point.decode_tp)}` +
    `|EP=${topologyValue(point.decode_ep ?? point.ep)}` +
    `|PP=${topologyValue(point.decode_pp ?? point.pp)}` +
    `|DCP=${topologyValue(dcpSize)}|PCP=${topologyValue(pcpSize)}` +
    `|DPA=${topologyValue(point.decode_dp_attention ?? point.dp_attention)}`;
  if (point.disagg)
    key +=
      `|P-GPU=${topologyValue(point.num_prefill_gpu)}|D-GPU=${topologyValue(point.num_decode_gpu)}` +
      `|P-workers=${topologyValue(point.prefill_num_workers)}` +
      `|D-workers=${topologyValue(point.decode_num_workers)}` +
      `|P-TP=${topologyValue(point.prefill_tp)}|P-EP=${topologyValue(point.prefill_ep)}` +
      `|P-PP=${topologyValue(point.prefill_pp)}|P-DCP=${topologyValue(point.prefill_dcp_size)}` +
      `|P-PCP=${topologyValue(point.prefill_pcp_size)}` +
      `|P-DPA=${topologyValue(point.prefill_dp_attention)}`;
  return `${key}|offload=${point.offload_mode ?? '?'}`;
}

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
    ...visible.map((part) => part.replace(/=(?=\p{L})/u, ' ').replace('=', '')),
  ].join(' · ');
}
