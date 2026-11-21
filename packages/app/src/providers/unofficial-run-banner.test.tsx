// @test-environment jsdom
import { describe, expect, it } from 'bun:test';

import { get, render } from '@/test/dom';
import { createMockUnofficialRunContext } from '@/test/mock-providers';

import { UnofficialRunBanner, UnofficialRunContext } from './unofficial-run-provider';

describe('Standalone unofficial-run banner', () => {
  it('adds no banner or spacing when no runs are loaded', () => {
    render(
      <UnofficialRunContext.Provider value={createMockUnofficialRunContext()}>
        <div data-testid="banner-slot">
          <UnofficialRunBanner />
        </div>
      </UnofficialRunContext.Provider>,
    );
    expect(get('[data-testid="banner-slot"]').childNodes).toHaveLength(0);
  });
});
