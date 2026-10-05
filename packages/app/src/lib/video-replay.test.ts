import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readVideoReplay } from './video-replay';

describe('retained video replay', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'video-replay-'));
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VIDEOGENX_REPLAY_DIR', directory);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true });
  });
  it('serves a complete local history with an explicit replay marker and empty later pages', async () => {
    const page = { schemaVersion: 1, entries: [{ id: '12.34' }], nextPage: null };
    await writeFile(join(directory, 'history.json'), JSON.stringify(page));
    const response = await readVideoReplay(new URLSearchParams('format=history'));
    expect(response?.headers.get('X-VideoGenX-Replay')).toBe('retained');
    expect(await response?.json()).toEqual(page);
    const laterPage = await readVideoReplay(new URLSearchParams('format=history&page=2'));
    expect(await laterPage?.json()).toEqual({ ...page, entries: [] });
  });
  it('is disabled in production even when the operator variable exists', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await readVideoReplay(new URLSearchParams('format=history'))).toBeNull();
  });
  it('returns unavailable media without a network fallback or a publication', async () => {
    const unavailable = await readVideoReplay(
      new URLSearchParams('format=published&run=12&artifact=34'),
    );
    expect(unavailable?.status).toBe(204);
    const invalid = await readVideoReplay(
      new URLSearchParams('format=published&run=../../secret&artifact=34'),
    );
    expect(invalid?.status).toBe(400);
  });
  it('rejects an artifact whose identity differs from its filename', async () => {
    await writeFile(
      join(directory, '12.34.json'),
      JSON.stringify({ storageVersion: 1, runId: '13', artifact: { id: 34 }, sources: [] }),
    );
    await expect(
      readVideoReplay(new URLSearchParams('format=published&run=12&artifact=34')),
    ).rejects.toThrow('identity mismatch');
  });
});
