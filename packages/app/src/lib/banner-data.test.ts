import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { WorkflowInfoResponse } from '@/lib/api';

import { buildBannerFromWorkflowInfo, isDismissed, dismiss } from './banner-data';

const MOCK_WORKFLOW: WorkflowInfoResponse = {
  runs: [],
  changelogs: [
    {
      workflow_run_id: 1,
      date: '2026-04-07',
      base_ref: 'abc',
      head_ref: 'def',
      config_keys: ['kimik2.5-fp4-gb200-dynamo-vllm'],
      description:
        'Add Kimi K2.5 NVFP4 GB200 disaggregated multinode vLLM benchmark via Dynamo frontend\nImage: vllm/vllm-openai:v0.18.0',
      pr_link: null,
    },
  ],
  configs: [],
};

describe('buildBannerFromWorkflowInfo', () => {
  it('builds a banner from a changelog entry', () => {
    const banner = buildBannerFromWorkflowInfo('2026-04-07', MOCK_WORKFLOW);
    expect(banner).not.toBeNull();
    expect(banner!.id).toBe('changelog-1');
    expect(banner!.message).toMatch(/^New data: /);
    expect(banner!.message).toContain('Kimi-K2.5');
    expect(banner!.linkHref).toContain('/inference');
    expect(banner!.linkHref).toContain('g_model=Kimi-K2.5');
    expect(banner!.linkHref).toContain('g_rundate=2026-04-07');
    expect(banner!.linkHref).toContain('i_prec=fp4');
    expect(banner!.date).toMatch(/Apr 7, 2026/);
  });

  it('returns null when there are no changelogs', () => {
    const banner = buildBannerFromWorkflowInfo('2026-04-07', {
      runs: [],
      changelogs: [],
      configs: [],
    });
    expect(banner).toBeNull();
  });

  it('returns null when changelog has no config keys', () => {
    const banner = buildBannerFromWorkflowInfo('2026-04-07', {
      runs: [],
      changelogs: [
        {
          workflow_run_id: 1,
          date: '2026-04-07',
          base_ref: 'a',
          head_ref: 'b',
          config_keys: [],
          description: 'Empty',
          pr_link: null,
        },
      ],
      configs: [],
    });
    expect(banner).toBeNull();
  });

  it('always uses "New run:" prefix with formatted config label', () => {
    const data: WorkflowInfoResponse = {
      runs: [],
      changelogs: [
        {
          workflow_run_id: 1,
          date: '2026-04-07',
          base_ref: 'a',
          head_ref: 'b',
          config_keys: ['dsr1-fp8-b200-sglang'],
          description: 'Add DeepSeek R1 FP8 B200 SGLang',
          pr_link: null,
        },
      ],
      configs: [],
    };
    const banner = buildBannerFromWorkflowInfo('2026-04-07', data);
    expect(banner!.message).toMatch(/^New data: /);
    expect(banner!.message).toContain('B200');
    expect(banner!.linkHref).toContain('g_model=DeepSeek-R1-0528');
  });

  it('links to /evaluation for eval-related changelogs', () => {
    const data: WorkflowInfoResponse = {
      runs: [],
      changelogs: [
        {
          workflow_run_id: 1,
          date: '2026-03-28',
          base_ref: 'a',
          head_ref: 'b',
          config_keys: ['qwen3.5-fp8-b200-sglang'],
          description: 'Redo qwen eval',
          pr_link: null,
        },
      ],
      configs: [],
    };
    const banner = buildBannerFromWorkflowInfo('2026-03-28', data);
    expect(banner!.linkHref).toMatch(/^\/evaluation\?/);
    expect(banner!.linkHref).not.toContain('i_prec');
  });

  it('links to /inference for non-eval changelogs', () => {
    const banner = buildBannerFromWorkflowInfo('2026-04-07', MOCK_WORKFLOW);
    expect(banner!.linkHref).toMatch(/^\/inference\?/);
  });

  it('includes count when multiple changelogs exist', () => {
    const data: WorkflowInfoResponse = {
      runs: [],
      changelogs: [
        {
          workflow_run_id: 1,
          date: '2026-04-07',
          base_ref: 'a',
          head_ref: 'b',
          config_keys: ['dsr1-fp8-b200-sglang'],
          description:
            'This is a very long description that exceeds one hundred characters and should fall back to the formatted config key label instead of using the raw description text',
          pr_link: null,
        },
        {
          workflow_run_id: 2,
          date: '2026-04-07',
          base_ref: 'c',
          head_ref: 'd',
          config_keys: ['dsr1-fp4-h200-sglang'],
          description: 'Another change',
          pr_link: null,
        },
      ],
      configs: [],
    };
    const banner = buildBannerFromWorkflowInfo('2026-04-07', data);
    expect(banner!.message).toContain('+1 more');
  });
});

describe('isDismissed / dismiss', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false for a banner that has not been dismissed', () => {
    expect(isDismissed('changelog-2026-04-07')).toBe(false);
  });

  it('returns true after dismissing a banner', () => {
    dismiss('changelog-2026-04-07');
    expect(isDismissed('changelog-2026-04-07')).toBe(true);
  });

  it('does not affect other banners when one is dismissed', () => {
    dismiss('changelog-2026-04-07');
    expect(isDismissed('changelog-2026-04-06')).toBe(false);
  });
});
