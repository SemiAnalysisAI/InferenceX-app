import { describe, expect, it } from 'vitest';

import {
  compareBlogPair,
  compareEnglishSurfaces,
  dictionaryViolationFingerprint,
  findBlogPairViolations,
  findDictionaryParityViolations,
  findMechanicalCopyViolations,
  findRoutePairViolations,
  type BlogGuardException,
  type DictionaryGuardException,
} from './zh-objective-guard';

describe('objective Chinese guard mutations', () => {
  describe('route siblings', () => {
    const complete = [
      'src/app/(landing)/page.tsx',
      'src/app/zh/page.tsx',
      'src/app/(dashboard)/feedback/page.tsx',
      'src/app/zh/(dashboard)/feedback/page.tsx',
      'src/app/agentx/[slug]/page.tsx',
      'src/app/zh/agentx/[slug]/page.tsx',
    ];

    it('rejects a missing Chinese page and accepts a complete dynamic/gated route tree', () => {
      expect(findRoutePairViolations(complete)).toEqual([]);
      expect(
        findRoutePairViolations(complete.filter((file) => !file.includes('zh/agentx'))),
      ).toEqual([expect.objectContaining({ rule: 'route-sibling', route: '/agentx/[slug]' })]);
    });

    it('rejects an orphan Chinese page', () => {
      expect(findRoutePairViolations([...complete, 'src/app/zh/orphan/page.tsx'])).toEqual([
        expect.objectContaining({ rule: 'route-sibling', route: '/orphan' }),
      ]);
    });
  });

  describe('generic en/zh dictionaries', () => {
    const accepted = `
      const COPY = {
        en: { title: 'Title', nested: { retry: 'Retry' } },
        zh: { title: '标题', nested: { retry: '重试' } },
      } as const;
    `;

    it('rejects a missing nested key and accepts equal structural keys', () => {
      expect(findDictionaryParityViolations('copy.ts', accepted)).toEqual([]);
      expect(
        findDictionaryParityViolations(
          'copy.ts',
          accepted.replace("retry: '重试'", "again: '重试'"),
        ),
      ).toEqual([
        expect.objectContaining({
          rule: 'dictionary-key-parity',
          missingFromEn: ['nested.again'],
          missingFromZh: ['nested.retry'],
        }),
      ]);
    });

    it('rejects removal of an entire locale dictionary', () => {
      expect(
        findDictionaryParityViolations('copy.ts', `const COPY = { en: { title: 'Title' } };`),
      ).toEqual([expect.objectContaining({ rule: 'dictionary-locale-count' })]);
    });

    it('accepts computed and spread-backed dictionaries it cannot prove structurally', () => {
      expect(
        findDictionaryParityViolations(
          'dynamic.ts',
          `const COPY = { en: { ...common, [key]: 'x' }, zh: { ...common, [key]: '中' } };`,
        ),
      ).toEqual([]);
    });

    it('accepts only an exact temporary mismatch fingerprint', () => {
      const mismatch = accepted.replace("retry: '重试'", "again: '重试'");
      const [violation] = findDictionaryParityViolations('copy.ts', mismatch);
      const exception: DictionaryGuardException = {
        file: 'copy.ts',
        mismatchSha256: dictionaryViolationFingerprint(violation),
        reason: 'Owned by another independent page branch.',
        removeWhen: 'Delete when that branch aligns the dictionary.',
      };
      expect(findDictionaryParityViolations('copy.ts', mismatch, [exception])).toEqual([]);
      expect(
        findDictionaryParityViolations(
          'copy.ts',
          mismatch.replace("title: '标题'", "heading: '标题'"),
          [exception],
        ),
      ).toHaveLength(1);
    });
  });

  describe('explicit Chinese-only English preservation', () => {
    const base = `const COPY = { en: { title: 'Exact English' }, zh: { title: '旧文案' } };`;

    it('accepts a Chinese subtree edit and rejects one changed English byte', () => {
      expect(compareEnglishSurfaces('src/copy.ts', base, base.replace('旧文案', '新文案'))).toEqual(
        [],
      );
      expect(
        compareEnglishSurfaces('src/copy.ts', base, base.replace('Exact English', 'Exact english')),
      ).toEqual([expect.objectContaining({ rule: 'english-byte-preservation' })]);
    });

    it('protects an English MDX file byte-for-byte but ignores tests and locale plumbing', () => {
      expect(
        compareEnglishSurfaces('content/blog/post.mdx', '# Exact\n', '# Changed\n'),
      ).toHaveLength(1);
      expect(compareEnglishSurfaces('src/copy.test.ts', base, 'anything')).toEqual([]);
      expect(
        compareEnglishSurfaces('src/plumbing.ts', 'export const x = 1;', 'export const x = 2;'),
      ).toEqual([]);
    });

    it('compares raw JSON en subtree bytes instead of parsed values', () => {
      const baseJson = `{"en":{"title":"Exact"},"zh":{"title":"旧"}}`;
      expect(
        compareEnglishSurfaces('src/copy.json', baseJson, baseJson.replace('旧', '新')),
      ).toEqual([]);
      expect(
        compareEnglishSurfaces(
          'src/copy.json',
          baseJson,
          baseJson.replace('{"title":"Exact"}', '{ "title":"Exact" }'),
        ),
      ).toHaveLength(1);
    });
  });

  describe('paired blog invariants', () => {
    const en = `---
title: English
date: '2026-08-23'
publishDate: '2026-08-24'
tags:
  - benchmark
---
[Article](/blog/next) and [section](#english-heading).
PUBLIC_MODEL_ID remains stable.

\`--tensor-parallel-size=8\` uses \`tok/s/user\`.

\`\`\`bash
export MODEL_ID=DeepSeek-V4
\`\`\`

$$
x = 8
$$

<Figure src="/images/chart.png" caption="Chart" />

<JsonLd>{\`{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "url": "https://inferencex.com/blog/post",
  "position": 8,
  "name": "English"
}\`}</JsonLd>
`;
    const zh = en
      .replace('title: English', 'title: 中文')
      .replace('[Article](/blog/next)', '[文章](/zh/blog/next)')
      .replace('[section](#english-heading)', '[章节](#中文标题)')
      .replace(' uses ', ' 使用 ')
      .replace('caption="Chart"', 'caption="图表"')
      .replace('https://inferencex.com/blog/post', 'https://inferencex.com/zh/blog/post')
      .replace('"name": "English"', '"name": "中文"');

    it('accepts translated prose and documented localized links', () => {
      expect(compareBlogPair('post.mdx', en, zh, [])).toEqual([]);
    });

    it('rejects missing and orphan Blog siblings in both directions', () => {
      expect(findBlogPairViolations(['one.mdx'], ['one.mdx'])).toEqual([]);
      expect(findBlogPairViolations(['one.mdx', 'two.mdx'], ['one.mdx', 'orphan.mdx'])).toEqual([
        expect.objectContaining({ rule: 'blog-sibling', file: 'orphan.mdx' }),
        expect.objectContaining({ rule: 'blog-sibling', file: 'two.mdx' }),
      ]);
    });

    it.each([
      ['fenced-code', 'DeepSeek-V4', 'DeepSeek-V4-Pro'],
      ['math', 'x = 8', 'x = 9'],
      ['figure-src', '/images/chart.png', '/images/other.png'],
      ['inline-code', '--tensor-parallel-size=8', '--tensor-parallel-size=4'],
      ['protected-token', 'PUBLIC_MODEL_ID remains', 'PUBLIC_MODEL_NAME remains'],
      ['link-target', '/zh/blog/next', 'https://example.com/next'],
      ['json-ld-shape', '"position": 8', '"rank": 8'],
      ['json-ld-protected-value', '"position": 8', '"position": 9'],
      ['json-ld-syntax', '"position": 8', '"position":'],
    ])('rejects the %s mutation', (rule, before, after) => {
      expect(compareBlogPair('post.mdx', en, zh.replace(before, after), [])).toContainEqual(
        expect.objectContaining({ rule }),
      );
    });

    it('requires each protected-inline exception to match both exact sides', () => {
      const changedZh = zh.replace('`tok/s/user`', '`token/秒/用户`');
      const exception: BlogGuardException = {
        rule: 'inline-code',
        file: 'post.mdx',
        en: 'tok/s/user',
        zh: 'token/秒/用户',
        reason: 'Temporary migration example.',
        removeWhen: 'Delete after the article rewrite lands.',
      };
      expect(compareBlogPair('post.mdx', en, changedZh, [exception])).toEqual([]);
      expect(
        compareBlogPair('post.mdx', en, changedZh.replace('token/秒/用户', '令牌/秒'), [exception]),
      ).toContainEqual(expect.objectContaining({ rule: 'inline-code' }));
    });
  });

  describe('conservative terminology and punctuation', () => {
    it.each([
      ['chip-untranslated', '每颗 Chip 的吞吐量', '每颗芯片的吞吐量'],
      ['duplicated-technical-loanword', '执行 warmup 预热', '执行 warmup'],
      ['malformed-chinese-punctuation', '这里有空格 。', '这里没有空格。'],
      [
        'hardcoded-english-label',
        "const COPY = { zh: {} }; const x = '<strong>Concurrency:</strong>';",
        String.raw`const COPY = { zh: {} }; const x = '<strong>\${t.concurrency}：</strong>';`,
      ],
    ])('rejects %s and accepts its objective fix', (rule, before, after) => {
      expect(findMechanicalCopyViolations('copy.ts', before)).toContainEqual(
        expect.objectContaining({ rule }),
      );
      expect(findMechanicalCopyViolations('copy.ts', after)).toEqual([]);
    });

    it('keeps units, identifiers, Chinese-first explanations, and valid punctuation exempt', () => {
      expect(
        findMechanicalCopyViolations(
          'copy.ts',
          '吞吐量为 tok/s/chip，ChipSKU 保持原样；预热（warmup）用于解释概念。',
        ),
      ).toEqual([]);
    });
  });
});
