import type { OperatorXPoint } from '@semianalysisai/inferencex-db/operatorx/reader';

export function precision(p: OperatorXPoint) {
  if (p.moe) return `${p.moe.dtype_act} / ${p.moe.dtype_weight}`;
  const a = p.attention;
  return a
    ? `${a.dtype_q} / ${a.dtype_k} / ${a.dtype_v} → ${a.dtype_o}`
    : `${p.dtype_a} / ${p.dtype_b} → ${p.dtype_out}`;
}
export function shape(p: OperatorXPoint, withBatch = false) {
  const m = p.moe;
  if (m)
    return `${p.name ?? 'MoE'} · ${withBatch ? `T=${m.num_tokens} · ` : ''}H=${m.hidden} I=${m.local_intermediate}/${m.intermediate} · E=${m.local_experts}/${m.num_experts} top-k=${m.top_k} · EP=${m.expert_parallel_size} TP=${m.routed_tensor_parallel_size} · shared=${m.n_shared_experts}/${m.shared_tensor_parallel_size} · ${m.expert_distribution}`;
  const a = p.attention;
  if (!a) return withBatch ? `${p.m} × ${p.n} × ${p.k}` : `${p.n} × ${p.k}`;
  return `${withBatch ? `B=${a.batch_size} · ` : ''}Q=${a.seq_len_q} KV=${a.seq_len_kv} · H=${a.num_heads}/${a.num_heads_kv} · D=${a.head_dim_qk}/${a.head_dim_v}${a.kv_lora_rank === null ? '' : ` · R=${a.kv_lora_rank}`} · causal=${a.causal}`;
}
export const x = (p: OperatorXPoint) => p.moe?.num_tokens ?? p.attention?.batch_size ?? p.m ?? 0;

export function selectOperatorPoints(
  points: readonly OperatorXPoint[],
  operator: string,
  filters: { precision: string; shape: string; backend: string; cluster: string; status: string },
  metric: string,
): OperatorXPoint[] {
  return points
    .filter(
      (p) =>
        p.type === operator &&
        (!filters.precision || precision(p) === filters.precision) &&
        (!filters.shape || shape(p) === filters.shape) &&
        (!filters.backend || p.backend === filters.backend) &&
        (!filters.cluster || p.cluster === filters.cluster) &&
        (!filters.status || p.status === filters.status),
    )
    .toSorted((a, b) =>
      metric === 'latency'
        ? (a.latency_us ?? Infinity) - (b.latency_us ?? Infinity)
        : (b.tflops ?? -1) - (a.tflops ?? -1),
    );
}
