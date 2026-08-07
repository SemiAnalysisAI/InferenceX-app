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
    expect(overviewHref('en', 50, 'community', 'history')).toBe('/overview?compare=30d');
    expect(overviewHref('en', 100, 'all', 'history')).toBe(
      '/overview?tier=100&engine=all&compare=30d',
    );
    expect(overviewHref('zh', 100, 'all', 'history')).toBe(
      '/zh/overview?tier=100&engine=all&compare=30d',
    );
  });

  it('omits the B200 default reference and preserves a non-default reference in every mode', () => {
    expect(overviewHref('en', 50, 'community', 'hardware', 'b200')).toBe('/overview');
    expect(overviewHref('en', 50, 'community', 'hardware', 'b300')).toBe('/overview?ref=b300');
    expect(overviewHref('en', 100, 'all', 'history', 'b300')).toBe(
      '/overview?tier=100&engine=all&ref=b300&compare=30d',
    );
    expect(overviewHref('zh', 50, 'community', 'history', 'b300')).toBe(
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
    expect(overviewTierHref('en', 75, 'all', 'history')).toBe(
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
    expect(overviewEngineScopeHref('en', 'all', 50, 'history')).toBe(
      '/overview?engine=all&compare=30d',
    );
  });

  it('preserves the selected reference when changing engine scope', () => {
    expect(overviewEngineScopeHref('en', 'all', 50, 'hardware', 'gb300')).toBe(
      '/overview?engine=all&ref=gb300',
    );
  });
});
