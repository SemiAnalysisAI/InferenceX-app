import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';
import { compileMDX } from 'next-mdx-remote/rsc';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { createPowerXTutorialComponents } from '@/components/powerx/tutorial-mdx-components';
import { renderStaticFlowSvg } from '@/components/powerx/widgets/flow-static';
import { POWERX_TUTORIAL_WIDGETS } from '@/components/powerx/widgets';
import { compileBlogMdx } from '@/lib/blog/blog-mdx';
import { extractHeadings } from '@/lib/blog/blog';
import { hasZhSibling } from '@/lib/i18n/i18n';

import { remarkGithubAlerts } from './remark-github-alerts';
import { remarkGithubHtml } from './remark-github-html';
import { remarkWidgetImages } from './remark-widget-images';
import {
  tutorialFilePath,
  tutorialFrontmatterErrors,
  tutorialImageSrc,
  tutorialWidgetName,
} from './tutorial';

const APP_DIR = path.resolve(import.meta.dirname, '..', '..', '..');
const PUBLIC_DIR = path.join(APP_DIR, 'public');

const MAX_EN_WORDS = 1100;
const MAX_EN_SECTION_WORDS = 300;
const MAX_ZH_CJK_CHARS = 2000;
const MAX_FAQ_QUESTIONS = 10;

const ALLOWED_TAGS = new Set(['details', 'summary', 'br', 'kbd']);
const FENCE = /^```[\s\S]*?^```[ \t]*$/gmu;
const INLINE_CODE = /`[^`\n]*`/gu;
const ALERT = /^> \[!(?<kind>NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gmu;
const LINK = /(?<!!)\[[^\]]*\]\((?<href>[^)\s]+)(?:\s+"[^"]*")?\)/gu;
const IMAGE = /!\[[^\]]*\]\((?<src>[^)\s]+)(?:\s+"[^"]*")?\)/gu;
const TAG = /<\/?(?<name>[A-Za-z][\w-]*)[^>]*>/gu;
const HAN = /\p{Script=Han}/gu;

interface Side {
  locale: 'en' | 'zh';
  data: Record<string, unknown>;
  body: string;
  prose: string;
}

function load(locale: 'en' | 'zh'): Side {
  const { data, content } = matter(fs.readFileSync(tutorialFilePath(locale), 'utf8'));
  return { locale, data, body: content, prose: content.replaceAll(FENCE, '') };
}

const en = load('en');
const zh = load('zh');
const sides = [en, zh];

function toEnHref(href: string): string {
  return href
    .replace(/^\/zh(?=\/|$)/u, '')
    .replace('inferencex.semianalysis.com/zh/', 'inferencex.semianalysis.com/')
    .replace(/^$/u, '/');
}

function sections(body: string): { heading: string; text: string }[] {
  const parts = body.split(/^(?=## )/mu);
  return parts.map((part) => {
    const [heading = '', ...rest] = part.split('\n');
    return { heading: heading.replace(/^## /u, ''), text: rest.join('\n') };
  });
}

const wordCount = (text: string) => text.split(/\s+/u).filter(Boolean).length;
const levels = (side: Side) => extractHeadings(side.body).map((heading) => heading.level);
const hrefs = (side: Side) =>
  [...side.prose.matchAll(LINK)].map((match) => toEnHref(match.groups!.href)).toSorted();
const images = (side: Side) =>
  [...side.prose.matchAll(IMAGE)].map((match) => match.groups!.src).toSorted();
const alerts = (side: Side) =>
  [...side.prose.matchAll(ALERT)].map((match) => match.groups!.kind).toSorted();
const details = (side: Side) => side.prose.match(/<details\b/gu)?.length ?? 0;

async function render(source: string): Promise<string> {
  const { content } = await compileMDX({
    source,
    options: {
      mdxOptions: {
        format: 'md',
        remarkPlugins: [remarkGfm, remarkGithubAlerts, remarkGithubHtml, remarkWidgetImages],
      },
    },
  });
  return renderToStaticMarkup(content);
}

const WIDGET_IMAGE = '../../public/images/powerx-tutorial/widgets/';
const widgets = (side: Side) =>
  images(side)
    .map((src) => tutorialWidgetName(src))
    .filter((name): name is string => name !== null);

describe('PowerX tutorial front matter', () => {
  it('has exactly title, description and updated on both sides', () => {
    for (const side of sides) {
      expect(Object.keys(side.data).toSorted(), side.locale).toEqual([
        'description',
        'title',
        'updated',
      ]);
      expect(tutorialFrontmatterErrors(side.data), side.locale).toEqual([]);
    }
  });

  it('rejects extra, missing and malformed fields', () => {
    expect(tutorialFrontmatterErrors({ ...en.data, tags: ['x'] })).toEqual([
      'frontmatter has unknown field "tags"',
    ]);
    expect(tutorialFrontmatterErrors({ title: 'x', description: '' })).toEqual([
      'description must be a non-empty string',
      "updated must be a quoted 'YYYY-MM-DD' date",
    ]);
    expect(tutorialFrontmatterErrors({ ...en.data, updated: '2026-13-01' })).toEqual([
      "updated must be a quoted 'YYYY-MM-DD' date",
    ]);
  });
});

describe('PowerX tutorial EN/ZH parity', () => {
  it('keeps the same heading structure', () => {
    expect(levels(zh)).toEqual(levels(en));
    expect(levels(en).length).toBeGreaterThan(0);
  });

  it('links to the same targets after locale mapping', () => {
    expect(hrefs(zh)).toEqual(hrefs(en));
  });

  it('uses the same images and every image exists under public/', () => {
    expect(images(zh)).toEqual(images(en));
    for (const src of images(en)) {
      expect(src.startsWith('../../public/'), src).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_DIR, tutorialImageSrc(src))), src).toBe(true);
    }
  });

  it('mounts exactly the registered widgets, each once, on both sides', () => {
    const registered = Object.keys(POWERX_TUTORIAL_WIDGETS).toSorted();
    expect(widgets(en)).toEqual(registered);
    expect(widgets(zh)).toEqual(registered);
    for (const name of registered) {
      const files = ['png', 'svg'].filter((ext) =>
        fs.existsSync(path.join(PUBLIC_DIR, 'images/powerx-tutorial/widgets', `${name}.${ext}`)),
      );
      expect(files, `${name}: exactly one fallback file`).toHaveLength(1);
    }
    for (const src of images(en).filter((image) => tutorialWidgetName(image) !== null)) {
      expect(src, 'widget mounts are lines of their own').toMatch(/\.(?:png|svg)$/u);
    }
  });

  it('uses the same alerts and <details> blocks', () => {
    expect(alerts(en).length).toBeGreaterThan(0);
    expect(alerts(zh)).toEqual(alerts(en));
    expect(details(zh)).toBe(details(en));
  });
});

describe('PowerX tutorial GitHub readability', () => {
  it('contains no ESM, expressions or JSX that GitHub would not render', () => {
    for (const side of sides) {
      const lines = side.prose.split('\n');
      const esm = lines.filter((line) => /^(?:import|export) /u.test(line));
      expect(esm, `${side.locale}: ESM lines`).toEqual([]);
      const noCode = side.prose.replaceAll(INLINE_CODE, '');
      expect(noCode.includes('{'), `${side.locale}: "{" outside code`).toBe(false);
      const tags = [...noCode.matchAll(TAG)]
        .map((match) => match.groups!.name.toLowerCase())
        .filter((name) => !ALLOWED_TAGS.has(name));
      expect(tags, `${side.locale}: unsupported tags`).toEqual([]);
      expect(noCode.includes('$'), `${side.locale}: math is not supported`).toBe(false);
    }
  });
});

describe('PowerX tutorial conciseness', () => {
  it(`keeps the English body under ${MAX_EN_WORDS} words and every H2 under ${MAX_EN_SECTION_WORDS}`, () => {
    expect(wordCount(en.body)).toBeLessThanOrEqual(MAX_EN_WORDS);
    for (const section of sections(en.body)) {
      expect(wordCount(section.text), section.heading).toBeLessThanOrEqual(MAX_EN_SECTION_WORDS);
    }
  });

  it(`keeps the Chinese body under ${MAX_ZH_CJK_CHARS} CJK characters`, () => {
    const cjk = zh.body.match(HAN)?.length ?? 0;
    expect(cjk).toBeGreaterThan(0);
    expect(cjk).toBeLessThanOrEqual(MAX_ZH_CJK_CHARS);
  });

  it(`keeps the FAQ last, as <details> items, ${MAX_FAQ_QUESTIONS} or fewer`, () => {
    for (const side of sides) {
      const faq = sections(side.body).at(-1)!;
      expect(faq.heading, side.locale).toMatch(/^(?:FAQ|常见问题)$/u);
      const questions = faq.text.match(/<summary>/gu)?.length ?? 0;
      expect(questions, side.locale).toBeGreaterThan(0);
      expect(questions, side.locale).toBeLessThanOrEqual(MAX_FAQ_QUESTIONS);
      expect(details(side), `${side.locale}: every <details> is an FAQ item`).toBe(questions);
    }
  });

  it('opens with the ladder before any heading, so the hero carries the first visual', () => {
    for (const side of sides) {
      const lead = side.body.split(/^## /mu)[0];
      expect(lead, side.locale).toContain('widgets/ladder.png');
      expect(wordCount(lead.replace(IMAGE, '')), side.locale).toBeLessThanOrEqual(80);
    }
  });
});

describe('plain-markdown compile', () => {
  it('turns [!TIP] blockquotes into aside[data-callout=tip] and leaves plain quotes alone', async () => {
    const html = await render('> [!TIP]\n> Read **P90**.\n\n> plain quote\n');
    expect(html).toContain(
      '<aside data-callout="tip">\n<p>Read <strong>P90</strong>.</p>\n</aside>',
    );
    expect(html).not.toContain('[!TIP]');
    expect(html).toContain('<blockquote>\n<p>plain quote</p>\n</blockquote>');
  });

  it('rebuilds <details>, <summary>, <kbd> and <br> as elements', async () => {
    const html = await render(
      '<details>\n<summary>More</summary>\n\nHidden *text*.\n\n</details>\n\nPress <kbd>Esc</kbd><br>now.\n',
    );
    expect(html).toContain(
      '<details><summary>More</summary><p>Hidden <em>text</em>.</p></details>',
    );
    expect(html).toContain('<p>Press <kbd>Esc</kbd><br/>now.</p>');
  });

  it('keeps braces and angle brackets in prose as text', async () => {
    const html = await render('A { brace } and `power_audit_<result>` in code.\n');
    expect(html).toContain('{ brace }');
    expect(html).toContain('<code>power_audit_&lt;result&gt;</code>');
  });

  it('names widgets only from the widgets folder', () => {
    expect(tutorialWidgetName(`${WIDGET_IMAGE}power-basis.png`)).toBe('power-basis');
    expect(tutorialWidgetName(`${WIDGET_IMAGE}flow.svg`)).toBe('flow');
    expect(tutorialWidgetName(`${WIDGET_IMAGE}flow.webp`)).toBeNull();
    expect(tutorialWidgetName(`${WIDGET_IMAGE}Power.png`)).toBeNull();
    expect(tutorialWidgetName(`${WIDGET_IMAGE}nested/chart.png`)).toBeNull();
    expect(tutorialWidgetName('../../public/images/powerx-tutorial/chart.png')).toBeNull();
    expect(tutorialWidgetName('/images/powerx-tutorial/widgets/chart.png')).toBeNull();
  });

  it('lifts a lone widget image out of its paragraph and leaves figures wrapped', async () => {
    const html = await render(
      `Knobs.\n\n![Explorer](${WIDGET_IMAGE}ladder.png)\n\n![Figure](../../public/images/powerx-tutorial/figure.png)\n`,
    );
    expect(html).toContain(`<p>Knobs.</p>\n<img src="${WIDGET_IMAGE}ladder.png" alt="Explorer"/>`);
    expect(html).toContain(
      '<p><img src="../../public/images/powerx-tutorial/figure.png" alt="Figure"/></p>',
    );
  });

  it('maps GitHub-resolvable public paths to served paths', () => {
    expect(tutorialImageSrc('../../public/images/powerx-tutorial/x.png')).toBe(
      '/images/powerx-tutorial/x.png',
    );
    expect(tutorialImageSrc('/images/other.png')).toBe('/images/other.png');
    expect(tutorialImageSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
  });

  it('compiles both tutorials with the page component map', async () => {
    for (const side of sides) {
      const { content } = await compileBlogMdx(side.body, side.locale, {
        format: 'md',
        components: createPowerXTutorialComponents(side.locale),
        remarkPlugins: [remarkGithubAlerts, remarkGithubHtml, remarkWidgetImages],
      });
      const html = renderToStaticMarkup(content);
      for (const heading of extractHeadings(side.body)) {
        expect(html, `${side.locale}: #${heading.id}`).toContain(`id="${heading.id}"`);
      }
      expect(html).toContain('data-callout="note"');
      expect(html).not.toContain('[!');
      for (const name of Object.keys(POWERX_TUTORIAL_WIDGETS)) {
        expect(html, `${side.locale}: ${name}`).toContain(`data-widget="${name}"`);
        expect(html, `${side.locale}: ${name} in <p>`).not.toMatch(
          new RegExp(`<p><div[^>]*data-layout="[a-z]+"><section[^>]*data-widget="${name}"`, 'u'),
        );
        expect(html, `${side.locale}: ${name} layout`).toMatch(
          new RegExp(
            `<div data-layout="(?:bleed|column)" class="[^"]*"><section[^>]*data-widget="${name}"`,
            'u',
          ),
        );
      }
      expect(html).not.toContain('widgets/ladder.png');
      expect(html).not.toContain('widgets/flow.svg');
      expect(html.match(/data-section="0[1-5]"/gu)?.length, `${side.locale}: numbered H2s`).toBe(5);
      expect(html).toContain('<details><summary>');
    }
  });
});

describe('PowerX tutorial static flow diagram', () => {
  it('matches the FlowSvg component (run `bun run powerx:flow-svg` after changing it)', () => {
    const file = fs.readFileSync(
      path.join(PUBLIC_DIR, 'images/powerx-tutorial/widgets/flow.svg'),
      'utf8',
    );
    expect(file).toBe(`${renderToStaticMarkup(renderStaticFlowSvg('en'))}\n`);
    expect(file).toContain('<rect x="-8"');
    expect(file).not.toContain('var(--');
  });
});

describe('PowerX tutorial routing', () => {
  it('has a /zh sibling for the EN↔中文 toggle', () => {
    expect(hasZhSibling('/powerx/tutorial')).toBe(true);
  });
});
