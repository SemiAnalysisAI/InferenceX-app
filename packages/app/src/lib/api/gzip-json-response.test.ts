import { gzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { GZIP_JSON_CONTENT_TYPE, readJsonResponse } from './gzip-json-response';

const payload = { version: 6, requests: [{ cid: 'a', ack: null }] };

describe('readJsonResponse', () => {
  it('decompresses a content blob served as application/gzip', async () => {
    const response = new Response(gzipSync(JSON.stringify(payload)), {
      headers: { 'Content-Type': GZIP_JSON_CONTENT_TYPE },
    });
    expect(await readJsonResponse(response)).toEqual(payload);
  });

  it('parses JSON the browser already decoded', async () => {
    expect(await readJsonResponse(Response.json(payload))).toEqual(payload);
  });
});
