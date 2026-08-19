import { describe, expect, it } from 'vitest';

import { Model, Precision } from './data-mappings';
import type {
  OverviewConfigResult,
  OverviewEngineScope,
  OverviewModelSummary,
  OverviewTier,
} from './overview-data';
import {
  buildOverviewDashboardHref,
  buildOverviewHistoryDashboardHref,
  detailHref,
  mergeOverviewControlHref,
  overviewEngineScopeHref,
  overviewHref,
  overviewTierHref,
} from './overview-links';

const RUN_URL = 'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26714221123';

/** Query the default fixture produces: one source run, so the run is pinned. */
const PINNED_QUERY =
  'g_model=Qwen-3.5-397B-A17B&g_rundate=2026-07-18&g_runid=26714221123&i_seq=8k%2F1k' +
  '&i_prec=fp4&i_metric=y_costh&i_gpus=b200_sglang_mtp&i_spec=mtp&i_disagg=single-node' +
  '&i_optimal=1&i_advlabel=1';

function config(overrides: Partial<OverviewConfigResult> = {}): OverviewConfigResult {
  return {
    key: 'qwen3.5|b200|sglang|mtp|agg|fp4',
    dbModel: 'qwen3.5',
    hardware: 'b200',
    hwKey: 'b200_sglang_mtp',
    framework: 'sglang',
    frameworkLabel: 'SGLang',
    specMethod: 'mtp',
    specLabel: 'MTP',
    disagg: false,
    isMultinode: false,
    precision: Precision.FP4,
    sourceRunUrls: [RUN_URL],
    tierValues: [
      {
        tier: 50,
        value: 1000,
        boundary: 'interpolated',
        estimated: false,
        evidenceDate: null,
        evidenceTopologies: [],
      },
    ],
    latestDate: '2026-07-18',
    ...overrides,
  };
}

function summary(overrides: Partial<OverviewModelSummary> = {}): OverviewModelSummary {
  return {
    model: Model.Qwen3_5,
    modelLabel: 'Qwen 3.5',
    category: 'default',
    scenario: 'single_turn_8k1k',
    platforms: [],
    ...overrides,
  };
}

describe('buildOverviewDashboardHref', () => {
  it('pins model, run, workload and exact configuration on the English route', () => {
    expect(buildOverviewDashboardHref('en', summary(), config())).toBe(
      `/inference?${PINNED_QUERY}`,
    );
  });

  it('selects the disaggregated deployment mode for a disaggregated configuration', () => {
    const href = buildOverviewDashboardHref(
      'en',
      summary(),
      config({ disagg: true, hwKey: 'gb200_dynamo-trt-disagg_mtp' }),
    );

    expect(href).toBe(
      '/inference?g_model=Qwen-3.5-397B-A17B&g_rundate=2026-07-18&g_runid=26714221123' +
        '&i_seq=8k%2F1k&i_prec=fp4&i_metric=y_costh' +
        '&i_gpus=gb200_dynamo-trt-disagg_mtp&i_spec=mtp&i_disagg=disagg' +
        '&i_optimal=1&i_advlabel=1',
    );
  });

  it('selects the multi-node aggregate mode without treating it as disaggregated', () => {
    const href = buildOverviewDashboardHref(
      'en',
      summary(),
      config({ disagg: false, isMultinode: true }),
    );

    expect(href).toContain('i_disagg=multi-node');
    expect(href).not.toContain('i_disagg=disagg');
  });

  it('writes g_model even when it equals the dashboard default model', () => {
    const href = buildOverviewDashboardHref(
      'en',
      summary({ model: Model.DeepSeek_V4_Pro }),
      config({ precision: Precision.FP8 }),
    );

    expect(href).toContain('g_model=DeepSeek-V4-Pro');
    expect(href).toContain('i_prec=fp8');
  });

  it('opens AgentX evidence in the Agentic Traces dashboard scenario', () => {
    const href = buildOverviewDashboardHref(
      'en',
      summary({ model: Model.GLM_5_2, scenario: 'agentx' }),
      config(),
    );

    expect(href).toContain('g_model=GLM-5.2');
    expect(href).toContain('i_seq=agentic-traces');
    expect(href).not.toContain('i_seq=8k%2F1k');
  });

  it('maps specMethod to the dashboard mtp/stp filter bucket, not the raw DB value', () => {
    expect(buildOverviewDashboardHref('en', summary(), config({ specMethod: 'eagle' }))).toContain(
      'i_spec=mtp',
    );
    expect(buildOverviewDashboardHref('en', summary(), config({ specMethod: 'none' }))).toContain(
      'i_spec=stp',
    );
    expect(buildOverviewDashboardHref('en', summary(), config({ specMethod: '' }))).toContain(
      'i_spec=stp',
    );
    expect(buildOverviewDashboardHref('en', summary(), config({ specMethod: 'mtp' }))).toContain(
      'i_spec=mtp',
    );
  });

  it('does not filter an AgentX mixed-spec curve to only one decode method', () => {
    const href = buildOverviewDashboardHref(
      'en',
      summary({ scenario: 'agentx' }),
      config({ specMethod: 'mixed', hwKey: 'b200_sglang' }),
    );

    expect(href).toContain('i_seq=agentic-traces');
    expect(href).not.toContain('i_spec=');
  });
});

describe('buildOverviewHistoryDashboardHref', () => {
  it('pins the independently selected current and historical serving envelopes', () => {
    const current = config({
      key: '["qwen3.5","mi355x","sglang","mtp","fp8",false,false,"off"]',
      hardware: 'mi355x',
      hwKey: 'mi355x_sglang_mtp',
      precision: Precision.FP8,
      latestDate: '2026-07-18',
      sourceRunUrls: ['https://github.com/SemiAnalysisAI/InferenceX/actions/runs/26714221123'],
    });
    const baseline = config({
      key: '["qwen3.5","mi355x","vllm","mtp","fp4",false,false,"off"]',
      hardware: 'mi355x',
      hwKey: 'mi355x_vllm_mtp',
      framework: 'vllm',
      frameworkLabel: 'vLLM',
      precision: Precision.FP4,
      latestDate: '2026-06-10',
      sourceRunUrls: ['https://github.com/SemiAnalysisAI/InferenceX/actions/runs/25700000001'],
    });

    const href = new URL(
      buildOverviewHistoryDashboardHref('en', summary(), current, baseline),
      'https://inferencex.local',
    );

    expect(href.pathname).toBe('/inference');
    expect(Object.fromEntries(href.searchParams)).toMatchObject({
      g_model: Model.Qwen3_5,
      g_rundate: '2026-07-18',
      g_runid: '26714221123',
      i_seq: '8k/1k',
      i_prec: 'fp8,fp4',
      i_metric: 'y_costh',
      i_xmode: 'interactivity',
      i_gpus: 'mi355x_sglang_mtp,mi355x_vllm_mtp',
      i_dates: '2026-07-18,2026-06-10~r25700000001',
      i_overview_current: current.key,
      i_overview_baseline: baseline.key,
      i_optimal: '1',
      i_advlabel: '1',
    });
    expect(href.searchParams.has('i_spec')).toBe(false);
    expect(href.searchParams.has('i_disagg')).toBe(false);
  });

  it('deduplicates shared GPU keys and precisions while keeping both dates', () => {
    const current = config();
    const baseline = config({
      latestDate: '2026-06-10',
      sourceRunUrls: [],
    });
    const href = new URL(
      buildOverviewHistoryDashboardHref('zh', summary(), current, baseline),
      'https://inferencex.local',
    );

    expect(href.pathname).toBe('/zh/inference');
    expect(href.searchParams.get('i_gpus')).toBe('b200_sglang_mtp');
    expect(href.searchParams.get('i_prec')).toBe('fp4');
    expect(href.searchParams.get('i_dates')).toBe('2026-07-18,2026-06-10');
  });
});

describe('detailHref', () => {
  it('keeps the model drilldown precision-neutral because headline pairs may differ', () => {
    expect(detailHref('en', summary())).toBe(
      '/inference?g_model=Qwen-3.5-397B-A17B&i_seq=8k%2F1k&i_metric=y_costh&i_optimal=1',
    );
  });

  it('opens AgentX rows in the Agentic Traces dashboard scenario', () => {
    expect(detailHref('en', summary({ model: Model.GLM_5_2, scenario: 'agentx' }))).toBe(
      '/inference?g_model=GLM-5.2&i_seq=agentic-traces&i_metric=y_costh&i_optimal=1',
    );
  });
});

describe('overviewHref', () => {
  it.each([
    ['en', 50, 'community', '/overview'],
    ['en', 50, 'all', '/overview?engine=all'],
    ['en', 100, 'community', '/overview?tier=100'],
    ['en', 100, 'all', '/overview?tier=100&engine=all'],
    ['zh', 50, 'community', '/zh/overview'],
    ['zh', 50, 'all', '/zh/overview?engine=all'],
    ['zh', 100, 'community', '/zh/overview?tier=100'],
    ['zh', 100, 'all', '/zh/overview?tier=100&engine=all'],
  ] as const)(
    'builds the canonical %s URL for tier %s and engine scope %s',
    (locale, tier, engineScope, expected) => {
      expect(overviewHref(locale, tier, engineScope)).toBe(expected);
    },
  );

  it('omits default values and always emits tier before engine', () => {
    expect(overviewHref('en', 50, 'community')).toBe('/overview');
    expect(overviewHref('en', 30, 'all')).toBe('/overview?tier=30&engine=all');
  });

  it('adds historical comparison last and omits the default comparison mode', () => {
    expect(overviewHref('en', 50, 'community', 'hardware')).toBe('/overview');
    expect(overviewHref('en', 50, 'community', '30d')).toBe('/overview?compare=30d');
    expect(overviewHref('en', 100, 'all', '30d')).toBe('/overview?tier=100&engine=all&compare=30d');
    expect(overviewHref('zh', 100, 'all', '30d')).toBe(
      '/zh/overview?tier=100&engine=all&compare=30d',
    );
  });

  it('omits the B200 default reference and preserves a non-default reference in every mode', () => {
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200')).toBe('/overview');
    expect(overviewHref('en', 50, 'community', 'hardware', 'b300')).toBe('/overview?ref=b300');
    expect(overviewHref('en', 100, 'all', '30d', 'b300')).toBe(
      '/overview?tier=100&engine=all&ref=b300&compare=30d',
    );
    expect(overviewHref('zh', 50, 'community', '30d', 'b300')).toBe(
      '/zh/overview?ref=b300&compare=30d',
    );
  });
});

describe('overview switch links', () => {
  it('merges rapid control changes into the latest pending overview URL', () => {
    const tierHref = mergeOverviewControlHref('/overview', '/overview?tier=75', ['tier']);
    const engineHref = mergeOverviewControlHref(tierHref, '/overview?engine=all', ['engine']);
    const referenceHref = mergeOverviewControlHref(engineHref, '/overview?ref=gb200', ['ref']);

    expect(referenceHref).toBe('/overview?tier=75&engine=all&ref=gb200');
  });

  it('removes defaulted control params without dropping other pending selections', () => {
    expect(
      mergeOverviewControlHref(
        '/zh/overview?tier=75&engine=all&ref=gb300&compare=30d',
        '/zh/overview?tier=75&ref=gb300&compare=30d',
        ['engine'],
      ),
    ).toBe('/zh/overview?tier=75&ref=gb300&compare=30d');
  });

  it.each([
    ['en', 100, 'community', '/overview?tier=100'],
    ['en', 100, 'all', '/overview?tier=100&engine=all'],
    ['zh', 30, 'all', '/zh/overview?tier=30&engine=all'],
  ] as const)(
    'preserves engine scope when changing tiers',
    (locale, tier, engineScope, expected) => {
      expect(
        overviewTierHref(locale, tier as OverviewTier, engineScope as OverviewEngineScope),
      ).toBe(expected);
    },
  );

  it('preserves historical comparison when changing tiers', () => {
    expect(overviewTierHref('en', 75, 'all', '30d')).toBe(
      '/overview?tier=75&engine=all&compare=30d',
    );
  });

  it('preserves the selected reference when changing tiers', () => {
    expect(overviewTierHref('en', 75, 'all', 'hardware', 'b300')).toBe(
      '/overview?tier=75&engine=all&ref=b300',
    );
  });

  it.each([
    ['en', 'all', 50, '/overview?engine=all'],
    ['en', 'all', 100, '/overview?tier=100&engine=all'],
    ['zh', 'community', 100, '/zh/overview?tier=100'],
  ] as const)(
    'preserves tier when changing engine scope',
    (locale, engineScope, tier, expected) => {
      expect(
        overviewEngineScopeHref(locale, engineScope as OverviewEngineScope, tier as OverviewTier),
      ).toBe(expected);
    },
  );

  it('preserves historical comparison when changing engine scope', () => {
    expect(overviewEngineScopeHref('en', 'all', 50, '30d')).toBe(
      '/overview?engine=all&compare=30d',
    );
  });

  it('preserves the selected reference when changing engine scope', () => {
    expect(overviewEngineScopeHref('en', 'all', 50, 'hardware', 'gb300')).toBe(
      '/overview?engine=all&ref=gb300',
    );
  });
});

describe('overview model scope links', () => {
  it('appends models=all last and omits the default scope', () => {
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200', 'default')).toBe('/overview');
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200', 'all')).toBe(
      '/overview?models=all',
    );
    expect(overviewHref('en', 100, 'all', '30d', 'b300', 'all')).toBe(
      '/overview?tier=100&engine=all&ref=b300&compare=30d&models=all',
    );
    expect(overviewHref('zh', 50, 'community', 'hardware', 'b200', 'all')).toBe(
      '/zh/overview?models=all',
    );
  });

  it('preserves the model scope when changing tiers and engine scope', () => {
    expect(overviewTierHref('en', 75, 'community', 'hardware', 'b200', 'all')).toBe(
      '/overview?tier=75&models=all',
    );
    expect(overviewEngineScopeHref('en', 'all', 50, 'hardware', 'b200', 'all')).toBe(
      '/overview?engine=all&models=all',
    );
  });

  it('merges the models control into pending overview URLs', () => {
    const tierHref = mergeOverviewControlHref('/overview?models=all', '/overview?tier=75', [
      'tier',
    ]);
    expect(tierHref).toBe('/overview?tier=75&models=all');
    expect(mergeOverviewControlHref(tierHref, '/overview?tier=75', ['models'])).toBe(
      '/overview?tier=75',
    );
  });
});

describe('overview row scope links', () => {
  it('leaves the canonical 30-day URL untouched and appends rows=changed last', () => {
    expect(overviewHref('en', 50, 'community', '30d', 'b200', 'default', 'all')).toBe(
      '/overview?compare=30d',
    );
    expect(overviewHref('en', 50, 'community', '30d', 'b200', 'default', 'changed')).toBe(
      '/overview?compare=30d&rows=changed',
    );
    expect(overviewHref('en', 100, 'all', '30d', 'b300', 'all', 'changed')).toBe(
      '/overview?tier=100&engine=all&ref=b300&compare=30d&models=all&rows=changed',
    );
    expect(overviewHref('zh', 50, 'community', '30d', 'b200', 'default', 'changed')).toBe(
      '/zh/overview?compare=30d&rows=changed',
    );
  });

  it('keeps the row scope on the URL in hardware mode, where it is dormant', () => {
    // The 30-day tab is off screen, so the key changes nothing on the rendered
    // matrix. It is still the only record of that tab's answer, and dropping it
    // here is what used to lose the filter on refresh or a shared link.
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200', 'default', 'changed')).toBe(
      '/overview?rows=changed',
    );
    expect(overviewHref('en', 75, 'community', 'hardware', 'b200', 'all', 'changed')).toBe(
      '/overview?tier=75&models=all&rows=changed',
    );
  });

  it('preserves the row scope when changing tiers and engine scope', () => {
    expect(overviewTierHref('en', 75, 'community', '30d', 'b200', 'default', 'changed')).toBe(
      '/overview?tier=75&compare=30d&rows=changed',
    );
    expect(overviewEngineScopeHref('en', 'all', 50, '30d', 'b200', 'default', 'changed')).toBe(
      '/overview?engine=all&compare=30d&rows=changed',
    );
  });

  it('merges the rows control into pending overview URLs', () => {
    const narrowed = mergeOverviewControlHref(
      '/overview?compare=30d',
      '/overview?compare=30d&rows=changed',
      ['rows'],
    );
    expect(narrowed).toBe('/overview?compare=30d&rows=changed');
    expect(mergeOverviewControlHref(narrowed, '/overview?tier=75', ['tier'])).toBe(
      '/overview?tier=75&compare=30d&rows=changed',
    );
    expect(mergeOverviewControlHref(narrowed, '/overview?compare=30d', ['rows'])).toBe(
      '/overview?compare=30d',
    );
  });
});

describe('overview hardware row scope links', () => {
  it('leaves the canonical URL untouched and appends hwrows=priced last', () => {
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200', 'default', 'all', 'all')).toBe(
      '/overview',
    );
    expect(
      overviewHref('en', 50, 'community', 'hardware', 'b200', 'default', 'all', 'priced'),
    ).toBe('/overview?hwrows=priced');
    expect(overviewHref('en', 100, 'all', 'hardware', 'b300', 'all', 'all', 'priced')).toBe(
      '/overview?tier=100&engine=all&ref=b300&models=all&hwrows=priced',
    );
    expect(
      overviewHref('zh', 50, 'community', 'hardware', 'b200', 'default', 'all', 'priced'),
    ).toBe('/zh/overview?hwrows=priced');
  });

  it('keeps the hardware row scope on the URL in history mode, where it is dormant', () => {
    expect(overviewHref('en', 50, 'community', '30d', 'b200', 'default', 'all', 'priced')).toBe(
      '/overview?compare=30d&hwrows=priced',
    );
  });

  it('writes both row scopes at once, so a URL rebuilt from page data keeps them', () => {
    // Every href the page builds comes from the current page data, including
    // the one the client router starts from on first load. Emitting only the
    // active mode's key there erased the other tab's filter on refresh and on
    // any shared link carrying both.
    expect(overviewHref('en', 50, 'community', '30d', 'b200', 'default', 'changed', 'priced')).toBe(
      '/overview?compare=30d&rows=changed&hwrows=priced',
    );
    expect(
      overviewHref('en', 50, 'community', 'hardware', 'b200', 'default', 'changed', 'priced'),
    ).toBe('/overview?rows=changed&hwrows=priced');
  });

  it('preserves the hardware row scope when changing tiers and engine scope', () => {
    expect(
      overviewTierHref('en', 75, 'community', 'hardware', 'b200', 'default', 'all', 'priced'),
    ).toBe('/overview?tier=75&hwrows=priced');
    expect(
      overviewEngineScopeHref('en', 'all', 50, 'hardware', 'b200', 'default', 'all', 'priced'),
    ).toBe('/overview?engine=all&hwrows=priced');
  });

  it('lets each mode keep its own filter across a tab switch', () => {
    // The comparison switcher owns only `compare`, so the scope belonging to the
    // mode being left stays in the URL and is waiting when the reader returns.
    const hardware = mergeOverviewControlHref('/overview', '/overview?hwrows=priced', ['hwrows']);
    expect(hardware).toBe('/overview?hwrows=priced');

    const history = mergeOverviewControlHref(hardware, '/overview?compare=30d', ['compare']);
    expect(history).toBe('/overview?compare=30d&hwrows=priced');

    const narrowed = mergeOverviewControlHref(history, '/overview?compare=30d&rows=changed', [
      'rows',
    ]);
    expect(narrowed).toBe('/overview?compare=30d&rows=changed&hwrows=priced');

    expect(mergeOverviewControlHref(narrowed, '/overview', ['compare'])).toBe(
      '/overview?rows=changed&hwrows=priced',
    );
  });

  it('lets the models control reset both scopes without clearing the dormant one', () => {
    // The models toggle owns `models` plus both row keys, because revealing
    // inactive models resets them. A merged key the target href does not carry
    // is deleted, so hiding — which resets nothing — has to restate both.
    const current = '/overview?compare=30d&models=all&rows=changed&hwrows=priced';
    const keys = ['models', 'rows', 'hwrows'] as const;

    const hiding = overviewHref(
      'en',
      50,
      'community',
      '30d',
      'b200',
      'default',
      'changed',
      'priced',
    );
    expect(mergeOverviewControlHref(current, hiding, keys)).toBe(
      '/overview?compare=30d&rows=changed&hwrows=priced',
    );

    const revealing = overviewHref('en', 50, 'community', '30d', 'b200', 'all', 'all', 'all');
    expect(mergeOverviewControlHref(current, revealing, keys)).toBe(
      '/overview?compare=30d&models=all',
    );
  });
});
