import { describe, expect, it } from 'vitest';
import {
  assertCurvePreserved,
  projectProposedCurve,
  publishedCurve,
  type CurvePoint,
  type CurvePublication,
} from './required-power-curve';
import { powerPublicationPoint, stablePowerPointIdentity } from './power-publication';
import { verifyRequiredPowerArtifacts } from './required-power-publication';
import path from 'node:path';
const golden = path.resolve(import.meta.dirname, 'fixtures/powerx-manifest-v2');
const benchmark = verifyRequiredPowerArtifacts(golden, {
  runId: 123,
  runAttempt: 1,
  headSha: 'b'.repeat(40),
})[0];
const identity = powerPublicationPoint(benchmark, '', { path: '', sha256: '' })!.identity;
const policy: CurvePublication = { mode: 'incremental', replacement_scope: [] };
const concs = (points: CurvePoint[]) => points.map((p) => [p.identity.conc, p.workflowRunId]);
function point(run: number, conc: number, extra: Partial<CurvePoint> = {}): CurvePoint {
  return {
    identity: { ...identity, conc },
    image: 'same-image',
    workflowRunId: run,
    githubRunId: run,
    runAttempt: 1,
    date: `2026-09-${run.toString().padStart(2, '0')}`,
    runStartedAt: null,
    appendOnly: false,
    ...extra,
  };
}
describe('pure projected publication curve', () => {
  it('rejects the old partial-sweep regression without altering input rows', () => {
    const old = [
      point(1, 1),
      point(1, 16),
      point(1, 64, {
        identity: { ...identity, conc: 64, disagg: true, recipe_fingerprint: 'split-recipe' },
      }),
    ];
    const proposed = [...old, point(2, 1)];
    expect(() => assertCurvePreserved(old, proposed, policy)).toThrow('shrink');
    expect([...publishedCurve(old).values()][0]).toHaveLength(3);
  });
  it('does not inherit append-only history with an incompatible image', () => {
    const old = [point(1, 1), point(1, 16)];
    expect(() =>
      assertCurvePreserved(
        old,
        [...old, point(2, 32, { appendOnly: true, image: 'new-image' })],
        policy,
      ),
    ).toThrow('shrink');
  });
  it('inherits only an uninterrupted same-image append-only chain', () => {
    const old = [point(1, 1), point(1, 16), point(2, 32, { appendOnly: true })];
    expect([...publishedCurve(old).values()][0].map((row) => row.identity.conc)).toEqual([
      32, 1, 16,
    ]);
    expect(() =>
      assertCurvePreserved(old, [...old, point(3, 64, { appendOnly: true })], policy),
    ).not.toThrow();
    expect(() => assertCurvePreserved(old, [...old, point(3, 64)], policy)).toThrow('shrink');
  });
  it('permits only the exact removed identities of the observed snapshot', () => {
    const old = [point(1, 1), point(1, 16)];
    const proposed = [...old, point(2, 1)];
    const replacement: CurvePublication = {
      mode: 'replacement',
      replacement_scope: [
        {
          curve_scope: [...publishedCurve(old).keys()][0],
          previous_snapshot_workflow_run_id: 1,
          removed_point_identities: [stablePowerPointIdentity(old[1].identity)],
        },
      ],
    };
    expect(() => assertCurvePreserved(old, proposed, replacement)).not.toThrow();
    for (const altered of [
      { ...replacement.replacement_scope[0], previous_snapshot_workflow_run_id: 99 },
      { ...replacement.replacement_scope[0], removed_point_identities: ['*'] },
      { ...replacement.replacement_scope[0], curve_scope: '*' },
    ])
      expect(() =>
        assertCurvePreserved(old, proposed, { mode: 'replacement', replacement_scope: [altered] }),
      ).toThrow('shrink');
  });
  it('projects a same-attempt re-ingest, a newer attempt and an older attempt the way the write would', () => {
    // Run 7 attempt 1 is stored with conc 1 and 16; its workflow row has id 70.
    const stored = [point(7, 1, { workflowRunId: 70 }), point(7, 16, { workflowRunId: 70 })];
    const attempts = [{ id: 70, runAttempt: 1 }];
    const incoming = [{ identity: { ...identity, conc: 1 }, image: 'same-image' }];
    const project = (runAttempt: number, appendOnly = false) =>
      projectProposedCurve({
        stored,
        attempts,
        incoming,
        source: { runId: 7, runAttempt },
        date: '2026-09-30',
        runStartedAt: '2026-09-30T00:00:00Z',
        appendOnly,
      });
    // Same attempt: only the re-ingested identity is replaced, and it keeps its stored date.
    const same = project(1, true);
    expect(concs(same.proposed)).toEqual([
      [16, 70],
      [1, 70],
    ]);
    expect(same.proposed.find((p) => p.identity.conc === 1)).toMatchObject({
      date: '2026-09-07',
      appendOnly: true,
    });
    // A newer attempt supersedes every stored point of the run.
    expect(concs(project(2).proposed)).toEqual([[1, Number.MAX_SAFE_INTEGER]]);
    // An attempt older than the stored one publishes nothing new.
    expect(concs(project(0).proposed)).toEqual([
      [1, 70],
      [16, 70],
    ]);
    expect(concs(same.existing)).toEqual(concs(stored));
  });
  it('treats topology and offload as point identity inside one AgentX curve', () => {
    const old = [point(1, 1)];
    for (const altered of [
      { prefill_tp: 2 },
      { offload_mode: 'on' },
      { recipe_fingerprint: 'other-recipe' },
    ]) {
      expect(() =>
        assertCurvePreserved(
          old,
          [...old, point(2, 1, { identity: { ...identity, ...altered } })],
          policy,
        ),
      ).toThrow('shrink');
    }
  });
});
