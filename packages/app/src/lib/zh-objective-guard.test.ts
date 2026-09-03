import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compareBlogPair,
  compareEnglishSurfaces,
  findDictionaryParityViolations,
  findRoutePairViolations,
} from './zh-objective-guard';

const CHINESE_ONLY_SCRIPT = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'scripts',
  'check-zh-chinese-only.ts',
);

function fixtureGit(directory: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
}

function fixtureCommit(directory: string, message: string): string {
  fixtureGit(directory, 'add', '.');
  fixtureGit(directory, 'commit', '--no-verify', '-m', `test: ${message}`);
  return fixtureGit(directory, 'rev-parse', 'HEAD');
}

function runChineseOnlyGuard(directory: string, base: string, head: string): string {
  return execFileSync('bun', ['run', '--cwd', 'packages/app', 'guard:zh-copy:chinese-only'], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, ZH_GUARD_BASE_SHA: base, ZH_GUARD_HEAD_SHA: head },
  });
}

function fixtureRepository(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zh-objective-guard-'));
  fixtureGit(directory, 'init', '-q');
  fixtureGit(directory, 'config', 'user.name', 'Guard Test');
  fixtureGit(directory, 'config', 'user.email', 'guard@example.com');
  fs.mkdirSync(path.join(directory, 'packages/app/src'), { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'packages/app/package.json'),
    `${JSON.stringify(
      {
        scripts: {
          'guard:zh-copy:chinese-only': `bun ${JSON.stringify(CHINESE_ONLY_SCRIPT)} --chinese-only`,
        },
      },
      null,
      2,
    )}\n`,
  );
  return directory;
}

describe('objective Chinese guard', () => {
  describe('App Router parity', () => {
    const complete = [
      'src/app/(landing)/page.tsx',
      'src/app/zh/page.tsx',
      'src/app/(dashboard)/feedback/page.tsx',
      'src/app/zh/(dashboard)/feedback/page.tsx',
      'src/app/agentx/[slug]/page.tsx',
      'src/app/zh/agentx/[slug]/page.tsx',
    ];

    it.each([
      ['missing Chinese page', (file: string) => !file.includes('zh/agentx'), '/agentx/[slug]'],
      ['orphan Chinese page', () => true, '/orphan'],
    ])('reports a %s', (_name, keep, route) => {
      const pages = complete.filter(keep);
      if (route === '/orphan') pages.push('src/app/zh/orphan/page.tsx');
      expect(findRoutePairViolations(pages)).toEqual([
        expect.objectContaining({ rule: 'route-sibling', route }),
      ]);
    });

    it('applies one-sided exceptions only in their declared direction', () => {
      const pages = [...complete, 'src/app/preview/page.tsx', 'src/app/zh/[...notFound]/page.tsx'];
      const exceptions = {
        englishOnly: new Set(['/preview']),
        chineseOnly: new Set(['/[...notFound]']),
      };
      expect(findRoutePairViolations(pages, exceptions)).toEqual([]);
      expect(
        findRoutePairViolations(pages, {
          englishOnly: exceptions.chineseOnly,
          chineseOnly: exceptions.englishOnly,
        }),
      ).toHaveLength(2);
    });
  });

  describe('direct en/zh dictionary parity', () => {
    const accepted = `
      const COPY = {
        en: { title: 'Title', nested: { retry: 'Retry' } },
        zh: { title: '标题', nested: { retry: '重试' } },
      } as const;
    `;

    it('accepts equal explicit shapes and reports a nested mismatch', () => {
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

    it('reports each containing object that has only one locale', () => {
      const source = `
        const FIRST = { en: { title: 'Title' } };
        const SECOND = { zh: { title: '标题' } };
      `;
      expect(findDictionaryParityViolations('copy.ts', source)).toEqual([
        expect.objectContaining({ rule: 'dictionary-locale-pair' }),
        expect.objectContaining({ rule: 'dictionary-locale-pair' }),
      ]);
    });

    it('checks static shorthand keys but ignores computed and spread contents', () => {
      expect(
        findDictionaryParityViolations(
          'copy.ts',
          `const COPY = { en: { ...common, [key]: 'x', title }, zh: { ...common, [key]: '中', heading } };`,
        ),
      ).toEqual([
        expect.objectContaining({
          rule: 'dictionary-key-parity',
          missingFromEn: ['heading'],
          missingFromZh: ['title'],
        }),
      ]);
    });
  });

  describe('Chinese-only English preservation', () => {
    const base = `const COPY = { en: { title: 'Exact English' }, zh: { title: '旧文案' } };`;

    it('accepts a Chinese edit and rejects a changed English initializer byte', () => {
      expect(compareEnglishSurfaces('src/copy.ts', base, base.replace('旧文案', '新文案'))).toEqual(
        [],
      );
      expect(
        compareEnglishSurfaces('src/copy.ts', base, base.replace('Exact English', 'Exact english')),
      ).toEqual([expect.objectContaining({ rule: 'english-byte-preservation' })]);
    });

    it('keeps dictionary identity by rejecting swapped English initializers', () => {
      const before = `
        const FIRST = { en: { title: 'First' }, zh: { title: '甲' } };
        const SECOND = { en: { title: 'Second' }, zh: { title: '乙' } };
      `;
      const after = before
        .replace("title: 'First'", "title: 'TEMP'")
        .replace("title: 'Second'", "title: 'First'")
        .replace("title: 'TEMP'", "title: 'Second'");
      expect(compareEnglishSurfaces('src/copy.ts', before, after)).toEqual([
        expect.objectContaining({ rule: 'english-byte-preservation' }),
      ]);
    });

    it.each([
      ['content/blog/post.mdx', '# Exact\n', '# Changed\n', 1],
      ['src/copy.test.ts', base, 'anything', 0],
      ['src/plumbing.ts', 'export const x = 1;', 'export const x = 2;', 0],
      [
        'src/copy.json',
        `{"en":{"title":"Exact"},"zh":{"title":"旧"}}`,
        `{"en":{ "title":"Exact" },"zh":{"title":"旧"}}`,
        1,
      ],
    ])('applies the byte guard to %s', (file, before, after, count) => {
      expect(compareEnglishSurfaces(file, before, after)).toHaveLength(count);
    });
  });

  describe('paired Blog structure', () => {
    const en = `---
title: English
date: '2026-08-23'
---
[Article](/blog/next) and [section](#english-heading).
[Reference][docs]

[docs]: https://example.com/reference

<DashboardCTA enabled={score / total > 0} href={\`/blog/next\`}>Open</DashboardCTA>

Run \`--tensor-parallel-size=8\` for this configuration.

~~~bash
export MODEL_ID=DeepSeek-V4
~~~

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
      .replace('href={`/blog/next`}', 'href={`/zh/blog/next`}')
      .replace('>Open<', '>打开<')
      .replace('caption="Chart"', 'caption="图表"')
      .replace('https://inferencex.com/blog/post', 'https://inferencex.com/zh/blog/post')
      .replace('"name": "English"', '"name": "中文"');

    it('accepts translated prose and normalized internal links', () => {
      expect(compareBlogPair('post.mdx', en, zh)).toEqual([]);
    });

    it.each([
      ['fenced-code', 'MODEL_ID=DeepSeek-V4', 'MODEL_ID=DeepSeek-V4-Pro'],
      ['inline-code', '--tensor-parallel-size=8', '--tensor-parallel-size=4'],
      ['math', 'x = 8', 'x = 9'],
      ['figure-src', '/images/chart.png', '/images/other.png'],
      ['link-target', 'https://example.com/reference', 'https://example.com/other'],
      ['json-ld-shape', '"position": 8', '"rank": 8'],
      ['json-ld-protected-value', '"position": 8', '"position": 9'],
      ['json-ld-syntax', '"position": 8', '"position":'],
    ])('rejects the %s mutation', (rule, before, after) => {
      expect(compareBlogPair('post.mdx', en, zh.replace(before, after))).toContainEqual(
        expect.objectContaining({ rule }),
      );
    });

    it('parses Markdown images and static MDX href/src attributes as destinations', () => {
      const english = [
        '![chart](/images/chart.png)',
        '<ResourceCard href="/blog/source" src={`https://example.com/image.png`} />',
      ].join('\n');
      const chinese = english.replace('/blog/source', '/zh/blog/source');
      expect(compareBlogPair('links.mdx', english, chinese)).toEqual([]);
      expect(
        compareBlogPair('links.mdx', english, chinese.replace('image.png', 'other.png')),
      ).toContainEqual(expect.objectContaining({ rule: 'link-target' }));
    });

    it('allows Chinese prose to add inline-code formatting without dropping English identifiers', () => {
      expect(compareBlogPair('post.mdx', en, `${zh}\n补充 \`中文术语\`。\n`)).toEqual([]);
    });

    it('binds protected JSON-LD values to their object and array paths', () => {
      const english =
        '<JsonLd>{`{"@type":"ItemList","items":[{"url":"https://example.com/one"},{"url":"https://example.com/two"}]}`}</JsonLd>';
      const chinese = english
        .replace('https://example.com/one', 'https://example.com/TEMP')
        .replace('https://example.com/two', 'https://example.com/one')
        .replace('https://example.com/TEMP', 'https://example.com/two');
      expect(compareBlogPair('json-paths.mdx', english, chinese)).toContainEqual(
        expect.objectContaining({ rule: 'json-ld-protected-value' }),
      );
    });

    it('reports malformed MDX without running a fallback lexer', () => {
      expect(compareBlogPair('invalid.mdx', 'Valid prose.', '<Figure src={')).toContainEqual(
        expect.objectContaining({ rule: 'mdx-syntax' }),
      );
    });
  });
});

describe('Chinese-only CLI integration', () => {
  it('uses the repo-root app pathspec and detects one changed English byte', () => {
    const directory = fixtureRepository();
    try {
      const file = path.join(directory, 'packages/app/src/copy.ts');
      fs.writeFileSync(
        file,
        `export const COPY = { en: { title: 'Exact' }, zh: { title: '旧' } };\n`,
      );
      const base = fixtureCommit(directory, 'base');
      fs.writeFileSync(
        file,
        `export const COPY = { en: { title: 'Exact' }, zh: { title: '新' } };\n`,
      );
      const zhHead = fixtureCommit(directory, 'zh');
      expect(runChineseOnlyGuard(directory, base, zhHead)).toContain(
        'passed for 1 changed app file(s)',
      );

      fs.writeFileSync(
        file,
        `export const COPY = { en: { title: 'exact' }, zh: { title: '新' } };\n`,
      );
      const enHead = fixtureCommit(directory, 'en');
      expect(() => runChineseOnlyGuard(directory, base, enHead)).toThrow(/copy\.ts/u);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('protects en-bearing path identity while allowing locale-neutral renames', () => {
    const directory = fixtureRepository();
    try {
      const original = path.join(directory, 'packages/app/src/original.ts');
      const renamed = path.join(directory, 'packages/app/src/renamed.ts');
      const helper = path.join(directory, 'packages/app/src/helper.ts');
      const renamedHelper = path.join(directory, 'packages/app/src/renamed-helper.ts');
      fs.writeFileSync(
        original,
        `export const COPY = { en: { title: 'Exact' }, zh: { title: '旧' } };\n`,
      );
      fs.writeFileSync(helper, `export const locale = 'zh';\n`);
      const base = fixtureCommit(directory, 'base');

      fs.renameSync(helper, renamedHelper);
      const neutralHead = fixtureCommit(directory, 'rename locale-neutral helper');
      expect(runChineseOnlyGuard(directory, base, neutralHead)).toContain(
        'passed for 1 changed app file(s)',
      );

      fs.renameSync(original, renamed);
      const protectedHead = fixtureCommit(directory, 'rename protected dictionary');
      expect(() => runChineseOnlyGuard(directory, base, protectedHead)).toThrow(
        /original\.ts|renamed\.ts/u,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
