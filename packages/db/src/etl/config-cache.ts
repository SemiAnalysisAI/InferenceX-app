import type postgres from 'postgres';
import type { DbClient } from '../connection.js';

type Sql = ReturnType<typeof postgres>;

export interface ConfigParams {
  hardware: string;
  framework: string;
  model: string;
  precision: string;
  specMethod: string;
  disagg: boolean;
  isMultinode: boolean;
  prefillTp: number;
  prefillEp: number;
  prefillDpAttn: boolean;
  prefillNumWorkers: number;
  decodeTp: number;
  decodeEp: number;
  decodeDpAttn: boolean;
  decodeNumWorkers: number;
  numPrefillGpu: number;
  numDecodeGpu: number;
}

export function configCacheKey(p: ConfigParams): string {
  return [
    p.hardware,
    p.framework,
    p.model,
    p.precision,
    p.specMethod,
    p.disagg,
    p.isMultinode,
    p.prefillTp,
    p.prefillEp,
    p.prefillDpAttn,
    p.prefillNumWorkers,
    p.decodeTp,
    p.decodeEp,
    p.decodeDpAttn,
    p.decodeNumWorkers,
    p.numPrefillGpu,
    p.numDecodeGpu,
  ].join(':');
}

export function configKeyFromRow(row: Record<string, unknown>): string {
  return configCacheKey({
    hardware: row.hardware as string,
    framework: row.framework as string,
    model: row.model as string,
    precision: row.precision as string,
    specMethod: row.spec_method as string,
    disagg: row.disagg as boolean,
    isMultinode: row.is_multinode as boolean,
    prefillTp: row.prefill_tp as number,
    prefillEp: row.prefill_ep as number,
    prefillDpAttn: row.prefill_dp_attention as boolean,
    prefillNumWorkers: row.prefill_num_workers as number,
    decodeTp: row.decode_tp as number,
    decodeEp: row.decode_ep as number,
    decodeDpAttn: row.decode_dp_attention as boolean,
    decodeNumWorkers: row.decode_num_workers as number,
    numPrefillGpu: row.num_prefill_gpu as number,
    numDecodeGpu: row.num_decode_gpu as number,
  });
}

export async function loadConfigIds(sql: Sql | DbClient): Promise<Map<string, number>> {
  const rows = await sql`
    select id, hardware, framework, model, precision, spec_method,
           disagg, is_multinode,
           prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
           decode_tp,  decode_ep,  decode_dp_attention,  decode_num_workers,
           num_prefill_gpu, num_decode_gpu
    from configs
  `;
  return new Map(rows.map((row) => [configKeyFromRow(row), Number(row.id)]));
}

export function createConfigCache(sql: Sql) {
  const cache = new Map<string, number>();

  async function getOrCreateConfig(p: ConfigParams): Promise<number> {
    const key = configCacheKey(p);
    if (cache.has(key)) return cache.get(key)!;

    const [row] = await sql`
      insert into configs (
        hardware, framework, model, precision, spec_method,
        disagg, is_multinode,
        prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
        decode_tp,  decode_ep,  decode_dp_attention,  decode_num_workers,
        num_prefill_gpu, num_decode_gpu
      ) values (
        ${p.hardware}, ${p.framework}, ${p.model}, ${p.precision}, ${p.specMethod},
        ${p.disagg}, ${p.isMultinode},
        ${p.prefillTp}, ${p.prefillEp}, ${p.prefillDpAttn}, ${p.prefillNumWorkers},
        ${p.decodeTp},  ${p.decodeEp},  ${p.decodeDpAttn},  ${p.decodeNumWorkers},
        ${p.numPrefillGpu}, ${p.numDecodeGpu}
      )
      on conflict (
        hardware, framework, model, precision, spec_method,
        disagg, is_multinode,
        prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
        decode_tp,  decode_ep,  decode_dp_attention,  decode_num_workers,
        num_prefill_gpu, num_decode_gpu
      )
      do update set hardware = excluded.hardware
      returning id
    `;

    cache.set(key, row.id);
    return row.id;
  }

  async function preloadConfigs(): Promise<void> {
    for (const [key, id] of await loadConfigIds(sql)) cache.set(key, id);
  }

  return {
    getOrCreateConfig,
    preloadConfigs,
    get size() {
      return cache.size;
    },
  };
}
