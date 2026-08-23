// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQueryMock = vi.hoisted(() => vi.fn((options: unknown) => options));

vi.mock('@tanstack/react-query', () => ({ useQuery: useQueryMock }));

import { useByIdQuery } from './benchmark-id-query';

const decode = (value: { encoded: number }) => ({ decoded: value.encoded });

describe('useByIdQuery', () => {
  beforeEach(() => useQueryMock.mockClear());

  it('keeps the nullable select wrapper stable across parent renders', () => {
    function Harness({ caption: _caption }: { caption: string }) {
      useByIdQuery('request-chart-data', 439331, true, decode);
      return null;
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => root.render(createElement(Harness, { caption: 'first' })));
    const firstSelect = useQueryMock.mock.calls.at(-1)?.[0].select;

    act(() => root.render(createElement(Harness, { caption: 'second' })));
    const secondSelect = useQueryMock.mock.calls.at(-1)?.[0].select;

    expect(secondSelect).toBe(firstSelect);
    expect(secondSelect({ encoded: 42 })).toEqual({ decoded: 42 });
    expect(secondSelect(null)).toBeNull();

    act(() => root.unmount());
  });
});
