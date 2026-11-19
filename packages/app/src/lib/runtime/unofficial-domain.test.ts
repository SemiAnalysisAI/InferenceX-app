import { describe, expect, it } from 'vitest';

import {
  getDomainAwareChartWatermark,
  isUnofficialHostname,
  OFFICIAL_HOSTNAME,
} from './unofficial-domain';

describe('unofficial domain branding', () => {
  it('keeps the logo watermark on the official hostname', () => {
    expect(isUnofficialHostname(OFFICIAL_HOSTNAME)).toBe(false);
    expect(getDomainAwareChartWatermark('logo', OFFICIAL_HOSTNAME)).toBe('logo');
  });

  it('removes the logo watermark wherever the domain notice applies', () => {
    expect(isUnofficialHostname('localhost')).toBe(true);
    expect(getDomainAwareChartWatermark('logo', 'localhost')).toBe('none');
  });

  it('preserves non-logo watermark modes on unofficial domains', () => {
    expect(getDomainAwareChartWatermark('unofficial', 'preview.example.com')).toBe('unofficial');
    expect(getDomainAwareChartWatermark('none', 'preview.example.com')).toBe('none');
  });
});
