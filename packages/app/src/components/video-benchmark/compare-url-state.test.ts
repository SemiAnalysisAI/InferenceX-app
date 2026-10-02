import { describe, expect, it } from 'vitest';
import history from '../../../cypress/fixtures/api/video-history.json';
import {
  DEFAULT_VIDEO_COMPARE_SELECTION,
  defaultComparePair,
  readVideoCompareSelection,
  resolveCompareSelection,
  writeVideoCompareSelection,
} from './compare-url-state';
import type { VideoHistoryPage } from './history';
import { videoPoints } from './points';

const points = videoPoints([history as unknown as VideoHistoryPage]);

describe('video compare URL selection', () => {
  it('defaults to the slowest measured C1 hardware as baseline and the fastest as candidate', () => {
    expect(defaultComparePair(points)).toEqual({ baseline: 'h100', candidate: 'b200' });
    expect(defaultComparePair(points.filter((p) => p.hardwareKey === 'h200'))).toEqual({
      baseline: 'h200',
      candidate: null,
    });
    expect(defaultComparePair([])).toEqual({ baseline: null, candidate: null });
  });
  it('reads v_base, v_cand and v_case, ignoring malformed values', () => {
    expect(readVideoCompareSelection('')).toEqual(DEFAULT_VIDEO_COMPARE_SELECTION);
    expect(readVideoCompareSelection('?v_base=h200&v_cand=h100&v_case=3&v_x=genSpeed')).toEqual({
      baseline: 'h200',
      candidate: 'h100',
      caseIndex: 3,
    });
    expect(readVideoCompareSelection('?v_base=H200&v_cand=h1%20x&v_case=-1')).toEqual(
      DEFAULT_VIDEO_COMPARE_SELECTION,
    );
    expect(readVideoCompareSelection('?v_case=12345').caseIndex).toBe(0);
  });
  it('resolves choices against measured points and falls back per side', () => {
    const resolved = resolveCompareSelection(
      { baseline: 'h200', candidate: null, caseIndex: 2 },
      points,
    );
    expect(resolved.baseline?.hardwareKey).toBe('h200');
    expect(resolved.candidate?.hardwareKey).toBe('b200');
    expect(resolved.caseIndex).toBe(2);
    const unknown = resolveCompareSelection(
      { baseline: 'mi355x', candidate: 'gb200', caseIndex: 0 },
      points,
    );
    expect(unknown.baseline?.hardwareKey).toBe('h100');
    expect(unknown.candidate?.hardwareKey).toBe('b200');
    expect(resolveCompareSelection(DEFAULT_VIDEO_COMPARE_SELECTION, [])).toEqual({
      baseline: null,
      candidate: null,
      caseIndex: 0,
    });
  });
  it('writes only non-default params, keeps unrelated params and leaves the input alone', () => {
    const defaults = defaultComparePair(points);
    const url = new URL('https://x.test/video?v_tier=r&run=1');
    const out = writeVideoCompareSelection(
      url,
      { baseline: 'h100', candidate: 'h200', caseIndex: 2 },
      defaults,
    );
    expect(out.searchParams.get('v_tier')).toBe('r');
    expect(out.searchParams.get('run')).toBe('1');
    expect(out.searchParams.has('v_base')).toBe(false);
    expect(out.searchParams.get('v_cand')).toBe('h200');
    expect(out.searchParams.get('v_case')).toBe('2');
    expect(url.searchParams.has('v_cand')).toBe(false);
    const swapped = writeVideoCompareSelection(
      out,
      { baseline: 'b200', candidate: 'h100', caseIndex: 0 },
      defaults,
    );
    expect(swapped.searchParams.get('v_base')).toBe('b200');
    expect(swapped.searchParams.get('v_cand')).toBe('h100');
    expect(swapped.searchParams.has('v_case')).toBe(false);
    const reset = writeVideoCompareSelection(
      swapped,
      { baseline: 'h100', candidate: 'b200', caseIndex: 0 },
      defaults,
    );
    expect([...reset.searchParams.keys()]).toEqual(['v_tier', 'run']);
  });
});
