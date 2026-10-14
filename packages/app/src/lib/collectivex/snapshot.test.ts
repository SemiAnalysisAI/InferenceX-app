import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRunSummary } from '@semianalysisai/inferencex-db/collectivex/reader';
import { makeCollectiveXDataset } from '@semianalysisai/inferencex-db/collectivex/test-fixture';

const mocks = vi.hoisted(() => ({ fixturesMode: false, loadFixture: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  get FIXTURES_MODE() {
    return mocks.fixturesMode;
  },
}));
vi.mock('@/lib/testing/test-fixtures', () => ({ loadFixture: mocks.loadFixture }));

const dataset = makeCollectiveXDataset();
const snapshot = { summary: buildRunSummary(dataset), dataset };
let root: string;

// The loader caches per module instance, as it does per server instance.
async function freshLoader() {
  vi.resetModules();
  const snapshotModule = await import('./snapshot');
  return snapshotModule.loadCollectiveXSnapshot;
}

function writeSnapshot(body: string) {
  mkdirSync(join(root, '.collectivex'), { recursive: true });
  writeFileSync(join(root, '.collectivex', 'snapshot.json'), body);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cx-snapshot-'));
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  mocks.fixturesMode = false;
  mocks.loadFixture.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('loadCollectiveXSnapshot', () => {
  it('resolves null when the build wrote no snapshot', async () => {
    const load = await freshLoader();
    expect(await load()).toBeNull();
  });

  it('reads the bundled snapshot once per server instance', async () => {
    writeSnapshot(JSON.stringify(snapshot));
    const load = await freshLoader();
    expect(await load()).toEqual(snapshot);

    rmSync(join(root, '.collectivex'), { recursive: true });
    expect(await load()).toEqual(snapshot);
  });

  it('rejects an unreadable snapshot instead of serving it', async () => {
    writeSnapshot('{"summary":{}}');
    await expect((await freshLoader())()).rejects.toThrow(
      '.collectivex/snapshot.json is not a CollectiveX snapshot',
    );
    writeSnapshot('{');
    await expect((await freshLoader())()).rejects.toThrow(SyntaxError);
  });

  it('serves the cypress fixture dataset in fixture mode', async () => {
    mocks.fixturesMode = true;
    mocks.loadFixture.mockReturnValue(dataset);
    expect(await (await freshLoader())()).toEqual(snapshot);
    expect(mocks.loadFixture).toHaveBeenCalledWith('collectivex-latest');
  });
});
