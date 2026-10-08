import type { BenchmarkSibling } from '@/hooks/api/use-benchmark-siblings';

const TOPOLOGY = [
  'offload_mode',
  'decode_tp',
  'decode_ep',
  'decode_pp',
  'decode_dcp_size',
  'decode_pcp_size',
  'decode_dp_attention',
  'decode_num_workers',
  'prefill_tp',
  'prefill_ep',
  'prefill_pp',
  'prefill_dcp_size',
  'prefill_pcp_size',
  'prefill_dp_attention',
  'prefill_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'is_multinode',
  'disagg',
] as const;

export function memoryComparisonPeers(id: number, siblings: BenchmarkSibling[]) {
  const seed = siblings.find((r) => r.id === id);
  if (!seed || seed.disagg) return [];
  return siblings
    .filter((r) => TOPOLOGY.every((k) => r[k] === seed[k]))
    .toSorted((a, b) => a.conc - b.conc || a.id - b.id);
}
