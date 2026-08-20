import { describe, expect, it } from 'vitest';

import type { ArtifactMeta } from './github-artifacts.js';
import { pairServerLogArtifacts } from './server-log-backfill.js';

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
});
