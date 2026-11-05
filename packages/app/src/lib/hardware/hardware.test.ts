import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import {
  buildHardwareArticleJsonLd,
  buildHardwareBreadcrumbJsonLd,
  buildHardwareIndexJsonLd,
  getAllHardwarePages,
  getHardwarePageBySlug,
  hardwareFrontmatterErrors,
  hardwareIndexMetadata,
  hardwareIndexPath,
  hardwareOgImageUrl,
  type HardwarePageMeta,
  hardwarePageMetadata,
  hardwarePagePath,
  hasZhHardwarePage,
  parseHardwareFrontmatter,
} from './hardware';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, default: { ...actual } };
});

const CONTENT_DIR = path.join(process.cwd(), 'content', 'hardware');
const VR = 'vera-rubin-nvl72-vs-gb300-nvl72-agentx-results';
const TPU = 'tpu-v7-ironwood-vs-gb300-nvl72-agentx-results';

const VALID = {
  title: 'Vera Rubin NVL72 vs GB300 NVL72 on AgentX',
  seoDescription: 'Vera Rubin NVL72 serves 1.8x to 2.0x the tokens per dollar of GB300 NVL72.',
  date: '2026-10-19',
  publishDate: '2026-10-19',
  tags: ['agentx', 'rubin'],
  lede: 'Vera Rubin NVL72 serves **1.8x to 2.0x as many tokens per dollar** as GB300 NVL72.',
  links: [
    {
      label: 'Open the AgentX dashboard',
      href: 'https://inferencex.semianalysis.com/inference?i_seq=agentic-traces',
    },
    { label: 'Read the methodology', href: '/agentx/methodology' },
  ],
};

function withChanges(changes: Record<string, unknown>): Record<string, unknown> {
  return { ...structuredClone(VALID), ...changes };
}

function pageSource(fields: Record<string, unknown>, body: string): string {
  return `---\n${JSON.stringify(fields, null, 2)}\n---\n\n${body}\n`;
}

function mockContent(files: Record<string, string>) {
  const resolve = (target: string) => files[path.relative(CONTENT_DIR, target)];
  vi.spyOn(fs, 'existsSync').mockImplementation(
    (target) => String(target) === CONTENT_DIR || resolve(String(target)) !== undefined,
  );
  vi.spyOn(fs, 'readdirSync').mockReturnValue([
    'zh',
    ...Object.keys(files).filter((file) => !file.includes('/')),
  ] as never);
  vi.spyOn(fs, 'readFileSync').mockImplementation((target) => resolve(String(target)) ?? '');
}

const META: HardwarePageMeta = { ...VALID, slug: VR, readingTime: 9 };

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hardwareFrontmatterErrors', () => {
  it('accepts the documented schema', () => {
    expect(hardwareFrontmatterErrors(VALID)).toEqual([]);
    expect(hardwareFrontmatterErrors(withChanges({ links: VALID.links.slice(0, 1) }))).toEqual([]);
  });

  it('rejects non-mapping frontmatter', () => {
    expect(hardwareFrontmatterErrors(null)).toEqual(['frontmatter must be a YAML mapping']);
    expect(hardwareFrontmatterErrors(['title'])).toEqual(['frontmatter must be a YAML mapping']);
  });

  it('reports missing text fields and leftover blog or highlight fields', () => {
    expect(
      hardwareFrontmatterErrors(
        withChanges({ title: undefined, lede: ' ', subtitle: 'Blog subtitle', highlights: [] }),
      ),
    ).toEqual([
      'frontmatter has unknown field "subtitle"',
      'frontmatter has unknown field "highlights"',
      'title must be a non-empty string',
      'lede must be a non-empty string',
    ]);
  });

  it.each([
    ['an unquoted YAML date', new Date('2026-10-19T00:00:00Z')],
    ['an impossible calendar date', '2026-02-30'],
    ['a timestamp', '2026-10-19T00:00:00Z'],
  ])('rejects %s', (_case, date) => {
    expect(hardwareFrontmatterErrors(withChanges({ date }))).toEqual([
      "date must be a quoted 'YYYY-MM-DD' date",
    ]);
  });

  it.each([[[]], [['agentx', 3]], ['agentx']])('rejects tags %j', (tags) => {
    expect(hardwareFrontmatterErrors(withChanges({ tags }))).toEqual([
      'tags must be a non-empty list of strings',
    ]);
  });

  it.each([
    [
      'an unclosed bold marker',
      'Serves **1.8x as many tokens',
      'lede must close every ** bold marker',
    ],
    [
      'a markdown link',
      'Serves 1.8x, see [the method](/agentx/methodology).',
      'lede supports **bold** only; move links and code into the body',
    ],
    [
      'inline code',
      'Runs `--tp 8` on **Vera Rubin**.',
      'lede supports **bold** only; move links and code into the body',
    ],
  ])('rejects a lede with %s', (_case, lede, error) => {
    expect(hardwareFrontmatterErrors(withChanges({ lede }))).toEqual([error]);
  });

  it('requires one or two links with safe destinations', () => {
    expect(hardwareFrontmatterErrors(withChanges({ links: [] }))).toEqual([
      'links must list 1 to 2 items; the first one is the primary button',
    ]);
    expect(
      hardwareFrontmatterErrors(withChanges({ links: [...VALID.links, VALID.links[0]] })),
    ).toEqual(['links must list 1 to 2 items; the first one is the primary button']);
    expect(
      hardwareFrontmatterErrors(
        withChanges({
          links: [{ label: 'Email', href: 'mailto:team@semianalysis.com' }, { href: '/agentx' }],
        }),
      ),
    ).toEqual([
      'links[0].href must be a root-relative path or an https URL',
      'links[1].label must be a non-empty string',
    ]);
    expect(
      hardwareFrontmatterErrors(
        withChanges({
          links: [
            { label: 'Protocol-relative', href: '//example.com/agentx' },
            { label: 'Plain HTTP', href: 'http://inferencex.semianalysis.com' },
          ],
        }),
      ),
    ).toEqual([
      'links[0].href must be a root-relative path or an https URL',
      'links[1].href must be a root-relative path or an https URL',
    ]);
  });
});

describe('parseHardwareFrontmatter', () => {
  it('returns valid frontmatter unchanged', () => {
    expect(parseHardwareFrontmatter(VALID, 'content/hardware/x.mdx')).toEqual(VALID);
  });

  it('names the file and lists every problem', () => {
    expect(() =>
      parseHardwareFrontmatter(withChanges({ title: '', links: [] }), 'content/hardware/x.mdx'),
    ).toThrow(
      'Invalid hardware page frontmatter in content/hardware/x.mdx:\n- title must be a non-empty string\n- links must list 1 to 2 items; the first one is the primary button',
    );
  });
});

describe('reading hardware pages', () => {
  const body = '## Summary\n\nVera Rubin NVL72 leads GB300 NVL72 on every AgentX model.';
  const files = {
    [`${VR}.mdx`]: pageSource(VALID, body),
    [`${TPU}.mdx`]: pageSource(
      withChanges({
        title: 'TPU v7 vs GB300 NVL72',
        date: '2026-10-18',
        publishDate: '2099-01-01',
      }),
      body,
    ),
    [`zh/${VR}.mdx`]: pageSource(withChanges({ title: 'Vera Rubin NVL72 对比 GB300 NVL72' }), body),
  };

  it('lists English pages newest first with slug and reading time', () => {
    mockContent(files);
    expect(getAllHardwarePages().map((page) => [page.slug, page.title, page.readingTime])).toEqual([
      [VR, VALID.title, 1],
      [TPU, 'TPU v7 vs GB300 NVL72', 1],
    ]);
  });

  it('breaks date ties by slug so the order does not depend on the file system', () => {
    mockContent({
      [`${VR}.mdx`]: files[`${VR}.mdx`],
      [`${TPU}.mdx`]: pageSource(withChanges({ title: 'TPU v7 vs GB300 NVL72' }), body),
    });
    expect(getAllHardwarePages().map((page) => page.slug)).toEqual([TPU, VR]);
  });

  it('hides pages whose English publishDate is in the future in production, in both locales', () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockContent({ ...files, [`zh/${TPU}.mdx`]: files[`${TPU}.mdx`] });
    expect(getAllHardwarePages().map((page) => page.slug)).toEqual([VR]);
    expect(getAllHardwarePages('zh').map((page) => page.slug)).toEqual([VR]);
  });

  it('lists only translated pages in Chinese, with the Chinese frontmatter', () => {
    mockContent(files);
    expect(getAllHardwarePages('zh').map((page) => [page.slug, page.title])).toEqual([
      [VR, 'Vera Rubin NVL72 对比 GB300 NVL72'],
    ]);
    expect(hasZhHardwarePage(VR)).toBe(true);
    expect(hasZhHardwarePage(TPU)).toBe(false);
  });

  it('returns a page by slug with its raw body, or null when it does not exist', () => {
    mockContent(files);
    const page = getHardwarePageBySlug(VR);
    expect(page?.meta).toEqual({ ...VALID, slug: VR, readingTime: 1 });
    expect(page?.raw.trim()).toBe(body);
    expect(getHardwarePageBySlug(TPU, 'zh')).toBeNull();
    expect(getHardwarePageBySlug('missing-page')).toBeNull();
  });

  it('fails loudly on a page with invalid frontmatter', () => {
    mockContent({
      [`${VR}.mdx`]: pageSource(withChanges({ subtitle: 'Old blog subtitle' }), body),
    });
    expect(() => getAllHardwarePages()).toThrow(
      `Invalid hardware page frontmatter in ${path.join('content', 'hardware', `${VR}.mdx`)}:\n- frontmatter has unknown field "subtitle"`,
    );
  });

  it('returns no pages when the content directory is missing', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(getAllHardwarePages()).toEqual([]);
  });
});

describe('hardware paths', () => {
  it('builds locale-aware index, page, and OG image URLs', () => {
    expect(hardwareIndexPath()).toBe('/hardware');
    expect(hardwareIndexPath('zh')).toBe('/zh/hardware');
    expect(hardwarePagePath(VR)).toBe(`/hardware/${VR}`);
    expect(hardwarePagePath(VR, 'zh')).toBe(`/zh/hardware/${VR}`);
    expect(hardwareOgImageUrl(VR)).toBe(`${SITE_URL}/hardware/${VR}/opengraph-image`);
    expect(hardwareOgImageUrl(VR, 'zh')).toBe(`${SITE_URL}/zh/hardware/${VR}/opengraph-image`);
  });
});

describe('hardware metadata', () => {
  const languages = {
    en: `${SITE_URL}/hardware/${VR}`,
    'zh-CN': `${SITE_URL}/zh/hardware/${VR}`,
    'x-default': `${SITE_URL}/hardware/${VR}`,
  };

  it('links a translated English page to its Chinese sibling', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const metadata = hardwarePageMetadata(META, 'en');
    expect(metadata.title).toEqual({ absolute: `${VALID.title} | InferenceX` });
    expect(metadata.description).toBe(VALID.seoDescription);
    expect(metadata.alternates).toEqual({ canonical: languages.en, languages });
    expect(metadata.openGraph).toMatchObject({
      url: languages.en,
      type: 'article',
      publishedTime: '2026-10-19T00:00:00Z',
      tags: VALID.tags,
    });
    expect(metadata.openGraph).not.toHaveProperty('locale');
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', title: VALID.title });
  });

  it('omits hreflang alternates when the Chinese sibling is missing', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(hardwarePageMetadata(META, 'en').alternates).toEqual({ canonical: languages.en });
  });

  it('canonicalizes the Chinese page to /zh with the zh_CN OpenGraph locale', () => {
    const metadata = hardwarePageMetadata(META, 'zh');
    expect(metadata.alternates).toEqual({ canonical: languages['zh-CN'], languages });
    expect(metadata.openGraph).toMatchObject({ url: languages['zh-CN'], locale: 'zh_CN' });
  });

  it('describes the index in both languages', () => {
    expect(hardwareIndexMetadata('en')).toMatchObject({
      title: 'Hardware Results',
      alternates: { canonical: `${SITE_URL}/hardware` },
      openGraph: { url: `${SITE_URL}/hardware` },
    });
    expect(hardwareIndexMetadata('zh')).toMatchObject({
      title: '硬件结果',
      alternates: { canonical: `${SITE_URL}/zh/hardware` },
      openGraph: { url: `${SITE_URL}/zh/hardware`, locale: 'zh_CN' },
    });
  });
});

describe('hardware JSON-LD', () => {
  it('emits an Article for the localized page URL', () => {
    expect(buildHardwareArticleJsonLd(META, 'one two three four', 'zh')).toMatchObject({
      '@type': 'Article',
      headline: VALID.title,
      description: VALID.seoDescription,
      url: `${SITE_URL}/zh/hardware/${VR}`,
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/zh/hardware/${VR}` },
      image: `${SITE_URL}/zh/hardware/${VR}/opengraph-image`,
      datePublished: '2026-10-19T00:00:00Z',
      inLanguage: 'zh-CN',
      wordCount: 4,
      timeRequired: 'PT9M',
    });
    expect(buildHardwareArticleJsonLd(META, 'body')).not.toHaveProperty('dateModified');
  });

  it('builds Home > Hardware Results > page breadcrumbs in each language', () => {
    expect(buildHardwareBreadcrumbJsonLd(META).itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Hardware Results', item: `${SITE_URL}/hardware` },
      { '@type': 'ListItem', position: 3, name: VALID.title, item: `${SITE_URL}/hardware/${VR}` },
    ]);
    expect(buildHardwareBreadcrumbJsonLd(META, 'zh').itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: '首页', item: `${SITE_URL}/zh` },
      { '@type': 'ListItem', position: 2, name: '硬件结果', item: `${SITE_URL}/zh/hardware` },
      {
        '@type': 'ListItem',
        position: 3,
        name: VALID.title,
        item: `${SITE_URL}/zh/hardware/${VR}`,
      },
    ]);
  });

  it('lists every page in the index CollectionPage', () => {
    expect(buildHardwareIndexJsonLd([META], 'en')).toMatchObject({
      '@type': 'CollectionPage',
      url: `${SITE_URL}/hardware`,
      inLanguage: 'en-US',
      hasPart: [
        {
          '@type': 'Article',
          headline: VALID.title,
          url: `${SITE_URL}/hardware/${VR}`,
          datePublished: '2026-10-19T00:00:00Z',
        },
      ],
    });
  });
});
