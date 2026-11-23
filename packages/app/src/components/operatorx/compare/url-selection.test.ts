import { afterEach, describe, expect, it, vi, mock } from 'bun:test';
import { stubGlobal, unstubAllGlobals } from '@/test/helpers';

const replaceClientSearch = (() => vi.fn())();
mock.module('@/lib/routing/client-navigation', () => ({ replaceClientSearch }));

import { MODEL_OPTIONS } from '@/lib/catalog/data-mappings';

import {
  listedModel,
  parsePickedHardware,
  setPickedHardware,
  setSearchParam,
} from './url-selection';

function stubSearch(search: string) {
  stubGlobal('window', { location: { search } });
}

afterEach(() => {
  unstubAllGlobals();
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

describe('listedModel', () => {
  it('keeps a listed inference model, including one without OperatorX results', () => {
    expect(listedModel('Kimi-K2.5', MODEL_OPTIONS)).toBe('Kimi-K2.5');
    expect(listedModel('Muse-Spark-Open', MODEL_OPTIONS)).toBe('Muse-Spark-Open');
  });

  it('opens an OperatorX family link on the first listed model of that family', () => {
    // The selector lists GLM-5.2 (default section) before GLM-5 (deprecated).
    expect(listedModel('GLM-5.x', MODEL_OPTIONS)).toBe('GLM-5.2');
    expect(listedModel('Kimi-K2.x', MODEL_OPTIONS)).toBe('Kimi-K2.5');
    expect(listedModel('GLM-5.x', ['GLM-5', 'DeepSeek-R1-0528'])).toBe('GLM-5');
  });

  it('falls back to the default model for a family or name the list lacks', () => {
    expect(listedModel('Synthetic Shapes', MODEL_OPTIONS)).toBe('DeepSeek-R1-0528');
    expect(listedModel('GLM-5.x', ['Kimi-K3', 'DeepSeek-R1-0528'])).toBe('DeepSeek-R1-0528');
    expect(listedModel('nope', ['Kimi-K3'])).toBe('Kimi-K3');
    expect(listedModel('nope', [])).toBeUndefined();
  });
});
