import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { requestHeaders } from '../skills/inferencex-api/scripts/request-headers.mjs';
import { createHttpClient } from '../skills/inferencex-api/scripts/http-client.mjs';

const origin = 'https://inferencex.semianalysis.com';
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;

test('both transports use the packaged version and only finite traffic classes', () => {
  for (const source of ['cli', 'skill']) {
    for (const [env, traffic] of [
      [{}, 'normal'],
      [{ CI: 'true' }, 'ci'],
      [{ CI: '0' }, 'normal'],
      [{ INFERENCEX_TRAFFIC: 'validation' }, 'validation'],
      [{ CI: 'true', INFERENCEX_TRAFFIC: 'normal' }, 'ci'],
    ]) {
      assert.deepEqual(requestHeaders(`${origin}/api/openapi.json`, { source, env }), {
        'user-agent': `inferencex-${source}/${version}`,
        'x-inferencex-traffic': traffic,
      });
    }
  }
});

test('opt-out, third-party URLs, invalid sources and traffic carry no marker', () => {
  for (const source of ['cli', 'skill']) {
    for (const env of [
      { INFERENCEX_TELEMETRY: '0' },
      { DO_NOT_TRACK: '1' },
      { INFERENCEX_TRAFFIC: 'private-project-name' },
    ]) {
      assert.deepEqual(requestHeaders(origin, { source, env }), {});
    }
  }
  for (const url of [
    'not a URL',
    'http://inferencex.semianalysis.com/api',
    'https://inferencex.semianalysis.com.example/api',
    'https://other.example/api',
    'https://secret@inferencex.semianalysis.com/api',
  ]) {
    assert.deepEqual(requestHeaders(url, { env: {} }), {});
  }
  assert.deepEqual(requestHeaders(origin, { source: 'unknown', env: {} }), {});
});

test('each actual retry carries attribution, and opt-out removes both headers', async () => {
  const previous = process.env.INFERENCEX_TELEMETRY;
  const dnt = process.env.DO_NOT_TRACK;
  try {
    delete process.env.DO_NOT_TRACK;
    for (const disabled of [false, true]) {
      process.env.INFERENCEX_TELEMETRY = disabled ? '0' : '1';
      const sent = [];
      const client = createHttpClient({
        sleep: async () => {},
        random: () => 0,
        fetchImpl: (_url, options) => {
          sent.push(options.headers);
          return new Response('{}', { status: sent.length === 1 ? 503 : 200 });
        },
      });
      await client.get({
        operation: 'availability',
        url: `${origin}/api/v1/availability`,
        allowedStatuses: [200],
      });
      assert.equal(sent.length, 2);
      for (const headers of sent) {
        assert.equal(headers.accept, 'application/json');
        assert.equal(headers['user-agent'], disabled ? undefined : `inferencex-cli/${version}`);
        assert.equal('x-inferencex-traffic' in headers, !disabled);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.INFERENCEX_TELEMETRY;
    else process.env.INFERENCEX_TELEMETRY = previous;
    if (dnt === undefined) delete process.env.DO_NOT_TRACK;
    else process.env.DO_NOT_TRACK = dnt;
  }
});
