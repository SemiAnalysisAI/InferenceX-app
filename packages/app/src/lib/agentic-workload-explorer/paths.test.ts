import { describe, expect, it } from 'vitest';

import {
  EXPLORER_API_BASE,
  EXPLORER_BASE_PATH,
  explorerHref,
  explorerRelativePath,
  versionQuery,
  withVersion,
} from './paths';

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

describe('versionQuery', () => {
  it('carries the trace-version selection across explorer links', () => {
    expect(versionQuery(null)).toBe('');
    expect(versionQuery(undefined)).toBe('');
    expect(versionQuery('all')).toBe('?version=all');
    expect(versionQuery(['all', '2'])).toBe('?version=all');
  });
});

describe('withVersion', () => {
  it('leaves the href alone without a selection', () => {
    expect(withVersion('/agentic-workload-explorer/sessions', null)).toBe(
      '/agentic-workload-explorer/sessions',
    );
  });

  it('merges into an existing query and keeps the fragment', () => {
    expect(withVersion('/agentic-workload-explorer/sessions/a/conversation#req-1', 'all')).toBe(
      '/agentic-workload-explorer/sessions/a/conversation?version=all#req-1',
    );
    expect(withVersion('/agentic-workload-explorer/sessions?sort=cost', 'all')).toBe(
      '/agentic-workload-explorer/sessions?sort=cost&version=all',
    );
    expect(withVersion('/agentic-workload-explorer/sessions?version=2', 'all')).toBe(
      '/agentic-workload-explorer/sessions?version=2',
    );
  });
});
