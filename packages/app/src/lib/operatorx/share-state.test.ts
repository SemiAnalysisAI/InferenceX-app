import { expect, it } from 'vitest';
import { operatorXShareState, shareBin, shareBoolean, sharePrecision } from './share-state';

it('preserves explicit false overrides and independent chart precision choices', () => {
  expect(
    operatorXShareState(
      new URLSearchParams(
        'rooflinePrecision=fp8&summaryPrecision=bf16&summarySharedOnly=false&rooflineNormalized=false&modelSweep=true&modelBin=12',
      ),
    ),
  ).toEqual({
    rooflinePrecision: 'fp8',
    summaryPrecision: 'bf16',
    summarySharedOnly: 'false',
    rooflineNormalized: 'false',
    modelSweep: 'true',
    modelBin: '12',
  });
});

it('rejects malformed selections and preserves defaults for absent booleans', () => {
  expect(
    operatorXShareState(
      new URLSearchParams('modelBin=Infinity&modelPrecision=fp64&modelSweep=1&rooflineLog=garbage'),
    ),
  ).toEqual({});
  for (const value of [null, '', '-1', '1.5', '1e2', '1024']) expect(shareBin(value)).toBeNull();
  expect(shareBin('0')).toBe(0);
  expect(sharePrecision('bf16')).toBe('bf16');
  expect(shareBoolean(null, true)).toBe(true);
  expect(shareBoolean('false', true)).toBe(false);
});
