import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { stubEnv, unstubAllEnvs } from '../lib/test-helpers';
import { isPublicRepository, sanitizeLogText } from './repo-visibility';

afterEach(() => {
  mock.restore();
});

describe('sanitizeLogText', () => {
  it('replaces owner/repo and the name wherever letters and digits do not continue it', () => {
    const text =
      'cd /_work/private-repo/Private-Repo/bench\n' +
      'clone https://github.com/example-org/private-repo.git from 198.51.100.7\n' +
      'pip install private-repo-tools my_private-repo privaterepo private-repository\n' +
      'container private-repo-server-1 on network private_repo_default\n' +
      'GET /repos/example-org%2Fprivate-repo/actions\n';

    expect(sanitizeLogText(text, ['example-org/private-repo'])).toBe(
      'cd /_work/***REDACTED***/***REDACTED***/bench\n' +
        'clone https://github.com/***REDACTED***.git from ***REDACTED***\n' +
        'pip install ***REDACTED***-tools my_***REDACTED*** privaterepo private-repository\n' +
        'container ***REDACTED***-server-1 on network ***REDACTED***_default\n' +
        'GET /repos/***REDACTED***/actions\n',
    );
  });
});

describe('isPublicRepository', () => {
  beforeEach(() => {
    stubEnv('GITHUB_TOKEN', undefined);
  });

  afterEach(() => {
    unstubAllEnvs();
  });

  it.each([
    ['public-a', true, () => Promise.resolve(Response.json({ private: false }))],
    ['private-a', false, () => Promise.resolve(Response.json({ private: true }))],
    ['missing-a', false, () => Promise.resolve(new Response(null, { status: 404 }))],
  ])('%s is public: %s', async (name, expected, respond) => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(respond as typeof fetch);

    expect(await isPublicRepository(`example-org/${name}`)).toBe(expected);
    expect(await isPublicRepository(`example-org/${name}`)).toBe(expected);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `https://api.github.com/repos/example-org/${name}`,
    ]);
  });

  it.each([
    ['limited-a', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['offline-a', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s fails instead of guessing', async (name, respond) => {
    spyOn(globalThis, 'fetch').mockImplementation(respond as typeof fetch);
    await expect(isPublicRepository(`example-org/${name}`)).rejects.toThrow();
  });

  it('authenticates with GITHUB_TOKEN when it is set', async () => {
    stubEnv('GITHUB_TOKEN', 'test-token');
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(Response.json({ private: false }))) as typeof fetch);

    expect(await isPublicRepository('example-org/token-a')).toBe(true);
    expect(fetchMock.mock.calls).toEqual([
      [
        'https://api.github.com/repos/example-org/token-a',
        { headers: { Authorization: 'Bearer test-token' } },
      ],
    ]);
  });
});
