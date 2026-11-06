import { randomBytes } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readZipEntries } from './zip-range';

describe('readZipEntries', () => {
  it('reads documents around a large video through a few small ranges', async () => {
    const documents = {
      'ci.json': JSON.stringify({ phase: 'complete' }),
      'gpu/c1/aggregate.json': JSON.stringify({ cluster: 'b200', valid: 20 }),
      'manifest.json': JSON.stringify({ run_id: '42155754705', run_attempt: '2' }),
    };
    const zip = zipSync({
      'ci.json': strToU8(documents['ci.json']),
      'gpu/c1/baseline/artifacts/measurement-r001-c001.mp4': [randomBytes(4 * 1024 ** 2), {}],
      'gpu/c1/aggregate.json': [
        strToU8(documents['gpu/c1/aggregate.json']),
        { extra: { 0x5455: new Uint8Array(9) } },
      ],
      'manifest.json': strToU8(documents['manifest.json']),
    });
    let fetched = 0;
    const files = await readZipEntries(
      (start, end) => {
        fetched += end - start;
        return Promise.resolve(zip.slice(start, end));
      },
      zip.length,
      (name) => name.endsWith('.json'),
    );
    expect(
      Object.fromEntries(
        [...files].map(([name, bytes]) => [name, new TextDecoder().decode(bytes)]),
      ),
    ).toEqual(documents);
    expect(fetched).toBeLessThan(zip.length / 20);
  });
});
