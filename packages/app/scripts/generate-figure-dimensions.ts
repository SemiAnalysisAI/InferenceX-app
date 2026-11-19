/**
 * Records the pixel size of every MDX `<Figure>` image so the blog can render them through
 * next/image with fixed dimensions. Run after adding or replacing a figure:
 *
 *   bun run blog:figure-dimensions
 *
 * Local images are read from public/. Remote images are fetched with a Range request for
 * their header, falling back to the whole file when the size field lies further in.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { figureSources } from '../src/lib/blog/figure-sources';
import { imageDimensions, type ImageDimensions } from '../src/lib/blog/image-dimensions';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const CONTENT_DIR = path.join(APP_ROOT, 'content');
const MANIFEST_PATH = path.join(APP_ROOT, 'src/lib/blog/figure-dimensions.json');
const HEADER_BYTES = 256 * 1024;
const CONCURRENCY = 16;

async function remoteDimensions(src: string): Promise<ImageDimensions | null> {
  const head = await fetch(src, { headers: { Range: `bytes=0-${HEADER_BYTES - 1}` } });
  if (!head.ok) throw new Error(`${src}: HTTP ${head.status}`);
  const fromHeader = imageDimensions(new Uint8Array(await head.arrayBuffer()));
  if (fromHeader || head.status === 200) return fromHeader;
  const full = await fetch(src);
  if (!full.ok) throw new Error(`${src}: HTTP ${full.status}`);
  return imageDimensions(new Uint8Array(await full.arrayBuffer()));
}

async function dimensionsFor(src: string): Promise<ImageDimensions | null> {
  if (/^https?:\/\//u.test(src)) return remoteDimensions(src);
  return imageDimensions(new Uint8Array(await readFile(path.join(APP_ROOT, 'public', src))));
}

const contentFiles = await readdir(CONTENT_DIR, { recursive: true });
const files = contentFiles.filter((file) => file.endsWith('.mdx')).toSorted();
const sources = new Set<string>();
for (const file of files) {
  for (const src of figureSources(await readFile(path.join(CONTENT_DIR, file), 'utf8'))) {
    sources.add(src);
  }
}

const pending = [...sources].toSorted();
const manifest: Record<string, [number, number]> = {};
const failures: string[] = [];
for (let start = 0; start < pending.length; start += CONCURRENCY) {
  const batch = pending.slice(start, start + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(dimensionsFor));
  results.forEach((result, index) => {
    const src = batch[index];
    if (result.status === 'fulfilled' && result.value) {
      manifest[src] = [result.value.width, result.value.height];
    } else {
      failures.push(`${src}: ${result.status === 'rejected' ? result.reason : 'unknown format'}`);
    }
  });
}

if (failures.length > 0) {
  console.error(`Could not size ${failures.length} figure(s):\n${failures.join('\n')}`);
  process.exit(1);
}

const entries = Object.entries(manifest).map(
  ([src, [width, height]]) => `  ${JSON.stringify(src)}: [${width}, ${height}]`,
);
await writeFile(MANIFEST_PATH, `{\n${entries.join(',\n')}\n}\n`);
console.log(`Wrote ${Object.keys(manifest).length} figure sizes to ${MANIFEST_PATH}`);
