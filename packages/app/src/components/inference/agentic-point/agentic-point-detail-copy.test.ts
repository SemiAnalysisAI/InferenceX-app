import { describe, expect, it } from 'vitest';

import { AGENTIC_POINT_DETAIL_STRINGS, agenticDetailViewOptions } from './agentic-point-detail';
import { metricSourceLabel, stagePhaseLabels } from './metric-source-toolbar';
import { timelinePhaseLabels } from './request-timeline';
import { formatSubagentLabel } from './timeline-rows';

describe('agentic point detail copy', () => {
  it('composes the Chinese warmup note without repeating warmup', () => {
    const copy = AGENTIC_POINT_DETAIL_STRINGS.zh;
    const note = `${copy.warmupNotePrefix}${copy.warmupWord}${copy.warmupNoteBody}`;

    expect(note).toContain('warmup');
    expect(note).not.toMatch(/warmup\s+warmup/iu);
  });

  it('localizes generated metric-source fallback labels without changing English', () => {
    const source = {
      id: 'decode-2',
      role: 'decode',
      adapter: 'vllm',
      endpointUrl: null,
      nativeRole: null,
      workerId: null,
      dpRank: null,
      engine: '2',
    } as const;

    expect(metricSourceLabel(source, 'en')).toBe('Decode · engine 2');
    expect(metricSourceLabel(source, 'zh')).toBe('解码 · 引擎 2');
  });

  it('keeps warmup and profiling as established English terms in Chinese controls', () => {
    expect(stagePhaseLabels('en')).toEqual({ profiling: 'Profiling', warmup: 'Warmup' });
    expect(stagePhaseLabels('zh')).toEqual({ profiling: 'profiling', warmup: 'warmup' });
    expect(timelinePhaseLabels('en')).toEqual({ profiling: 'Profiling', warmup: 'Warmup' });
    expect(timelinePhaseLabels('zh')).toEqual({ profiling: 'profiling', warmup: 'warmup' });
  });

  it('keeps the established subagent term in generated Chinese row labels', () => {
    expect(formatSubagentLabel('subagent_001_abcd', 'en')).toBe('subagent 001 · abcd');
    expect(formatSubagentLabel('subagent_001_abcd', 'zh')).toBe('subagent 001 · abcd');
  });
});

describe('agentic point detail views', () => {
  const t = AGENTIC_POINT_DETAIL_STRINGS.en;
  const values = (
    featureGateUnlocked: boolean,
    currentView: Parameters<typeof agenticDetailViewOptions>[1]['currentView'],
  ) =>
    agenticDetailViewOptions(t, { featureGateUnlocked, currentView }).map((option) => option.value);

  it('hides the PowerX view while the feature gate is locked', () => {
    expect(values(false, 'point')).toEqual(['point', 'timeline', 'aggregates', 'logs']);
  });

  it('offers the PowerX view once the feature gate is unlocked', () => {
    expect(values(true, 'point')).toEqual(['point', 'timeline', 'power', 'aggregates', 'logs']);
  });

  it('keeps the PowerX view for a locked visitor who opened a shared ?view=power link', () => {
    expect(values(false, 'power')).toContain('power');
  });
});
