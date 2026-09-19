import { describe, expect, it } from 'vitest';

import { NonRetryableArtifactError } from './artifact-retry.js';
import {
  RUNNER_SUFFIX_RE,
  WorkflowRunNotFoundError,
  dedupeArtifactsByLogicalName,
  isGithubNotFoundError,
} from './github-artifacts.js';

const art = (name: string, created_at: string) => ({
  name,
  archive_download_url: `https://api.github.com/${name}`,
  created_at,
});

describe('RUNNER_SUFFIX_RE', () => {
  it('strips the trailing runner-pool + attempt token', () => {
    expect('bmk_dsr1_conc4_h200-cw_00'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
    expect('bmk_dsr1_conc4_h200-dgxc-slurm_1'.replace(RUNNER_SUFFIX_RE, '')).toBe('bmk_dsr1_conc4');
  });

  it('does not over-match across earlier underscore separators', () => {
    // The (conc, offload) variant tokens must survive — only the final
    // `_<pool>_<digits>` pair is stripped.
    expect('bmk_agentic_glm5_offload_on_b200-nb_2'.replace(RUNNER_SUFFIX_RE, '')).toBe(
      'bmk_agentic_glm5_offload_on',
    );
    expect('server_logs_glm5'.replace(RUNNER_SUFFIX_RE, '')).toBe('server_logs_glm5');
  });
});

describe('dedupeArtifactsByLogicalName', () => {
  it('keeps only the most recent artifact per logical name', () => {
    const deduped = dedupeArtifactsByLogicalName([
      art('bmk_dsr1_conc4_h200-cw_00', '2026-06-01T00:00:00Z'),
      art('bmk_dsr1_conc4_h200-dgxc-slurm_1', '2026-06-02T00:00:00Z'),
      art('bmk_dsr1_conc8_h200-cw_00', '2026-06-01T00:00:00Z'),
    ]);
    expect([...deduped.keys()].toSorted()).toEqual(['bmk_dsr1_conc4', 'bmk_dsr1_conc8']);
    expect(deduped.get('bmk_dsr1_conc4')?.name).toBe('bmk_dsr1_conc4_h200-dgxc-slurm_1');
  });

  it('passes through names without a runner suffix unchanged', () => {
    const deduped = dedupeArtifactsByLogicalName([art('run-stats', '2026-06-01T00:00:00Z')]);
    expect(deduped.get('run-stats')?.name).toBe('run-stats');
  });
});

describe('isGithubNotFoundError', () => {
  it('recognises the status gh prints to stderr for a deleted run', () => {
    // Shape of the error execSync throws with `encoding: 'utf8'`: the message
    // only names the command; the HTTP status lives in stderr.
    const error = Object.assign(
      new Error('Command failed: gh api repos/o/r/actions/runs/1/artifacts'),
      {
        status: 1,
        stderr: 'gh: Not Found (HTTP 404)\n{"message":"Not Found"}\n',
      },
    );
    expect(isGithubNotFoundError(error)).toBe(true);
  });

  it('leaves transient failures retryable', () => {
    expect(
      isGithubNotFoundError(
        Object.assign(new Error('Command failed'), {
          stderr: 'gh: error connecting to api.github.com\n',
        }),
      ),
    ).toBe(false);
    expect(
      isGithubNotFoundError(
        Object.assign(new Error('Command failed'), { stderr: 'gh: Server Error (HTTP 502)\n' }),
      ),
    ).toBe(false);
    expect(isGithubNotFoundError(null)).toBe(false);
    expect(isGithubNotFoundError('HTTP 404')).toBe(false);
  });
});

describe('WorkflowRunNotFoundError', () => {
  it('is non-retryable and names the run', () => {
    const error = new WorkflowRunNotFoundError('SemiAnalysisAI/InferenceX', '34533943809');
    expect(error).toBeInstanceOf(NonRetryableArtifactError);
    expect(error.runId).toBe('34533943809');
    expect(error.message).toContain('34533943809');
  });
});
