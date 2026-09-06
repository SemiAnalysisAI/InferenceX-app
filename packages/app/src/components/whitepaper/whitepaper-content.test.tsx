import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: undefined }),
}));

import { getWhitepaper, WHITEPAPER_COPY } from '@/lib/whitepapers';

import { WhitepaperDetailContent } from './whitepaper-detail-content';
import { WhitepaperIndexContent } from './whitepaper-index-content';

const MI355X_SLUG = 'amd-mi355x-32b-revenue-per-gigawatt-kimi-k3';
const HAN = /\p{Script=Han}/u;

function paper() {
  const found = getWhitepaper(MI355X_SLUG);
  if (!found) throw new Error(`missing whitepaper ${MI355X_SLUG}`);
  return found;
}

/** renderToStaticMarkup escapes `&` in text nodes and attributes. */
function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;');
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

describe('WhitepaperDetailContent', () => {
  it('renders the hero, registry KPIs, comparison bar, both figures, and the sidebar PDF card', () => {
    const html = renderToStaticMarkup(<WhitepaperDetailContent paper={paper()} locale="en" />);
    const { en, chart, figures } = paper();

    expect(html).toContain('data-testid="whitepaper-detail-page"');
    expect(html).toContain('data-testid="whitepaper-hero"');
    expect(html).toContain('data-testid="whitepaper-comparison"');
    expect(html).toContain('data-testid="whitepaper-pdf-card"');
    expect(countOccurrences(html, 'data-testid="whitepaper-kpi"')).toBe(en.kpis.length);
    expect(countOccurrences(html, 'data-testid="whitepaper-figure"')).toBe(figures.length);

    for (const kpi of en.kpis) {
      expect(html).toContain(kpi.value);
      expect(html).toContain(kpi.label);
    }
    for (const item of en.comparison.items) {
      expect(html).toContain(item.value);
    }
    for (const figure of figures) {
      expect(html).toContain(figure.tcoBadge);
      expect(html).toContain(figure.srcLight);
      expect(html).toContain(figure.srcDark);
    }
    expect(html).toContain(escapeHtml(en.figureTitle));
    expect(html).toContain(chart.tcoSourceHref);
    expect(html).toContain(escapeHtml(chart.tcoSourceTitle));
    expect(html).toContain(chart.modelLogoPath);
    // The chip is a pure visual overlay: decorative alt text, no caption.
    expect(html).toContain('mi355x-transparent.png');
    expect(html).toContain(WHITEPAPER_COPY.en.onThisPage);
    expect(html).toContain(WHITEPAPER_COPY.en.keyNumbers);
    expect(html).not.toMatch(HAN);
  });

  it('renders the Chinese page with translated chrome and no English fallbacks', () => {
    const html = renderToStaticMarkup(<WhitepaperDetailContent paper={paper()} locale="zh" />);
    const { zh } = paper();

    expect(html).toContain(WHITEPAPER_COPY.zh.keyNumbers);
    expect(html).toContain(WHITEPAPER_COPY.zh.onThisPage);
    expect(html).toContain(WHITEPAPER_COPY.zh.downloadPdf);
    expect(html).toContain(escapeHtml(zh.figureTitle));
    expect(html).toContain(zh.comparison.lead);
    for (const kpi of zh.kpis) {
      expect(html).toContain(kpi.label);
    }
    expect(html).not.toContain(WHITEPAPER_COPY.en.keyNumbers);
    expect(html).not.toContain(WHITEPAPER_COPY.en.onThisPage);
    expect(html).not.toContain('Key findings');
    expect(html).not.toContain('Download PDF');
  });
});

describe('WhitepaperIndexContent', () => {
  it('renders one card per paper with cover, KPIs, tags, and links', () => {
    const html = renderToStaticMarkup(<WhitepaperIndexContent locale="en" />);
    const { en, coverImagePath, tags } = paper();

    expect(html).toContain('data-testid="whitepaper-index-page"');
    expect(html).toContain('data-testid="whitepaper-card"');
    expect(html).toContain('data-testid="whitepaper-card-kpis"');
    expect(html).toContain(WHITEPAPER_COPY.en.indexEyebrow);
    expect(html).toContain(WHITEPAPER_COPY.en.indexTitle);
    expect(html).toContain(en.title);
    expect(html.includes(coverImagePath) || html.includes(encodeURIComponent(coverImagePath))).toBe(
      true,
    );
    for (const kpi of en.kpis) {
      expect(html).toContain(kpi.value);
    }
    for (const tag of tags) {
      expect(html).toContain(tag);
    }
    expect(html).toContain(WHITEPAPER_COPY.en.readSummary);
    expect(html).toContain(WHITEPAPER_COPY.en.downloadPdf);
    expect(html).not.toMatch(HAN);
  });

  it('renders the Chinese index with translated strings', () => {
    const html = renderToStaticMarkup(<WhitepaperIndexContent locale="zh" />);
    const { zh } = paper();

    expect(html).toContain(WHITEPAPER_COPY.zh.indexEyebrow);
    expect(html).toContain(WHITEPAPER_COPY.zh.indexTitle);
    expect(html).toContain(WHITEPAPER_COPY.zh.readSummary);
    expect(html).toContain(zh.title);
    expect(html).toContain(`/zh/whitepaper/${MI355X_SLUG}`);
    expect(html).not.toContain(WHITEPAPER_COPY.en.readSummary);
  });
});
