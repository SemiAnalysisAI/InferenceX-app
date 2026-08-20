import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AGENTIC_DETAIL_SURFACE,
  AGENTX_TELEMETRY_GUIDE,
  AGENTX_TELEMETRY_SECTION_IDS,
  TELEMETRY_FIGURES,
} from './agentx-telemetry';
import { getTelemetryGuide, TELEMETRY_ZH_INTERNALS } from './agentx-telemetry-zh';

const CJK = /[一-鿿]/u;

describe('AgentX telemetry guide', () => {
  it('has unique, URL-safe section ids', () => {
    expect(new Set(AGENTX_TELEMETRY_SECTION_IDS).size).toBe(AGENTX_TELEMETRY_SECTION_IDS.length);
    for (const id of AGENTX_TELEMETRY_SECTION_IDS) expect(id).toMatch(/^[a-z0-9-]+$/u);
  });

  it('gives every section a heading and at least one paragraph', () => {
    for (const section of AGENTX_TELEMETRY_GUIDE.sections) {
      expect(section.heading.length, section.id).toBeGreaterThan(0);
      expect(section.paragraphs.length, section.id).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) {
        expect(paragraph.length, section.id).toBeGreaterThan(40);
      }
    }
  });

  it('ships every figure it references, with usable next/image dimensions', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    for (const section of AGENTX_TELEMETRY_GUIDE.sections) {
      if (!section.figure) continue;
      const asset = TELEMETRY_FIGURES[section.figure.key];
      expect(asset, section.figure.key).toBeDefined();
      expect(existsSync(path.join(publicDir, asset.src)), asset.src).toBe(true);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      // Screen-reader copy has to describe the screenshot, not just name it.
      expect(section.figure.alt.length, section.figure.key).toBeGreaterThan(40);
      expect(section.figure.caption.length, section.figure.key).toBeGreaterThan(20);
    }
  });

  it('uses every declared figure exactly once', () => {
    const used = AGENTX_TELEMETRY_GUIDE.sections
      .map((section) => section.figure?.key)
      .filter((key): key is NonNullable<typeof key> => Boolean(key));
    expect(new Set(used).size).toBe(used.length);
    expect(new Set(used)).toEqual(new Set(Object.keys(TELEMETRY_FIGURES)));
  });

  it('links only to https references', () => {
    for (const section of AGENTX_TELEMETRY_GUIDE.sections) {
      for (const link of section.links ?? []) {
        expect(link.href.startsWith('https://'), link.href).toBe(true);
        expect(link.label.length).toBeGreaterThan(0);
      }
    }
  });

  // The prose cites these counts. AGENTIC_DETAIL_SURFACE mirrors what
  // agentic-point-detail.tsx renders, so adding a chart there without
  // updating the copy fails here rather than shipping a stale number.
  it('keeps its numeric claims aligned with the detail-page surface', () => {
    const byLabel = new Map(
      AGENTX_TELEMETRY_GUIDE.highlights.map((highlight) => [highlight.label, highlight.value]),
    );
    expect(byLabel.get('per-point telemetry charts')).toBe(
      String(AGENTIC_DETAIL_SURFACE.perPointCharts.length),
    );
    expect(byLabel.get('views per point')).toBe(String(AGENTIC_DETAIL_SURFACE.views));
    expect(byLabel.get('replay stages')).toBe(String(AGENTIC_DETAIL_SURFACE.stages.length));

    // The bullet list enumerates the same eleven charts, collapsed into nine
    // lines because three pairs share a card. Guard the two that are easy to
    // desynchronise instead of asserting a brittle line count.
    const detail = AGENTX_TELEMETRY_GUIDE.sections.find(
      (section) => section.id === 'point-detail-page',
    );
    expect(detail?.bullets?.length ?? 0).toBeGreaterThan(0);
    expect(AGENTX_TELEMETRY_GUIDE.intro.join(' ')).toContain('eleven');
    expect(AGENTIC_DETAIL_SURFACE.perPointCharts.length).toBe(11);
  });

  it('has no duplicate entries in the detail-page surface record', () => {
    const charts = AGENTIC_DETAIL_SURFACE.perPointCharts;
    expect(new Set(charts).size).toBe(charts.length);
  });

  it('carries no unresolved editorial notes from the source document', () => {
    const prose = [
      AGENTX_TELEMETRY_GUIDE.lead,
      ...AGENTX_TELEMETRY_GUIDE.intro,
      ...AGENTX_TELEMETRY_GUIDE.sections.flatMap((section) => [
        section.heading,
        ...section.paragraphs,
        ...(section.bullets ?? []),
      ]),
    ].join('\n');
    for (const marker of ['TO BE UPDATED', 'TODO', 'Source: SemiAnalysis']) {
      expect(prose, marker).not.toContain(marker);
    }
  });
});

describe('AgentX telemetry Chinese port', () => {
  it('returns the English guide untouched for the en locale', () => {
    expect(getTelemetryGuide('en')).toBe(AGENTX_TELEMETRY_GUIDE);
  });

  it('translates the guide without dropping structure', () => {
    const en = AGENTX_TELEMETRY_GUIDE;
    const zh = getTelemetryGuide('zh');

    expect(zh.title).not.toBe(en.title);
    expect(CJK.test(zh.title)).toBe(true);
    expect(CJK.test(zh.eyebrow)).toBe(true);
    expect(CJK.test(zh.lead)).toBe(true);
    expect(zh.intro).toHaveLength(en.intro.length);
    for (const paragraph of zh.intro) expect(CJK.test(paragraph)).toBe(true);

    expect(zh.highlights).toHaveLength(en.highlights.length);
    for (const [index, highlight] of zh.highlights.entries()) {
      // Values are numerals — they stay language-neutral; only labels translate.
      expect(highlight.value).toBe(en.highlights[index].value);
      expect(CJK.test(highlight.label), `highlight ${index}`).toBe(true);
    }

    expect(zh.sections).toHaveLength(en.sections.length);
    for (const [index, section] of zh.sections.entries()) {
      const source = en.sections[index];
      expect(section.id).toBe(source.id);
      expect(CJK.test(section.heading), section.id).toBe(true);
      expect(section.paragraphs, section.id).toHaveLength(source.paragraphs.length);
      for (const paragraph of section.paragraphs)
        expect(CJK.test(paragraph), section.id).toBe(true);

      expect(section.bullets?.length ?? 0, section.id).toBe(source.bullets?.length ?? 0);
      for (const bullet of section.bullets ?? []) expect(CJK.test(bullet), section.id).toBe(true);

      expect(section.figure?.key).toBe(source.figure?.key);
      if (source.figure) {
        expect(CJK.test(section.figure?.alt ?? ''), section.id).toBe(true);
        expect(CJK.test(section.figure?.caption ?? ''), section.id).toBe(true);
      }

      expect(section.links?.map((link) => link.href)).toEqual(
        source.links?.map((link) => link.href),
      );
    }

    for (const value of Object.values(zh.ui)) expect(CJK.test(value)).toBe(true);
  });

  it('translates every section the English guide declares, and no others', () => {
    const translated = Object.keys(TELEMETRY_ZH_INTERNALS.GUIDE_ZH.sections);
    expect(new Set(translated)).toEqual(new Set(AGENTX_TELEMETRY_SECTION_IDS));
  });
});
