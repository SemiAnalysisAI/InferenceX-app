import { isDeepStrictEqual } from 'node:util';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';
import { refreshLatestBenchmarks, type Sql } from '../etl/db-utils.js';
import {
  stablePowerPointIdentity,
  type PowerPublicationManifest,
} from '../etl/power-publication.js';

export type BenchmarkAuditUpdate = NonNullable<
  NonNullable<PowerPublicationManifest['benchmarkRefresh']>['auditUpdates']
>[number];

function refreshTarget(manifest: PowerPublicationManifest) {
  const raw = process.env.CACHE_INVALIDATE_URL;
  if (!raw) throw new Error('CACHE_INVALIDATE_URL is required for benchmark metadata refresh');
  const endpoint = new URL(raw);
  if (
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.pathname !== '/api/v1/invalidate' ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password
  )
    throw new Error(
      'CACHE_INVALIDATE_URL must name /api/v1/invalidate without credentials or query',
    );
  const previous = manifest.benchmarkRefresh?.endpoint;
  if (previous && previous !== endpoint.href)
    throw new Error('Benchmark refresh receipt target differs from CACHE_INVALIDATE_URL');
  const secret = process.env.CACHE_INVALIDATE_SECRET || process.env.INVALIDATE_SECRET;
  if (!secret) throw new Error('CACHE_INVALIDATE_SECRET or INVALIDATE_SECRET is required');
  return {
    endpoint,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(process.env.CACHE_PROTECTION_BYPASS_SECRET
        ? { 'x-vercel-protection-bypass': process.env.CACHE_PROTECTION_BYPASS_SECRET }
        : {}),
    },
  };
}

/** Persist possible writes before ingest, including a crash before UPDATE returns its IDs. */
export function checkpointBenchmarkRefresh(
  manifest: PowerPublicationManifest,
  ids: number[],
  save: () => void,
  auditUpdates: BenchmarkAuditUpdate[] = [],
): void {
  if (ids.length === 0) return;
  const previous = manifest.benchmarkRefresh;
  manifest.benchmarkRefresh = {
    status: 'pending',
    benchmarkResultIds: [
      ...new Set([
        ...(previous?.status === 'complete' ? [] : (previous?.benchmarkResultIds ?? [])),
        ...ids,
      ]),
    ],
    auditUpdates: [...(previous?.auditUpdates ?? [])],
    ...(previous?.endpoint ? { endpoint: previous.endpoint } : {}),
  };
  for (const update of auditUpdates) {
    const existing = manifest.benchmarkRefresh.auditUpdates!.find(
      (value) => value.benchmarkResultId === update.benchmarkResultId,
    );
    if (
      existing &&
      (!isDeepStrictEqual(existing.powerAudit, update.powerAudit) ||
        stablePowerPointIdentity(existing.identity) !== stablePowerPointIdentity(update.identity))
    )
      throw new Error('Conflicting retained audit evidence for benchmark refresh');
    if (!existing) manifest.benchmarkRefresh.auditUpdates!.push(update);
  }
  save();
  try {
    manifest.benchmarkRefresh.endpoint = refreshTarget(manifest).endpoint.href;
  } catch (error) {
    manifest.benchmarkRefresh.status = 'failed';
    manifest.benchmarkRefresh.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save();
  }
}

/** Retry only the materialized view/cache/API phase; never download or rewrite samples. */
export async function refreshBackfillBenchmarks(
  sql: Sql,
  manifest: PowerPublicationManifest,
  save: () => void,
): Promise<void> {
  const receipt = manifest.benchmarkRefresh;
  if (!receipt) throw new Error('Receipt has no benchmark metadata refresh responsibility');
  receipt.status = 'pending';
  receipt.checkedAt = new Date().toISOString();
  delete receipt.error;
  save();
  let phase = 'validate target';
  try {
    const { endpoint, headers } = refreshTarget(manifest);
    receipt.endpoint = endpoint.href;
    save();
    const ids = receipt.benchmarkResultIds;
    if (
      !Array.isArray(ids) ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Invalid benchmarkResultIds in refresh receipt');
    const rows = await sql<
      (Record<string, unknown> & { id: number; model: string; power_audit: unknown })[]
    >`
      select c.*, br.id, br.benchmark_type, br.isl, br.osl, br.conc, br.offload_mode,
        br.recipe_fingerprint, br.power_audit from benchmark_results br
      join configs c on c.id = br.config_id
      join workflow_runs wr on wr.id = br.workflow_run_id
      where wr.github_run_id = ${manifest.runId} and wr.run_attempt = ${manifest.runAttempt}
        and br.id = any(${sql.array(ids)}::bigint[])
    `;
    if (rows.length !== ids.length)
      throw new Error('Refresh receipt IDs do not belong to its run/attempt');
    for (const row of rows) {
      const audit = row.power_audit;
      if (audit === null)
        throw new Error(
          `Benchmark ${row.id} power_audit is NULL; targeted artifact re-ingest is required before cache refresh`,
        );
      if (
        !audit ||
        typeof audit !== 'object' ||
        Array.isArray(audit) ||
        !('source' in audit) ||
        typeof audit.source !== 'string' ||
        !audit.source.trim()
      )
        throw new Error(`Benchmark ${row.id} power_audit must be an object with a nonempty source`);
      const updates =
        receipt.auditUpdates?.filter((update) => update.benchmarkResultId === Number(row.id)) ?? [];
      if (updates.length !== 1 || !isDeepStrictEqual(updates[0]!.powerAudit, audit))
        throw new Error(`Benchmark ${row.id} power_audit differs from retained source evidence`);
      const update = updates[0]!;
      if (stablePowerPointIdentity(update.identity) !== stablePowerPointIdentity(row))
        throw new Error(`Benchmark ${row.id} identity differs from retained source mapping`);
      const identities = new Set(
        [update.identity, update.sourceIdentity ?? update.identity].map(stablePowerPointIdentity),
      );
      const points = manifest.points.filter((point) =>
        identities.has(stablePowerPointIdentity(point.identity)),
      );
      if (points.length > 1)
        throw new Error(`Ambiguous publication identity for benchmark ${row.id}`);
      if (
        points.length === 1 &&
        (points[0]!.power_audit === null || points[0]!.power_audit === undefined)
      )
        points[0]!.power_audit = update.powerAudit;
    }
    save();
    if (rows.length > 0) {
      phase = 'refresh latest_benchmarks';
      await refreshLatestBenchmarks(sql);
      phase = 'invalidate cache';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (
        result?.invalidated !== true ||
        !Number.isSafeInteger(result.blobsDeleted) ||
        result.blobsDeleted < 0
      )
        throw new Error('Invalid cache invalidation response');
      phase = 'verify benchmark API';
      for (const model of new Set(rows.map((row) => row.model))) {
        const displayModel = DB_MODEL_TO_DISPLAY[model];
        if (!displayModel) throw new Error(`Unmapped public model: ${model}`);
        const url = new URL('/api/v1/benchmarks', endpoint);
        url.search = new URLSearchParams({
          model: displayModel,
          runId: String(manifest.runId),
          exactRun: 'true',
        }).toString();
        const api = await fetch(url, {
          headers: process.env.CACHE_PROTECTION_BYPASS_SECRET
            ? { 'x-vercel-protection-bypass': process.env.CACHE_PROTECTION_BYPASS_SECRET }
            : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
        if (!api.ok) throw new Error(`HTTP ${api.status}`);
        const body: unknown = await api.json();
        if (!Array.isArray(body)) throw new Error('Invalid benchmark API response');
        for (const row of rows.filter((entry) => entry.model === model)) {
          const matches = body.filter((candidate) => {
            const raw = candidate?.id;
            const id =
              typeof raw === 'number'
                ? raw
                : typeof raw === 'string' && /^[1-9]\d*$/u.test(raw)
                  ? Number(raw)
                  : NaN;
            return Number.isSafeInteger(id) && id > 0 && id === Number(row.id);
          });
          if (matches.length !== 1 || !isDeepStrictEqual(matches[0].power_audit, row.power_audit))
            throw new Error(`Benchmark ${row.id} power_audit differs from database`);
        }
      }
    }
    receipt.status = 'complete';
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = `${phase}: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(receipt.error, { cause: error });
  } finally {
    save();
  }
}
