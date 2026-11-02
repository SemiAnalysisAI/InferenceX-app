import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { assertChildTarget } from './import.js';
import {
  getExperimentCampaign,
  getExperimentRuns,
  getExperimentRunDetail,
} from '../queries/experiments.js';
import type { DbClient } from '../connection.js';

const target = {
  purpose: 'weka-amg-kimi-k3-isolated-import',
  project_id: 'silent-pond-29172997',
  parent_branch_id: 'br-restless-voice-ai2vkru2',
  child_branch_id: 'br-odd-math-aif8e7ha',
  endpoint_host: 'ep-empty-dream-aio1rvub-pooler.c-4.us-east-1.aws.neon.tech',
  database: 'neondb',
  expires_at: null,
};
describe('isolated experiment storage', () => {
  it('rejects main, unrelated endpoints and database mismatches before opening a write connection', () => {
    const url =
      'postgresql://user:password@ep-empty-dream-aio1rvub.c-4.us-east-1.aws.neon.tech/neondb';
    expect(() => assertChildTarget(url, target)).not.toThrow();
    expect(() =>
      assertChildTarget(url, { ...target, child_branch_id: target.parent_branch_id }),
    ).toThrow();
    expect(() => assertChildTarget(url.replace('empty-dream', 'other-child'), target)).toThrow();
    expect(() => assertChildTarget(url.replace('/neondb', '/production'), target)).toThrow();
  });
  it('keeps genuine repeated run identities and flagged results isolated from published tables', async () => {
    const db = new PGlite();
    try {
      await db.exec(
        'create table benchmark_results(id integer primary key, metrics jsonb); insert into benchmark_results values(7,\'{"tput_per_gpu":123}\');',
      );
      await db.exec(
        await readFile(new URL('../../experiments/schema.sql', import.meta.url), 'utf8'),
      );
      const sql: DbClient = async (strings, ...values) => {
        let query = strings[0];
        values.forEach((_, i) => {
          query += `$${i + 1}${strings[i + 1]}`;
        });
        const result = await db.query(query, values);
        return result.rows as Record<string, unknown>[];
      };
      await db.query(
        "insert into experiment_campaigns(slug,title,description,reference_points,comparison_notes,manifest_sha256,expected_run_count) values('weka-amg-kimi-k3','Test','Test','[]','{}',$1,3)",
        ['a'.repeat(64)],
      );
      expect(await getExperimentCampaign(sql, 'weka-amg-kimi-k3')).toBeNull();
      for (const [id, series, conc, clean] of [
        ['cam-k3-amg-c56-r1', 'weka', 56, true],
        ['cam-k3-amg-c56-r2', 'weka', 56, true],
        ['sa-k3-original-rdma2048-c150-m089', 'recovered-c150', 150, false],
      ]) {
        await db.query(
          "insert into experiment_runs(campaign_slug,run_id,series,concurrency,metrics,plot_metrics,configuration,provenance,health,cache_evidence,clean_backend_qualified,frontier_eligible,record_sha256,aggregate_stats,chart_series,request_timeline,payload_inventory) values('weka-amg-kimi-k3',$1,$2,$3,'{}','{}','{}','{}','{}','{}',$4,$4,$5,'{}','{}','{}','[]')",
          [id, series, conc, clean, 'b'.repeat(64)],
        );
      }
      await db.exec('update experiment_campaigns set complete=true');
      const runs = await getExperimentRuns(sql, 'weka-amg-kimi-k3');
      expect(runs).toHaveLength(3);
      expect(runs.filter((r) => r.concurrency === 56)).toHaveLength(2);
      const flagged = await getExperimentRunDetail(
        sql,
        'weka-amg-kimi-k3',
        'sa-k3-original-rdma2048-c150-m089',
      );
      expect(flagged?.frontier_eligible).toBe(false);
      expect(flagged?.run_id).toBe('sa-k3-original-rdma2048-c150-m089');
      const published = await db.query('select * from benchmark_results');
      expect(published.rows).toEqual([{ id: 7, metrics: { tput_per_gpu: 123 } }]);
    } finally {
      await db.close();
    }
  });
});
