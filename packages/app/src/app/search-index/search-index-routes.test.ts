// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { getSiteSearchIndex } from '@/lib/site-search/build-index.server';
import { parseSearchIndexFile, parseSearchIndexManifest } from '@/lib/site-search/index-format';

import { GET as getFile, dynamicParams, generateStaticParams } from './[version]/[file]/route';
import { GET as getManifest } from './manifest.json/route';

function call(version: string, file: string) {
  return getFile(new Request(`https://x/search-index/${version}/${file}`), {
    params: Promise.resolve({ version, file }),
  });
}

describe('search index routes', () => {
  it('serves a revalidated manifest that names the generated files', async () => {
    const res = await getManifest();
    expect(res.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    const manifest = parseSearchIndexManifest(await res.json());
    expect(manifest).not.toBeNull();
    const params = await generateStaticParams();
    expect(params).toEqual([
      { version: manifest!.version, file: 'en.json' },
      { version: manifest!.version, file: 'zh.json' },
    ]);
    expect(dynamicParams).toBe(false);
  }, 60_000);

  it('serves each locale file as immutable and 404s for other versions', async () => {
    const { manifest } = await getSiteSearchIndex();
    const res = await call(manifest.version, 'zh.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    const file = parseSearchIndexFile(await res.json(), {
      version: manifest.version,
      locale: 'zh',
    });
    expect(file?.pages.length).toBe(manifest.locales.zh.pages);

    const unknownVersion = await call('0000000000000000', 'en.json');
    expect(unknownVersion.status).toBe(404);
    const unknownLocale = await call(manifest.version, 'fr.json');
    expect(unknownLocale.status).toBe(404);
  }, 60_000);
});
