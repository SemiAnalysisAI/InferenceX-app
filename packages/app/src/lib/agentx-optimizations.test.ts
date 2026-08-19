import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AGENTX_OPTIMIZATION_FRAMEWORKS,
  AGENTX_OPTIMIZATION_SLUGS,
  OPTIMIZATION_FIGURES,
  OPTIMIZATION_LAYERS,
  OPTIMIZATIONS_OVERVIEW,
  PR_REPOS,
  countReferencedPrs,
  getOptimizationFramework,
  prLabel,
  prUrl,
  type OptimizationSection,
} from './agentx-optimizations';
import {
  getLocalizedFramework,
  getLocalizedFrameworks,
  getOptimizationsOverview,
} from './agentx-optimizations-zh';

const CJK = /[一-鿿]/u;

function allSections(): OptimizationSection[] {
  return [
    ...OPTIMIZATIONS_OVERVIEW.sections,
    ...AGENTX_OPTIMIZATION_FRAMEWORKS.flatMap((framework) => framework.sections),
  ];
}

describe('AgentX optimizations registry', () => {
  it('has unique slugs and section ids', () => {
    expect(new Set(AGENTX_OPTIMIZATION_SLUGS).size).toBe(AGENTX_OPTIMIZATION_SLUGS.length);
    for (const framework of AGENTX_OPTIMIZATION_FRAMEWORKS) {
      const ids = framework.sections.map((section) => section.id);
      expect(new Set(ids).size, framework.slug).toBe(ids.length);
    }
  });

  it('uses URL-safe slugs and known layers', () => {
    for (const framework of AGENTX_OPTIMIZATION_FRAMEWORKS) {
      expect(framework.slug).toMatch(/^[a-z0-9-]+$/u);
      expect(OPTIMIZATION_LAYERS).toContain(framework.layer);
      expect(framework.name.length).toBeGreaterThan(0);
      expect(framework.sections.length).toBeGreaterThan(0);
    }
  });

  it('resolves a framework by slug and rejects unknown ones', () => {
    expect(getOptimizationFramework('vllm')?.name).toBe('vLLM');
    expect(getOptimizationFramework('not-a-framework')).toBeUndefined();
  });

  it('references only known repositories, and builds their PR URLs', () => {
    for (const section of allSections()) {
      for (const pr of section.prs ?? []) {
        expect(Object.keys(PR_REPOS)).toContain(pr.repo);
        expect(Number.isInteger(pr.number) && pr.number > 0).toBe(true);
        expect(prUrl(pr)).toBe(`https://github.com/${pr.repo}/pull/${pr.number}`);
        expect(prLabel(pr)).toContain(`#${pr.number}`);
      }
    }
  });

  it('never lists the same PR twice inside one section', () => {
    for (const section of allSections()) {
      const urls = (section.prs ?? []).map(prUrl);
      expect(new Set(urls).size, section.id).toBe(urls.length);
    }
  });

  it('backs the "50+ upstream PRs" claim in the lead copy', () => {
    expect(OPTIMIZATIONS_OVERVIEW.lead).toContain('50+');
    expect(countReferencedPrs()).toBeGreaterThanOrEqual(50);
  });

  it('links only to https references', () => {
    for (const section of allSections()) {
      for (const link of section.links ?? []) {
        expect(link.href.startsWith('https://'), link.href).toBe(true);
        expect(link.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('ships every figure it references', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    for (const section of allSections()) {
      if (!section.figure) continue;
      const asset = OPTIMIZATION_FIGURES[section.figure.key];
      expect(asset, section.figure.key).toBeDefined();
      expect(existsSync(path.join(publicDir, asset.src)), asset.src).toBe(true);
      // Dimensions feed next/image, so a wrong aspect ratio would shift layout.
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(section.figure.alt.length).toBeGreaterThan(20);
      expect(section.figure.caption.length).toBeGreaterThan(20);
    }
  });

  it('uses every declared figure exactly once', () => {
    const used = allSections()
      .map((section) => section.figure?.key)
      .filter((key): key is NonNullable<typeof key> => Boolean(key));
    expect(new Set(used).size).toBe(used.length);
    expect(new Set(used)).toEqual(new Set(Object.keys(OPTIMIZATION_FIGURES)));
  });

  it('carries no unresolved editorial notes from the source document', () => {
    const prose = [
      OPTIMIZATIONS_OVERVIEW.lead,
      ...OPTIMIZATIONS_OVERVIEW.intro,
      ...allSections().flatMap((section) => [section.heading, ...section.paragraphs]),
      ...AGENTX_OPTIMIZATION_FRAMEWORKS.flatMap((framework) => [framework.lead, framework.summary]),
    ].join('\n');
    for (const marker of ['TO BE UPDATED', 'TODO', 'Bryan Shan', 'Source: SemiAnalysis']) {
      expect(prose, marker).not.toContain(marker);
    }
  });
});

describe('AgentX optimizations Chinese port', () => {
  it('translates the overview without dropping structure', () => {
    const en = OPTIMIZATIONS_OVERVIEW;
    const zh = getOptimizationsOverview('zh');

    expect(zh.title).not.toBe(en.title);
    expect(CJK.test(zh.title)).toBe(true);
    expect(CJK.test(zh.lead)).toBe(true);
    expect(zh.intro).toHaveLength(en.intro.length);
    expect(zh.highlights).toHaveLength(en.highlights.length);
    expect(zh.sections).toHaveLength(en.sections.length);

    for (const [index, section] of zh.sections.entries()) {
      const source = en.sections[index];
      expect(section.id).toBe(source.id);
      expect(section.paragraphs).toHaveLength(source.paragraphs.length);
      expect(CJK.test(section.heading), section.id).toBe(true);
      expect(section.prs).toEqual(source.prs);
      expect(section.links?.map((link) => link.href)).toEqual(
        source.links?.map((link) => link.href),
      );
      expect(section.figure?.key).toBe(source.figure?.key);
    }

    for (const value of Object.values(zh.ui)) expect(CJK.test(value)).toBe(true);
    for (const label of Object.values(zh.layerLabels)) expect(label.length).toBeGreaterThan(0);
  });

  it('returns the English registry untouched for the en locale', () => {
    expect(getOptimizationsOverview('en')).toBe(OPTIMIZATIONS_OVERVIEW);
    expect(getLocalizedFrameworks('en')).toEqual(AGENTX_OPTIMIZATION_FRAMEWORKS);
  });

  it('translates every framework, section, figure, and highlight', () => {
    for (const framework of AGENTX_OPTIMIZATION_FRAMEWORKS) {
      const zh = getLocalizedFramework(framework, 'zh');

      expect(zh.slug).toBe(framework.slug);
      // Product names, PR references, and figure assets stay language-neutral.
      expect(zh.name).toBe(framework.name);
      expect(CJK.test(zh.summary), framework.slug).toBe(true);
      expect(CJK.test(zh.lead), framework.slug).toBe(true);
      expect(zh.highlights).toHaveLength(framework.highlights.length);

      for (const [index, highlight] of zh.highlights.entries()) {
        expect(highlight.value).toBe(framework.highlights[index].value);
        expect(CJK.test(highlight.label), `${framework.slug} highlight ${index}`).toBe(true);
      }

      expect(zh.sections).toHaveLength(framework.sections.length);
      for (const [index, section] of zh.sections.entries()) {
        const source = framework.sections[index];
        const where = `${framework.slug}/${source.id}`;
        expect(section.id).toBe(source.id);
        expect(section.paragraphs, where).toHaveLength(source.paragraphs.length);
        expect(CJK.test(section.heading) || section.heading === source.heading, where).toBe(true);
        for (const paragraph of section.paragraphs) expect(CJK.test(paragraph), where).toBe(true);
        expect(section.prs).toEqual(source.prs);
        expect(section.figure?.key).toBe(source.figure?.key);
        if (source.figure) {
          expect(CJK.test(section.figure?.alt ?? ''), where).toBe(true);
          expect(CJK.test(section.figure?.caption ?? ''), where).toBe(true);
        }
      }
    }
  });
});
