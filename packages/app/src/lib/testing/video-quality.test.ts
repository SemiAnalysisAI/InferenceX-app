import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from '@/components/video-benchmark/bundle';
import { referenceQualityFixture } from '@/components/video-benchmark/reference-quality.fixture';
import { readLocalVideoQuality } from './video-quality';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture() {
  const f = referenceQualityFixture();
  const dir = await mkdtemp(join(tmpdir(), 'reference-quality-'));
  dirs.push(dir);
  const mediaPath = join(dir, 'drum-taps/reference.mp4');
  await mkdir(join(dir, 'drum-taps'));
  const media = 'test-only-reference-bytes';
  const mediaSha = await sha256(new Blob([media]));
  f.receipt.cases[0].sha256['reference.mp4'] = mediaSha;
  f.attachment.pairs[0].reference.media_sha256 = mediaSha;
  const receiptText = JSON.stringify(f.receipt),
    receiptSha = await sha256(new Blob([receiptText]));
  const sums = `${receiptSha}  reference.json\n${mediaSha}  drum-taps/reference.mp4\n`;
  f.attachment.references = [
    {
      receipt_path: join(dir, 'reference.json'),
      receipt_sha256: receiptSha,
      checksums_sha256: await sha256(new Blob([sums])),
    },
  ];
  f.attachment.pairs[0].reference.receipt_sha256 = receiptSha;
  const text = JSON.stringify(f.attachment);
  const config = { path: join(dir, 'quality.json'), sha256: await sha256(new Blob([text])) };
  await Promise.all([
    writeFile(mediaPath, media),
    writeFile(join(dir, 'reference.json'), receiptText),
    writeFile(join(dir, 'SHA256SUMS'), sums),
    writeFile(config.path, text),
  ]);
  return { ...f, config, dir, mediaPath, mediaSha, receiptSha };
}

describe('local quality attachment byte verification', () => {
  it('reads only sealed reference media and returns no private filesystem paths', async () => {
    const f = await fixture();
    const result = await readLocalVideoQuality(f.config, [f.stored]);
    expect(result.pairs[0].psnrDb).toBe(25);
    expect(await result.media.get(f.receiptSha)?.get('drum-taps/reference.mp4')?.text()).toBe(
      'test-only-reference-bytes',
    );
    expect(JSON.stringify(result.pairs)).not.toContain(f.dir);
    expect(result.pairs[0].reference.url).toBe('');
  });
  it.each(['attachment', 'receipt', 'inventory', 'media'])(
    'rejects tampered %s bytes',
    async (defect) => {
      const f = await fixture();
      const paths = {
        attachment: f.config.path,
        receipt: join(f.dir, 'reference.json'),
        inventory: join(f.dir, 'SHA256SUMS'),
        media: f.mediaPath,
      };
      await writeFile(paths[defect as keyof typeof paths], 'tampered');
      await expect(readLocalVideoQuality(f.config, [f.stored])).rejects.toThrow('SHA256 mismatch');
    },
  );
});
