// @test-environment jsdom
import { describe, expect, it } from 'bun:test';

import { $, render } from '@/test/dom';
import { withProviders } from '@/test/mock-providers';

import { DEFAULT_RESULTS_STATE } from './results';
import VideoCostContext from './VideoCostContext';

function rentalRates(hardwareKeys: string[]): string[] {
  render(
    withProviders(
      <VideoCostContext
        state={{ ...DEFAULT_RESULTS_STATE, costTier: 'r' }}
        onUpdate={() => {}}
        hardwareKeys={hardwareKeys}
        date={null}
      />,
    ),
  );
  const table = $('[data-testid="results-tco-table"]');
  return [...(table?.querySelectorAll('tbody td') ?? [])].map((cell) => cell.textContent ?? '');
}

describe('VideoCostContext', () => {
  it('lists plotted hardware without a published rental rate as n/a, not a number', () => {
    expect(rentalRates(['h200', 'a100'])).toEqual(['2.90', 'n/a']);
  });
});
