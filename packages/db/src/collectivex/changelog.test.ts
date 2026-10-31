import { describe, expect, it } from 'vitest';

import {
  changelogLinkRows,
  ChangelogError,
  checkProvenance,
  entriesForPrs,
  entrySelects,
  fetchChangelog,
  type GitHubGet,
  parseChangelog,
  summarizeDoc,
  uncoveredCases,
} from './changelog';

const ENTRY = {
  date: '2026-10-31',
  'pr-link': 'https://github.com/SemiAnalysisAI/InferenceX/pull/4700',
  pools: ['b300'],
  backends: ['deepep-v2'],
  ep: [16],
  description: ['Build AWS EFA fork.'],
  'description-zh': ['改用 AWS fork。'],
};

function requested(sku: string, backend: string, ep: number) {
  return {
    sku,
    disposition: 'runnable',
    case: { case_id: `${sku}-${backend}-ep${ep}`, backend, ep },
  };
}

const MATRIX = {
  version: 1,
  requested_cases: [
    requested('b300', 'deepep-v2', 16),
    requested('b300', 'deepep-v2', 8),
    requested('b300', 'nccl-ep', 16),
  ],
};

function doc(sku: string, caseId: string, p50s: number[], kernel = 'v2') {
  return {
    record_type: 'case-attempt',
    identity: { case_id: caseId, case_factors: { sku } },
    outcome: { status: 'success' },
    implementation: { kernel_generation: kernel, library_version: '2.1.0' },
    measurement: {
      rows: p50s.map((p50, index) => ({
        tokens_per_rank: 2 ** index,
        components: { pair_period: { percentiles_us: { p50 } } },
      })),
    },
  };
}

describe('parseChangelog', () => {
  it('reads entries with their selectors', () => {
    const [entry] = parseChangelog([ENTRY]);
    expect(entry).toMatchObject({
      index: 0,
      prNumber: 4700,
      pools: ['b300'],
      selectors: { backends: ['deepep-v2'], ep: [16] },
      description: 'Build AWS EFA fork.',
    });
  });

  it('accepts a YAML date value and rejects malformed entries', () => {
    expect(parseChangelog([{ ...ENTRY, date: new Date('2026-10-31T00:00:00Z') }])[0].date).toBe(
      '2026-10-31',
    );
    for (const bad of [
      { ...ENTRY, 'pr-link': 'https://github.com/other/repo/pull/1' },
      { ...ENTRY, pools: [] },
      { ...ENTRY, 'description-zh': undefined },
      { ...ENTRY, ep: ['16'] },
    ]) {
      expect(() => parseChangelog([bad])).toThrow(ChangelogError);
    }
  });
});

describe('selection', () => {
  const [entry] = parseChangelog([ENTRY]);

  it('narrows the pools to the selected cases', () => {
    expect(MATRIX.requested_cases.map((item) => entrySelects(entry, item))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('names uploaded cases no entry selects, and PRs with no entry', () => {
    expect(
      uncoveredCases([entry], MATRIX, [
        { sku: 'b300', caseId: 'b300-deepep-v2-ep16' },
        { sku: 'b300', caseId: 'b300-nccl-ep-ep16' },
      ]),
    ).toEqual(['b300/b300-nccl-ep-ep16']);
    expect(() => entriesForPrs([entry], [4700, 4701])).toThrow(/#4701/u);
  });
});

function mainHeadGitHub(): Promise<unknown> {
  return Promise.resolve({ sha: 'a'.repeat(40) });
}

describe('fetchChangelog', () => {
  it('reads the file at the commit main resolves to', async () => {
    const urls: string[] = [];
    const result = await fetchChangelog(
      mainHeadGitHub,
      (url) => {
        urls.push(url);
        return Promise.resolve('parsed by the stub');
      },
      () => [ENTRY],
    );
    expect(result.sha).toBe('a'.repeat(40));
    expect(urls[0]).toContain(`/${'a'.repeat(40)}/collectivex/perf-changelog.yaml`);
    expect(result.entries[0].prNumber).toBe(4700);
  });
});

const pull = {
  merged_at: '2026-10-31T00:00:00Z',
  merge_commit_sha: 'm'.repeat(40),
  head: { sha: 'h'.repeat(40) },
};

function provenanceGitHub(compareStatus: string, commits: string[] = []): GitHubGet {
  return (path) => {
    if (path.endsWith('/pulls/4700')) return Promise.resolve(pull);
    if (path.includes('/commits?')) return Promise.resolve(commits.map((sha) => ({ sha })));
    return Promise.resolve({ status: compareStatus });
  };
}

function unmergedGitHub(): Promise<unknown> {
  return Promise.resolve({ ...pull, merged_at: null });
}

describe('checkProvenance', () => {
  it('accepts the head, any PR commit, or a commit containing the merge', async () => {
    await expect(
      checkProvenance(provenanceGitHub('diverged'), 4700, 'h'.repeat(40)),
    ).resolves.toBeUndefined();
    await expect(
      checkProvenance(provenanceGitHub('diverged', ['c'.repeat(40)]), 4700, 'c'.repeat(40)),
    ).resolves.toBeUndefined();
    await expect(
      checkProvenance(provenanceGitHub('ahead'), 4700, 'd'.repeat(40)),
    ).resolves.toBeUndefined();
  });

  it('refuses unmerged PRs and unrelated commits', async () => {
    await expect(
      checkProvenance(provenanceGitHub('diverged'), 4700, 'x'.repeat(40)),
    ).rejects.toThrow(/neither one of #4700's commits/u);
    await expect(checkProvenance(unmergedGitHub, 4700, 'h'.repeat(40))).rejects.toThrow(
      /not merged/u,
    );
  });
});

describe('changelogLinkRows', () => {
  const [entry] = parseChangelog([ENTRY]);

  it('records the before and after of every selected case the run changed', () => {
    const kept = doc('b300', 'b300-deepep-v2-ep8', [50]);
    const before = { runId: '100', docs: [doc('b300', 'b300-deepep-v2-ep16', [1741, 4143]), kept] };
    const after = {
      runId: '200',
      docs: [doc('b300', 'b300-deepep-v2-ep16', [859, 1095], 'v2-aws-efa-fork'), kept],
    };
    const [row] = changelogLinkRows([entry], 's'.repeat(40), MATRIX, after, before);
    expect(row).toMatchObject({ run_id: '200', pr_number: 4700, entry_index: 0 });
    expect(row.changes).toEqual([
      {
        sku: 'b300',
        case_id: 'b300-deepep-v2-ep16',
        before: summarizeDoc(before.docs[0], '100'),
        after: summarizeDoc(after.docs[0], '200'),
      },
    ]);
    expect(row.changes[0].after.pair_period_p50_us).toEqual([
      [1, 859],
      [2, 1095],
    ]);
  });

  it('marks a case with no earlier result as new', () => {
    const after = { runId: '200', docs: [doc('b300', 'b300-deepep-v2-ep16', [859])] };
    const [row] = changelogLinkRows([entry], 's'.repeat(40), MATRIX, after, null);
    expect(row.changes[0].before).toBeNull();
  });
});
