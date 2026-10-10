import type { ConfigParams } from './config-cache';
import { parseBool, parseInt2, parseOptionalBool } from './normalizers';
import { physicalChipCount, roleChipCount } from './tpu-normalization';

/** Deployment topology shared by benchmark and evaluation ingestion. */
export type ConfigTopology = Omit<
  ConfigParams,
  'hardware' | 'framework' | 'model' | 'precision' | 'specMethod'
>;

/**
 * Normalize single-engine and role-shaped artifact metadata into the same
 * deployment identity. Explicit counts win; fallback counts are per worker.
 * Aggregate configs mirror one engine into both role columns for DB readers.
 * A mirrored single-node SGLang 1P/1D payload is the eval producer's encoding
 * of one engine, unless an explicit/framework disaggregation signal says otherwise.
 */
export function resolveConfigTopology(
  src: Record<string, any>,
  framework: string,
  disaggFromFw: boolean,
): ConfigTopology {
  const topologyMarker = parseOptionalBool(src.is_multinode);
  const isMultinode = topologyMarker === true;
  // SGLang's explicit topology and the v3 AgentX contract share EP/DCP
  // devices with TP. Other legacy artifacts retain their TP x EP fallback.
  // AgentX evals use zero sequence lengths; performance artifacts name the
  // scenario. Older fixed-sequence artifacts retain their historical contract.
  const agentxTopology =
    String(src.scenario_type ?? '').startsWith('agentic') ||
    (parseInt2(src.isl) === 0 && parseInt2(src.osl) === 0);
  const sharedEpDevices =
    agentxTopology && (framework === 'sglang' || framework === 'dynamo-sglang');
  const v3Aggregate =
    src.num_gpus === undefined &&
    !disaggFromFw &&
    String(src.scenario_type ?? '').startsWith('agentic') &&
    src.request_metrics &&
    typeof src.request_metrics === 'object' &&
    !Array.isArray(src.request_metrics) &&
    topologyMarker === false &&
    parseOptionalBool(src.disagg) === false;
  const gpuCount = (tp: number, ep: number, prefix = '') => {
    if (
      (topologyMarker !== undefined && sharedEpDevices && (prefix || src.num_gpus === undefined)) ||
      (!prefix && v3Aggregate)
    ) {
      const physicalTp = physicalChipCount(src[`${prefix}tp`]);
      const pp = physicalChipCount(src[`${prefix}pp`] === undefined ? 1 : src[`${prefix}pp`]);
      const pcp = physicalChipCount(
        src[`${prefix}pcp_size`] === undefined ? 1 : src[`${prefix}pcp_size`],
      );
      if (physicalTp && pp && pcp) {
        return physicalChipCount(physicalTp * pp * pcp) ?? tp * ep;
      }
    }
    return tp * ep;
  };
  const mirroredAggregate =
    topologyMarker === false &&
    framework === 'sglang' &&
    !disaggFromFw &&
    parseInt2(src.prefill_num_workers) === 1 &&
    parseInt2(src.decode_num_workers) === 1 &&
    ['tp', 'ep', 'pp', 'pcp_size'].every(
      (key) =>
        (parseInt2(src[`prefill_${key}`]) ?? 1) === (parseInt2(src[key]) ?? 1) &&
        (parseInt2(src[`decode_${key}`]) ?? 1) === (parseInt2(src[key]) ?? 1),
    ) &&
    parseBool(src.prefill_dp_attention) === parseBool(src.dp_attention) &&
    parseBool(src.decode_dp_attention) === parseBool(src.dp_attention);

  let prefillTp: number, prefillEp: number, prefillDpAttn: boolean, prefillNumWorkers: number;
  let decodeTp: number, decodeEp: number, decodeDpAttn: boolean, decodeNumWorkers: number;
  let numPrefillGpu: number, numDecodeGpu: number;

  if ('prefill_tp' in src && !mirroredAggregate) {
    prefillTp = parseInt2(src.prefill_tp) ?? 1;
    prefillEp = parseInt2(src.prefill_ep) ?? 1;
    prefillDpAttn = parseBool(src.prefill_dp_attention);
    prefillNumWorkers = parseInt2(src.prefill_num_workers) ?? 0;
    decodeTp = parseInt2(src.decode_tp) ?? 1;
    decodeEp = parseInt2(src.decode_ep) ?? 1;
    decodeDpAttn = parseBool(src.decode_dp_attention);
    decodeNumWorkers = parseInt2(src.decode_num_workers) ?? 0;
    numPrefillGpu =
      roleChipCount(src.num_prefill_gpu) ??
      (disaggFromFw || (parseInt2(src.decode_num_workers) ?? 0) > 0
        ? undefined
        : physicalChipCount(src.num_gpus)) ??
      gpuCount(prefillTp, prefillEp, 'prefill_') * Math.max(prefillNumWorkers, 1);
    numDecodeGpu =
      roleChipCount(src.num_decode_gpu) ??
      (disaggFromFw || (parseInt2(src.decode_num_workers) ?? 0) > 0
        ? undefined
        : physicalChipCount(src.num_gpus)) ??
      gpuCount(decodeTp, decodeEp, 'decode_') * Math.max(decodeNumWorkers, 1);
  } else {
    const tp = parseInt2(src.tp) ?? 1;
    const ep = parseInt2(src.ep) ?? 1;
    const dpAttn = parseBool(src.dp_attention);
    prefillTp = tp;
    decodeTp = tp;
    prefillEp = ep;
    decodeEp = ep;
    prefillDpAttn = dpAttn;
    decodeDpAttn = dpAttn;
    prefillNumWorkers = 0;
    decodeNumWorkers = 0;
    numPrefillGpu =
      roleChipCount(src.num_prefill_gpu) ?? physicalChipCount(src.num_gpus) ?? gpuCount(tp, ep);
    numDecodeGpu =
      roleChipCount(src.num_decode_gpu) ?? physicalChipCount(src.num_gpus) ?? gpuCount(tp, ep);
  }

  // Node placement alone does not imply separate prefill/decode engines.
  const disagg = disaggFromFw || decodeNumWorkers > 0;

  if (!disagg) {
    const usePrefill =
      decodeTp <= 0 ||
      decodeEp <= 0 ||
      (decodeNumWorkers <= 0 && numDecodeGpu <= 0 && (prefillNumWorkers > 0 || numPrefillGpu > 0));
    const aggregate = usePrefill
      ? {
          tp: prefillTp,
          ep: prefillEp,
          dpAttn: prefillDpAttn,
          numWorkers: prefillNumWorkers,
          numGpu: numPrefillGpu,
        }
      : {
          tp: decodeTp,
          ep: decodeEp,
          dpAttn: decodeDpAttn,
          numWorkers: decodeNumWorkers,
          numGpu: numDecodeGpu,
        };
    prefillTp = aggregate.tp;
    decodeTp = aggregate.tp;
    prefillEp = aggregate.ep;
    decodeEp = aggregate.ep;
    prefillDpAttn = aggregate.dpAttn;
    decodeDpAttn = aggregate.dpAttn;
    prefillNumWorkers = aggregate.numWorkers;
    decodeNumWorkers = aggregate.numWorkers;
    numPrefillGpu = aggregate.numGpu;
    numDecodeGpu = aggregate.numGpu;
  }

  return {
    disagg,
    isMultinode,
    prefillTp,
    prefillEp,
    prefillDpAttn,
    prefillNumWorkers,
    decodeTp,
    decodeEp,
    decodeDpAttn,
    decodeNumWorkers,
    numPrefillGpu,
    numDecodeGpu,
  };
}
