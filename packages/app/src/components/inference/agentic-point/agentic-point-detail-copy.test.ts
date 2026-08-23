import { describe, expect, it } from 'vitest';

import { AGENTIC_POINT_DETAIL_STRINGS } from './agentic-point-detail';
import { metricSourceLabel, stagePhaseLabels } from './metric-source-toolbar';
import { POINT_SUMMARY_STRINGS } from './point-summary';
import { timelinePhaseLabels } from './request-timeline';
import { formatSubagentLabel } from './timeline-rows';

describe('agentic point detail copy', () => {
  it('covers loading, failure, missing-trace, timeline, and aggregate state branches in both locales', () => {
    const en = AGENTIC_POINT_DETAIL_STRINGS.en as Record<string, unknown>;
    const zh = AGENTIC_POINT_DETAIL_STRINGS.zh as Record<string, unknown>;
    expect(en).toMatchObject({
      traceFailure: 'Failed to load trace data for benchmark point #{id}.',
      missingTrace:
        'No stored trace_replay blob for benchmark point #{id}. This point predates the aiperf time-series capture, or its source artifacts have expired on GitHub.',
      loadingAggregates: 'loading…',
      loadingTimeline: 'Loading request timeline…',
      missingTimeline:
        "No per-request timeline for benchmark point #{id} — the profile_export.jsonl artifact isn't stored for this row.",
    });
    expect(Object.keys(zh)).toEqual(Object.keys(en));
    for (const key of [
      'traceFailure',
      'missingTrace',
      'loadingAggregates',
      'loadingTimeline',
      'missingTimeline',
    ]) {
      expect(zh[key]).not.toBe(en[key]);
    }
  });

  it('composes the Chinese warmup note without repeating warmup', () => {
    const copy = AGENTIC_POINT_DETAIL_STRINGS.zh;
    const note = `${copy.warmupNotePrefix}${copy.warmupWord}${copy.warmupNoteBody}`;

    expect(note).toMatch(/^当前显示 warmup 阶段/u);
    expect(note).not.toContain('warmup warmup');
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

  it('uses the established short label for disaggregated points and a natural run link', () => {
    expect(POINT_SUMMARY_STRINGS.en).toMatchObject({
      disagg: 'disagg',
      githubRun: 'GitHub Actions run →',
    });
    expect(POINT_SUMMARY_STRINGS.zh).toMatchObject({
      disagg: '分离式',
      githubRun: 'GitHub Actions 运行记录 →',
    });
  });

  it('keeps the established subagent term in generated Chinese row labels', () => {
    expect(formatSubagentLabel('subagent_001_abcd', 'en')).toBe('subagent 001 · abcd');
    expect(formatSubagentLabel('subagent_001_abcd', 'zh')).toBe('subagent 001 · abcd');
  });
});
