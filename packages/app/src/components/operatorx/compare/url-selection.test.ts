import { afterEach, describe, expect, it, vi } from 'vitest';

const replaceClientSearch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/routing/client-navigation', () => ({ replaceClientSearch }));

import { parsePickedHardware, setPickedHardware, setSearchParam } from './url-selection';

function stubSearch(search: string) {
  vi.stubGlobal('window', { location: { search } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  replaceClientSearch.mockReset();
});

describe('parsePickedHardware', () => {
  it('reads a comma list and treats a missing or empty list as every GPU', () => {
    expect(parsePickedHardware('b300,mi355x')).toEqual(['b300', 'mi355x']);
    expect(parsePickedHardware('b300,,')).toEqual(['b300']);
    expect(parsePickedHardware('')).toBeNull();
    expect(parsePickedHardware(null)).toBeNull();
  });
});

describe('address-bar writers', () => {
  it('writes the GPU picks next to the existing params', () => {
    stubSearch('?workload=dsv4');
    setPickedHardware(['b300', 'mi355x']);
    expect(replaceClientSearch.mock.calls[0][0].toString()).toBe(
      'workload=dsv4&hardware=b300%2Cmi355x',
    );
  });

  it('drops the GPU picks on reset and the baseline when cleared', () => {
    stubSearch('?workload=dsv4&hardware=b300&baseline=b300');
    setPickedHardware(null);
    expect(replaceClientSearch.mock.calls[0][0].toString()).toBe('workload=dsv4&baseline=b300');
    setSearchParam('baseline', null);
    expect(replaceClientSearch.mock.calls[1][0].toString()).toBe('workload=dsv4&hardware=b300');
  });
});
