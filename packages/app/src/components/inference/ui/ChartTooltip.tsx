'use client';

import { useInference } from '@/components/inference/InferenceContext';

interface TooltipContentProps<TValue, _TName> {
  active?: boolean;
  payload?: {
    payload?: {
      hwKey?: string | number;
      tp?: number;
      conc?: number;
      x?: TValue;
      y?: TValue;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

export default function ChartTooltip({ active, payload }: TooltipContentProps<number, string>) {
  const { hardwareConfig } = useInference();
  const pointPayload = payload?.at(-1)?.payload;
  if (active && pointPayload) {
    return (
      <div className="bg-accent p-2 border rounded-sm">
        <p>{`Chip: ${hardwareConfig[pointPayload.hwKey as keyof typeof hardwareConfig].gpu}`}</p>
        <p>{`Total Chips: ${pointPayload.tp}`}</p>
        <p>{`Deployment: ${
          pointPayload.disagg
            ? 'Disaggregated'
            : pointPayload.is_multinode
              ? 'Multi-node aggregate'
              : 'Single-node aggregate'
        }`}</p>
        {(pointPayload.ep !== null && pointPayload.ep !== undefined) ||
        (pointPayload.prefill_ep !== null && pointPayload.prefill_ep !== undefined) ? (
          pointPayload.is_multinode && pointPayload.disagg ? (
            <>
              <p>{`Prefill: ${pointPayload.num_prefill_gpu ?? '?'} Chips, TP: ${pointPayload.prefill_tp ?? pointPayload.tp}, EP: ${pointPayload.prefill_ep ?? pointPayload.ep ?? 0}, DPA: ${(pointPayload.prefill_dp_attention ?? pointPayload.dp_attention) ? 'True' : 'False'}, Workers: ${pointPayload.prefill_num_workers ?? 1}`}</p>
              <p>{`Decode: ${pointPayload.num_decode_gpu ?? '?'} Chips, TP: ${pointPayload.decode_tp ?? pointPayload.tp}, EP: ${pointPayload.decode_ep ?? pointPayload.ep ?? 0}, DPA: ${(pointPayload.decode_dp_attention ?? pointPayload.dp_attention) ? 'True' : 'False'}, Workers: ${pointPayload.decode_num_workers ?? 1}`}</p>
            </>
          ) : (
            <>
              <p>{`Tensor Parallelism: ${pointPayload.decode_tp ?? pointPayload.tp}`}</p>
              {typeof pointPayload.pp === 'number' && pointPayload.pp > 1 && (
                <p>{`Pipeline Parallelism: ${pointPayload.pp}`}</p>
              )}
              {pointPayload.ep !== null && pointPayload.ep !== undefined && (
                <p>{`Expert Parallelism: ${pointPayload.ep}`}</p>
              )}
              <p>{`DP Attention: ${pointPayload.dp_attention ? 'True' : 'False'}`}</p>
            </>
          )
        ) : (
          <p>{`Parallelism Strategy: ${pointPayload.tp} Chip${(pointPayload.tp ?? 0) > 1 ? 's' : ''}`}</p>
        )}
        <p>{`Concurrent Requests: ${pointPayload.conc} Users`}</p>
        <p>{`X: ${pointPayload.x}`}</p>
        <p>{`Y: ${pointPayload.y}`}</p>
      </div>
    );
  }

  return null;
}
