import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';

import { isPublicRepository, sanitizeLogText } from './repo-visibility';

afterEach(() => {
  mock.restore();
});

describe('sanitizeLogText', () => {
  it('replaces owner/repo and the bare name but keeps longer identifiers', () => {
    const text =
      'cd /_work/private-repo/Private-Repo/bench\n' +
      'clone https://github.com/example-org/private-repo.git from 198.51.100.7\n' +
      'pip install private-repo-tools my_private-repo\n';

    expect(sanitizeLogText(text, ['example-org/private-repo'])).toBe(
      'cd /_work/***REDACTED***/***REDACTED***/bench\n' +
        'clone https://github.com/***REDACTED***.git from ***REDACTED***\n' +
        'pip install private-repo-tools my_private-repo\n',
    );
  });
});

describe('isPublicRepository', () => {
  it.each([
    ['public-a', true, () => Promise.resolve(Response.json({ private: false }))],
    ['private-a', false, () => Promise.resolve(Response.json({ private: true }))],
    ['missing-a', false, () => Promise.resolve(new Response(null, { status: 404 }))],
  ])('%s is public: %s', async (name, expected, respond) => {
    const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(respond as typeof fetch);

    expect(await isPublicRepository(`example-org/${name}`)).toBe(expected);
    expect(await isPublicRepository(`example-org/${name}`)).toBe(expected);
    expect(fetchMock.mock.calls).toEqual([[`https://api.github.com/repos/example-org/${name}`]]);
  });

  it.each([
    ['limited-a', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['offline-a', () => Promise.reject(new TypeError('fetch failed'))],
  ])('%s fails instead of guessing', async (name, respond) => {
    spyOn(globalThis, 'fetch').mockImplementation(respond as typeof fetch);
    await expect(isPublicRepository(`example-org/${name}`)).rejects.toThrow();
  });
});
