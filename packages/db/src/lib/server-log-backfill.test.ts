import { describe, expect, it } from 'vitest';

import type { ArtifactMeta } from './github-artifacts.js';
import { pairServerLogArtifacts, resolveServerLogResultCandidates } from './server-log-backfill.js';

const artifact = (name: string, created_at = '2026-08-12T00:00:00Z'): ArtifactMeta => ({
  name,
  created_at,
  archive_download_url: `https://example.test/${name}`,
});

describe('pairServerLogArtifacts', () => {
  it('pairs single-node logs with agentic benchmark artifacts', () => {
    const pairs = pairServerLogArtifacts([
      artifact('server_logs_config-a_pool_00'),
      artifact('bmk_agentic_config-a_pool_00'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.benchmarks.name).toBe('bmk_agentic_config-a_pool_00');
  });

  it('pairs multinode logs without hard-coding their internal filenames', () => {
    const pairs = pairServerLogArtifacts([
      artifact('multinode_server_logs_config-b_pool_03'),
      artifact('bmk_agentic_config-b_pool_03'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.serverLogs.name).toContain('multinode_server_logs_');
  });

  it('ignores eval-only server-log artifacts without a benchmark sibling', () => {
    expect(
      pairServerLogArtifacts([
        artifact('multinode_server_logs_eval-only_pool_00'),
        artifact('eval_eval-only_pool_00'),
      ]),
    ).toEqual([]);
  });

  it('does not collapse an eval runner suffix onto a benchmark suffix', () => {
    const pairs = pairServerLogArtifacts([
      artifact('multinode_server_logs_shared_pool_00', '2026-08-12T00:00:00Z'),
      artifact('bmk_agentic_shared_pool_00', '2026-08-12T00:00:00Z'),
      artifact('multinode_server_logs_shared_pool_01', '2026-08-12T01:00:00Z'),
      artifact('eval_shared_pool_01', '2026-08-12T01:00:00Z'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.serverLogs.name).toBe('multinode_server_logs_shared_pool_00');
  });

  it('keeps only the newest exact benchmark/log pair across runner retries', () => {
    const pairs = pairServerLogArtifacts([
      artifact('server_logs_retry_pool_00', '2026-08-12T00:00:00Z'),
      artifact('bmk_agentic_retry_pool_00', '2026-08-12T00:01:00Z'),
      artifact('server_logs_retry_pool_01', '2026-08-12T01:00:00Z'),
      artifact('bmk_agentic_retry_pool_01', '2026-08-12T01:01:00Z'),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.serverLogs.name).toBe('server_logs_retry_pool_01');
    expect(pairs[0]?.benchmarks.name).toBe('bmk_agentic_retry_pool_01');
  });

  it('uses artifact ids to break equal GCS upload timestamps', () => {
    const pairs = pairServerLogArtifacts([
      { ...artifact('server_logs_retry_pool_00'), id: 100 },
      { ...artifact('server_logs_retry_pool_00'), id: 200 },
      { ...artifact('bmk_retry_pool_00'), id: 300 },
    ]);

    expect(pairs[0]?.serverLogs.id).toBe(200);
  });
});

describe('resolveServerLogResultCandidates', () => {
  it('prefers exact offload-mode matches', () => {
    expect(
      resolveServerLogResultCandidates(
        [
          { id: 1, offloadMode: 'off' },
          { id: 2, offloadMode: 'on' },
        ],
        'on',
      ),
    ).toEqual({ ids: [2], usedUniqueFallback: false });
  });

  it('accepts historical offload-label drift for one unique candidate', () => {
    expect(resolveServerLogResultCandidates([{ id: 439874, offloadMode: 'on' }], 'off')).toEqual({
      ids: [439874],
      usedUniqueFallback: true,
    });
  });

  it('rejects an ambiguous fallback', () => {
    expect(
      resolveServerLogResultCandidates(
        [
          { id: 1, offloadMode: 'on' },
          { id: 2, offloadMode: 'auto' },
        ],
        'off',
      ),
    ).toEqual({ ids: [], usedUniqueFallback: false });
  });
});
