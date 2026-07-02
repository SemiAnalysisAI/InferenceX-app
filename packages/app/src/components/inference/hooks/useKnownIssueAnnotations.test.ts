import { describe, it, expect } from 'vitest';

import { Model } from '@/lib/data-mappings';
import type { InferenceData } from '@/components/inference/types';
import { buildKnownIssueAnnotations } from './useKnownIssueAnnotations';

// Uses a real entry from KNOWN_CONFIG_ISSUES so the match → project pipeline is
// exercised end-to-end (gb300_dynamo-trt_mtp / DeepSeek-R1 / fp8, run 21726915223).
const ISSUE_HW = 'gb300_dynamo-trt_mtp';
const ISSUE_RUN_URL = 'https://github.com/org/repo/actions/runs/21726915223';

function makePoint(overrides: Partial<InferenceData> = {}): InferenceData {
  return {
    date: '2026-04-21',
    x: 10,
    y: 100,
    tp: 8,
    conc: 64,
    hwKey: ISSUE_HW,
    precision: 'fp8',
    run_url: ISSUE_RUN_URL,
    ...overrides,
  } as InferenceData;
}

describe('buildKnownIssueAnnotations', () => {
  it('projects a matched issue into an annotation with label, color, and point targets', () => {
    const visiblePoints = [
      makePoint({ x: 10, y: 100 }),
      makePoint({ x: 20, y: 200 }),
      // Non-matching point (different hw) — must NOT appear in the arrow targets.
      makePoint({ hwKey: 'h100', precision: 'fp8', run_url: undefined, x: 30, y: 300 }),
    ];
    const annotations = buildKnownIssueAnnotations({
      modelLabel: Model.DeepSeek_R1,
      visiblePoints,
      labelFor: (issue) => `label:${issue.hwKey}`,
      colorFor: (issue) => `color:${issue.hwKey}`,
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0].label).toBe(`label:${ISSUE_HW}`);
    expect(annotations[0].color).toBe(`color:${ISSUE_HW}`);
    // Only the two matching points become arrow targets.
    expect(annotations[0].points).toEqual([
      { x: 10, y: 100 },
      { x: 20, y: 200 },
    ]);
  });

  it('returns no annotations when the model does not match', () => {
    const annotations = buildKnownIssueAnnotations({
      modelLabel: Model.Llama3_3_70B,
      visiblePoints: [makePoint()],
      labelFor: () => 'x',
      colorFor: () => 'x',
    });
    expect(annotations).toEqual([]);
  });

  it('returns no annotations when the run is not in scope', () => {
    const annotations = buildKnownIssueAnnotations({
      modelLabel: Model.DeepSeek_R1,
      visiblePoints: [makePoint({ run_url: 'https://x/actions/runs/999' })],
      labelFor: () => 'x',
      colorFor: () => 'x',
    });
    expect(annotations).toEqual([]);
  });

  it('returns no annotations for empty visible points', () => {
    expect(
      buildKnownIssueAnnotations({
        modelLabel: Model.DeepSeek_R1,
        visiblePoints: [],
        labelFor: () => 'x',
        colorFor: () => 'x',
      }),
    ).toEqual([]);
  });
});
