import type { AggDataEntry } from '@/components/inference/types';

/** A transformed row, or a chart point built from one. */
export type ReproduceConfigInput = Partial<AggDataEntry> &
  Pick<AggDataEntry, 'conc' | 'date' | 'tp'>;

export interface ReproduceRoleTopology {
  gpus?: number;
  workers?: number;
  tp?: number;
  ep?: number;
  pp?: number;
  dp_attention?: boolean | string;
  dcp_size?: number;
  pcp_size?: number;
  dwdp_size?: number;
}

export interface ReproduceAggregateTopology {
  tp: number;
  ep?: number;
  pp?: number;
  dp?: number;
  dp_attention?: boolean | string;
  dcp_size?: number;
  pcp_size?: number;
}

/** Stored configuration of one benchmark point. Unrecorded fields are omitted from JSON. */
export interface ReproduceConfig {
  model?: string;
  hardware?: string;
  framework?: string;
  precision?: string;
  spec_decoding?: string;
  spec_algorithm?: string;
  spec_draft_model?: string;
  benchmark_type?: string;
  isl?: number | null;
  osl?: number | null;
  conc: number;
  disagg?: boolean;
  is_multinode?: boolean;
  physical_chips?: number;
  topology:
    | { prefill: ReproduceRoleTopology; decode: ReproduceRoleTopology }
    | ReproduceAggregateTopology;
  offload_mode?: string;
  kv_offloading?: string;
  kv_offload_backend?: string;
  kv_offload_backend_version?: string;
  kv_p2p_transfer?: string;
  router_name?: string;
  router_version?: string;
  image?: string;
  recipe_fingerprint?: string;
  date: string;
  run_url?: string;
}

/**
 * The drawer and `/api/v1/reproduce` both build the config from the same transformed
 * row, so the dashboard and API cannot disagree. A value the artifact never recorded
 * stays absent.
 */
export function buildReproduceConfig(d: ReproduceConfigInput): ReproduceConfig {
  const topology = d.disagg
    ? {
        prefill: {
          gpus: d.num_prefill_gpu,
          workers: d.prefill_num_workers,
          tp: d.prefill_tp,
          ep: d.prefill_ep,
          pp: d.prefill_pp,
          dp_attention: d.prefill_dp_attention,
          dcp_size: d.prefill_dcp_size,
          pcp_size: d.prefill_pcp_size,
          dwdp_size: d.prefill_dwdp_size,
        },
        decode: {
          gpus: d.num_decode_gpu,
          workers: d.decode_num_workers,
          tp: d.decode_tp,
          ep: d.decode_ep,
          pp: d.decode_pp,
          dp_attention: d.decode_dp_attention,
          dcp_size: d.decode_dcp_size,
          pcp_size: d.decode_pcp_size,
        },
      }
    : {
        tp: d.tp,
        ep: d.ep,
        pp: d.pp,
        dp: d.dp,
        dp_attention: d.dp_attention,
        dcp_size: d.decode_dcp_size,
        pcp_size: d.decode_pcp_size,
      };
  return {
    model: d.model,
    hardware: d.hw,
    framework: d.framework,
    precision: d.precision,
    spec_decoding: d.spec_decoding,
    spec_algorithm: d.spec_algorithm,
    spec_draft_model: d.spec_draft_model,
    benchmark_type: d.benchmark_type,
    isl: d.isl,
    osl: d.osl,
    conc: d.conc,
    disagg: d.disagg,
    is_multinode: d.is_multinode,
    physical_chips: d.physicalChips,
    topology,
    offload_mode: d.offload_mode,
    kv_offloading: d.kv_offloading,
    kv_offload_backend: d.kv_offload_backend,
    kv_offload_backend_version: d.kv_offload_backend_version,
    kv_p2p_transfer: d.kv_p2p_transfer,
    router_name: d.router_name,
    router_version: d.router_version,
    image: d.image,
    recipe_fingerprint: d.recipe_fingerprint,
    date: d.actualDate ?? d.date,
    run_url: d.run_url,
  };
}
