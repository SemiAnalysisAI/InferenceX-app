/**
 * Config dimension cache.
 * `createConfigCache(sql)` returns `getOrCreateConfig`, `preloadConfigs`, and a `size` getter.
 * The in-memory cache avoids redundant DB round-trips when the same config appears
 * across many artifacts in a single run.
 */

import postgres from 'postgres';

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

/**
 * Derive a stable string cache key from all config dimensions.
 * The key is a colon-joined concatenation of every field in declaration order,
 * matching the DB unique constraint on the `configs` table.
 *
 * @param p - Config parameter object.
 * @returns A deterministic string key suitable for use in a `Map`.
 */
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

/**
 * Create an in-memory config cache backed by the `configs` DB table.
 *
 * @param sql - Active `postgres` connection used for upserts and preload queries.
 * @returns An object with:
 *   - `getOrCreateConfig` — resolve or upsert a config row and return its id.
 *   - `preloadConfigs` — bulk-load all existing configs into the cache at startup.
 *   - `size` — getter returning the current number of cached entries.
 */
export function createConfigCache(sql: Sql) {
  const cache = new Map<string, number>();

  /**
   * Return the DB id for a config, upserting a new row if the combination of
   * dimensions does not yet exist. Results are cached in memory so repeated
   * calls for the same config skip the DB round-trip entirely.
   *
   * @param p - All config dimensions describing a benchmark run.
   * @returns The `configs.id` primary key for this combination of dimensions.
   */
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

  /**
   * Bulk-load all existing `configs` rows into the in-memory cache.
   * Call this once at startup so that re-runs of the ingest script skip every
   * config upsert round-trip for data that is already in the DB.
   */
  async function preloadConfigs(): Promise<void> {
    const rows = await sql`
      select id, hardware, framework, model, precision, spec_method,
             disagg, is_multinode,
             prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
             decode_tp,  decode_ep,  decode_dp_attention,  decode_num_workers,
             num_prefill_gpu, num_decode_gpu
      from configs
    `;
    for (const r of rows) {
      const key = configCacheKey({
        hardware: r.hardware,
        framework: r.framework,
        model: r.model,
        precision: r.precision,
        specMethod: r.spec_method,
        disagg: r.disagg,
        isMultinode: r.is_multinode,
        prefillTp: r.prefill_tp,
        prefillEp: r.prefill_ep,
        prefillDpAttn: r.prefill_dp_attention,
        prefillNumWorkers: r.prefill_num_workers,
        decodeTp: r.decode_tp,
        decodeEp: r.decode_ep,
        decodeDpAttn: r.decode_dp_attention,
        decodeNumWorkers: r.decode_num_workers,
        numPrefillGpu: r.num_prefill_gpu,
        numDecodeGpu: r.num_decode_gpu,
      });
      cache.set(key, r.id);
    }
  }

  return {
    getOrCreateConfig,
    preloadConfigs,
    get size() {
      return cache.size;
    },
  };
}
