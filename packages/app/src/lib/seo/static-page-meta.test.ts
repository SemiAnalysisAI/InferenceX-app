import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';

import { META_DESCRIPTION_MAX } from '@/lib/seo/meta-text';

const APP_DIR = path.resolve(__dirname, '../../app');

/** Every non-dynamic route page that exports a static `metadata` object. */
function staticMetadataPages(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => path.basename(file) === 'page.tsx' && !file.includes('['))
    .filter((file) =>
      readFileSync(path.join(APP_DIR, file), 'utf8').includes('export const metadata'),
    )
    .sort();
}

describe('static page meta descriptions', () => {
  const pages = staticMetadataPages();

  it('finds the static index pages', () => {
    expect(pages).toContain(path.join('zh', 'chips', 'page.tsx'));
    expect(pages).toContain(path.join('quotes', 'page.tsx'));
  });

  it.each(pages)('%s fits its locale description budget', async (file) => {
    // Pages are discovered by scanning the app directory, so the specifier is only known at runtime.
    const { metadata } = (await import(path.join(APP_DIR, file))) as { metadata: Metadata };
    const locale = file.startsWith(`zh${path.sep}`) ? 'zh' : 'en';
    const description = metadata.description ?? '';
    expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX[locale]);
  });
});
