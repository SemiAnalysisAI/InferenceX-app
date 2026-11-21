import fs from 'node:fs';
import path from 'node:path';
import { compileMDX } from 'next-mdx-remote/rsc';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'bun:test';

import { compareBlogPair } from '../i18n/zh-objective-guard';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const CONTENT_DIR = path.join(APP_DIR, 'content', 'blog');
const ZH_DIR = path.join(CONTENT_DIR, 'zh');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const enFiles = fs
  .readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .toSorted();
const zhFiles = fs
  .readdirSync(ZH_DIR)
  .filter((f) => f.endsWith('.mdx'))
  .toSorted();

const read = (file: string) => fs.readFileSync(file, 'utf8');

function frontmatterField(raw: string, field: string): string | null {
  const fm = raw.split('---')[1] ?? '';
  const match = new RegExp(`^${field}:\\s*(?<value>.*)$`, 'mu').exec(fm);
  return match?.groups ? match.groups.value.trim() : null;
}

function tagList(raw: string): string[] {
  const fm = raw.split('---')[1] ?? '';
  const match = /^tags:\s*\n(?<items>(?:[ \t]+-[^\n]*(?:\n|$))+)/mu.exec(fm);
  if (!match?.groups) return [];
  return [...match.groups.items.matchAll(/^\s+-\s+(?<tag>.*)$/gmu)].map((item) =>
    item.groups!.tag.trim(),
  );
}

function localImageRefs(raw: string): string[] {
  return [
    ...raw.matchAll(/src="(?<path>\/[^"]+)"/gu),
    ...raw.matchAll(/!\[[^\]]*\]\((?<path>\/[^)]+)\)/gu),
  ].map((m) => m.groups!.path);
}

const countMathFences = (raw: string) => (raw.match(/^\$\$\s*$/gmu) ?? []).length;

describe.each([
  { slug: 'huawei-deepseek', date: '2026-10-21', figures: 24, author: 'Bryan Shan' },
  {
    slug: 'dissecting-nvidia-blackwell-tensor',
    date: '2026-03-31',
    figures: 27,
    author: 'Kimbo Chen',
  },
])('accelerator newsletter port: $slug', ({ slug, date, figures, author }) => {
  it.each(['en', 'zh'])(
    'keeps attribution, public boundaries, and local figures in %s',
    async (locale) => {
      const raw = read(path.join(locale === 'en' ? CONTENT_DIR : ZH_DIR, `${slug}.mdx`));
      expect(frontmatterField(raw, 'date')).toBe(`'${date}'`);
      expect(frontmatterField(raw, 'publishDate')).toBe(`'${date}'`);
      expect(raw).toContain(author);
      expect(raw).toContain('Dylan Patel');
      expect(raw).toContain(`https://newsletter.semianalysis.com/p/${slug}`);
      expect(raw).toContain(locale === 'en' ? 'subscriber-only continuation' : '订阅者专享');
      expect(raw).toContain(locale === 'en' ? 'The public excerpt ends here' : '公开部分到此结束');
      expect(raw).not.toMatch(/(?:FIGURE|CODE)TOKEN\d+END/u);
      const blocks = [...raw.matchAll(/<Figure\b[\s\S]*?\/>/gu)].map(([block]) => block);
      expect(blocks).toHaveLength(figures);
      expect(new Set(localImageRefs(raw)).size).toBe(figures);
      expect(
        localImageRefs(raw)
          .map((ref) => path.basename(ref))
          .toSorted(),
      ).toEqual(
        fs
          .readdirSync(path.join(PUBLIC_DIR, 'images', slug))
          .filter((file) => file.endsWith('.png'))
          .toSorted(),
      );
      for (const block of blocks) {
        expect(block).toMatch(/alt="[^"]+"/u);
        expect(block).toMatch(/caption="[^"]*https:\/\//u);
      }
      const { content } = await compileMDX({
        source: raw,
        options: { parseFrontmatter: true },
        components: { Figure: () => null },
      });
      expect(renderToStaticMarkup(content)).toContain(
        locale === 'en' ? 'Related glossary' : '相关术语',
      );
    },
  );

  it('retains the source-specific caveats instead of upgrading claims', () => {
    const en = read(path.join(CONTENT_DIR, `${slug}.mdx`));
    const zh = read(path.join(ZH_DIR, `${slug}.mdx`));
    if (slug === 'huawei-deepseek') {
      expect(en).toContain('unverified DeepSeek investor meeting transcript');
      expect(en).toContain('composition scenario, not a prediction');
      expect(en).toContain('mixed drafting dates');
      expect(en).toContain('warm-cache simple and naive benchmark');
      expect(zh).toContain('未经证实');
      for (const raw of [en, zh]) {
        expect(raw).toContain('88.8%');
        expect(raw).toContain('72.6%');
        expect(raw).toContain('1.32');
        expect(raw).not.toContain('http://deepep-ascend');
        expect(raw.match(/```/gu)).toHaveLength(4);
      }
    } else {
      expect(en).toContain('Dividing 262144 by 16384 gives 16; 8192 gives 32');
      expect(en).toContain('source units should not be treated as verified precise thresholds');
      expect(zh).toContain('262144 除以 16384 等于 16');
      expect(zh).toContain('图的横轴单位是 KiB');
      for (const raw of [en, zh]) {
        expect(raw).toContain('`Math Cycles = FLOPs / (16384 FLOPs/clk) = 32 cycles`');
        expect(raw).toContain('1024');
        expect(raw).toContain('78%');
      }
    }
  });
});

it('checks every current locale pair in both directions', () => {
  expect(enFiles.length).toBeGreaterThan(0);
  expect(zhFiles).toEqual(enFiles);
});

describe.each(enFiles)('%s', (file) => {
  const en = read(path.join(CONTENT_DIR, file));
  const zhPath = path.join(ZH_DIR, file);

  it('keeps date, publishDate, and tags identical across locales', () => {
    const zh = read(zhPath);
    for (const field of ['date', 'publishDate', 'modifiedDate']) {
      expect(frontmatterField(zh, field), `${field} drifted`).toBe(frontmatterField(en, field));
    }
    expect(tagList(zh)).toEqual(tagList(en));
  });

  it('preserves code blocks, inline identifiers, math, Figure sources, links, and JSON-LD structure', () => {
    expect(compareBlogPair(file, en, read(zhPath))).toEqual([]);
  });

  it('references only images that exist under public/', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', read(zhPath)],
    ] as const) {
      for (const ref of localImageRefs(raw)) {
        const onDisk = path.join(PUBLIC_DIR, ref);
        expect(fs.existsSync(onDisk), `${locale}: missing public${ref}`).toBe(true);
      }
    }
  });

  it('opens and closes every $$ math block', () => {
    for (const [locale, raw] of [
      ['en', en],
      ['zh', read(zhPath)],
    ] as const) {
      expect(countMathFences(raw) % 2, `${locale}: unbalanced $$ fences`).toBe(0);
    }
  });
});

describe('Chinese technical Markdown rendering', () => {
  it('renders every multiplication factor in the workflow job calculation', async () => {
    const source = read(path.join(ZH_DIR, 'inferencemax-open-source-inference-benchmarking.mdx'));
    const paragraph = source.split('\n\n').find((block) => block.startsWith('具体来说：'));
    expect(paragraph).toBeDefined();
    const { content } = await compileMDX({ source: paragraph! });
    const html = renderToStaticMarkup(content);
    expect(html).toContain('3 * 7 * 3 * 2 * 4 * 4 = 2016');
    expect(html).not.toContain('<em>');
  });

  it('preserves underscores and the wildcard in the SGLang optimization flag', async () => {
    const source = read(path.join(ZH_DIR, 'mi355x-deepseek-v4-pro-sglang-110x-in-26-days.mdx'));
    const paragraph = source
      .split('\n')
      .find((block) => block.startsWith('- **分支 → SGLang main 上游迁移。**'));
    expect(paragraph).toBeDefined();
    const { content } = await compileMDX({ source: paragraph! });
    expect(renderToStaticMarkup(content)).toContain('<code>SGLANG_OPT_*</code>');
  });
});

describe('TPU AgentX newsletter port', () => {
  const slug = 'tpu-strikes-the-king';
  const original = 'https://newsletter.semianalysis.com/p/tpu-strikes-the-king';

  it.each(['en', 'zh'])('preserves the historical scope and all figures in %s', (locale) => {
    const raw = read(path.join(locale === 'en' ? CONTENT_DIR : ZH_DIR, `${slug}.mdx`));
    expect(frontmatterField(raw, 'date')).toBe("'2026-11-05'");
    expect(frontmatterField(raw, 'publishDate')).toBe("'2026-11-05'");
    expect(raw).toContain(original);
    expect(raw).toContain('Bryan Shan');
    expect(raw).toContain('Myron Xie');
    expect(raw).toContain(locale === 'en' ? 'subscriber-only continuation' : '订阅者专享');
    expect(raw).toContain(locale === 'en' ? 'preview submissions' : '预览提交');
    expect(raw).not.toMatch(/FIGURE(?:PLACEHOLDER|_)\d/u);
    const figures = [...raw.matchAll(/<Figure\b[\s\S]*?\/>/gu)];
    expect(figures).toHaveLength(25);
    for (const [figure] of figures) {
      expect(figure).toMatch(/alt="[^"]+"/u);
      expect(figure).toMatch(/caption="[^"]*https:\/\//u);
    }
    for (const term of [
      'decode-megakernel',
      'kernel-launch-overhead',
      'decode-context-parallelism',
      'prefill-context-parallelism',
      'attention-head-dimension',
      'hicache',
      'decode-admission-control',
      'kv-cache-affinity',
    ]) {
      expect(raw).toContain(`](${locale === 'zh' ? '/zh' : ''}/glossary/${term})`);
    }
  });
});
