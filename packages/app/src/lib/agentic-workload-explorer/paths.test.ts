import { describe, expect, it } from 'vitest';

import { EXPLORER_API_BASE, EXPLORER_BASE_PATH, explorerHref, explorerRelativePath } from './paths';

describe('explorerHref', () => {
  it('maps the explorer root to the base path in each locale', () => {
    expect(explorerHref('/')).toBe('/agentic-workload-explorer');
    expect(explorerHref('/', 'zh')).toBe('/zh/agentic-workload-explorer');
  });

  it('prefixes explorer-relative paths, keeping query strings and hashes', () => {
    expect(explorerHref('/sessions?sort=cost')).toBe(
      '/agentic-workload-explorer/sessions?sort=cost',
    );
    expect(explorerHref('/sessions/abc/conversation#req-7', 'zh')).toBe(
      '/zh/agentic-workload-explorer/sessions/abc/conversation#req-7',
    );
  });
});

describe('explorerRelativePath', () => {
  it('inverts explorerHref for both locales', () => {
    for (const path of ['/', '/sessions', '/sessions/abc/radix-tree']) {
      expect(explorerRelativePath(explorerHref(path))).toBe(path);
      expect(explorerRelativePath(explorerHref(path, 'zh'))).toBe(path);
    }
  });

  it('returns null outside the explorer, including look-alike prefixes', () => {
    expect(explorerRelativePath('/inference/agentic')).toBeNull();
    expect(explorerRelativePath('/zh')).toBeNull();
    expect(explorerRelativePath('/agentic-workload-explorer-old/sessions')).toBeNull();
  });
});

it('keeps the page and API prefixes aligned with the route directories', () => {
  expect(EXPLORER_BASE_PATH).toBe('/agentic-workload-explorer');
  expect(EXPLORER_API_BASE).toBe('/api/v1/agentic-workload-explorer');
});
