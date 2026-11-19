import { describe, expect, it } from 'vitest';

import { maskCapturedNetworkRequest, stripSearchParams } from './network-request-mask';

describe('stripSearchParams', () => {
  it('removes search, q and query params and keeps the rest', () => {
    expect(
      stripSearchParams('https://x.test/api/v1/search?q=gpu&search=b200&query=h100&page=2'),
    ).toBe('https://x.test/api/v1/search?page=2');
  });

  it('handles relative URLs', () => {
    expect(stripSearchParams('/api/v1/runs?query=secret')).toBe('/api/v1/runs');
  });

  it('returns URLs without search params unchanged', () => {
    expect(stripSearchParams('https://x.test/a?b=1')).toBe('https://x.test/a?b=1');
  });
});

describe('maskCapturedNetworkRequest', () => {
  it('rewrites the recorded request name', () => {
    expect(maskCapturedNetworkRequest({ name: 'https://x.test/?q=hi' }).name).toBe(
      'https://x.test/',
    );
  });
});
