import { expect, it } from 'vitest';
import { OPERATORX_SHARE_CONTROLS } from '@/lib/routing/dashboard-routes';
import { shareBin, shareBoolean, sharePrecision } from './share-state';

it('keeps scatter controls off the compare API roofline selector names', () => {
  expect(OPERATORX_SHARE_CONTROLS.filter((key) => key.startsWith('roofline'))).toEqual([]);
});

it('rejects malformed selections and keeps defaults for absent or malformed booleans', () => {
  for (const value of [null, '', '-1', '1.5', '1e2', '1024', 'Infinity'])
    expect(shareBin(value)).toBeNull();
  expect(shareBin('0')).toBe(0);
  expect(shareBin('12')).toBe(12);
  expect(sharePrecision('bf16')).toBe('bf16');
  expect(sharePrecision('fp64')).toBeNull();
  expect(shareBoolean(null, true)).toBe(true);
  expect(shareBoolean('garbage', false)).toBe(false);
  expect(shareBoolean('false', true)).toBe(false);
});
