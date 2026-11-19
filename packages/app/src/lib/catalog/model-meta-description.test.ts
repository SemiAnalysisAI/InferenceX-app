import { describe, expect, it } from 'vitest';

import { GPU_KEYS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { Model } from '@/lib/catalog/data-mappings';
import {
  formatContextWindow,
  formatParamCount,
  getModelArchitecture,
} from '@/lib/catalog/model-architectures';
import { META_DESCRIPTION_MAX } from '@/lib/seo/meta-text';

import { measuredChipLabels, modelMetaDescription } from './model-meta-description';
import { getModelPage, getModelPageSlugs } from './model-pages';

const kimiK3 = getModelArchitecture(Model.Kimi_K3)!;

describe('modelMetaDescription', () => {
  it('leads with registry specs and names the measured chips', () => {
    expect(modelMetaDescription('Kimi K3', kimiK3, ['mi355x', 'b200', 'b300'], 'en')).toBe(
      `Kimi K3: ${formatParamCount(kimiK3.totalParams)} / ${formatParamCount(kimiK3.activeParams)} active, ` +
        `${formatContextWindow(kimiK3.contextWindow!)} context. Measured tok/s and $/M tok on B300, B200 and MI355X, ` +
        'plus architecture and evals.',
    );
    expect(modelMetaDescription('Kimi K3', kimiK3, ['mi355x', 'b200', 'b300'], 'zh')).toBe(
      `Kimi K3：总参数 ${formatParamCount(kimiK3.totalParams)}、激活 ${formatParamCount(kimiK3.activeParams)}，` +
        `${formatContextWindow(kimiK3.contextWindow!)} 上下文。附 B300、B200、MI355X 上实测的 tok/s 与 $/M tok，以及架构与评估解析。`,
    );
  });

  it('describes dense and prefill/decode split models from their own fields', () => {
    const dense = getModelArchitecture(Model.Llama3_3_70B)!;
    expect(modelMetaDescription('Llama 3.3 70B', dense, ['h100'], 'en')).toContain(
      `${formatParamCount(dense.totalParams)} dense`,
    );
    const ced = getModelArchitecture(Model.DeepSeek_V4_1_Flash)!;
    expect(modelMetaDescription('DeepSeek V4.1 Flash', ced, ['b200'], 'en')).toContain(
      `${formatParamCount(ced.activeParamsPrefill!)} prefill / ${formatParamCount(ced.activeParams)} decode active`,
    );
  });

  it('summarizes chips that do not fit as a count and stays within the locale limit', () => {
    const allChips = [...GPU_KEYS];
    for (const locale of ['en', 'zh'] as const) {
      const description = modelMetaDescription(
        'Kimi K2.5 / K2.6 / K2.7-Code',
        kimiK3,
        allChips,
        locale,
      );
      expect(description.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX[locale]);
      expect(description).toMatch(locale === 'en' ? /and \d+ more chips?[,.]/u : /等 \d+ 款芯片/u);
    }
  });

  it('falls back to a chip-free sentence when nothing has been measured', () => {
    expect(modelMetaDescription('Kimi K3', kimiK3, [], 'en')).toMatch(
      /context\. Architecture, evals and live inference benchmarks\.$/u,
    );
    expect(modelMetaDescription('Kimi K3', undefined, [], 'en')).toBe(
      'Kimi K3: Architecture, evals and live inference benchmarks.',
    );
  });

  it('fits every model page within the limit even with every chip measured', () => {
    for (const slug of getModelPageSlugs()) {
      for (const locale of ['en', 'zh'] as const) {
        const page = getModelPage(slug, locale)!;
        const description = modelMetaDescription(
          page.meta.title,
          getModelArchitecture(page.entry.displayName as Model),
          GPU_KEYS,
          locale,
        );
        expect(description.length, `${slug} ${locale}`).toBeLessThanOrEqual(
          META_DESCRIPTION_MAX[locale],
        );
        expect(description, `${slug} ${locale}`).toContain(measuredChipLabels(GPU_KEYS)[0]);
      }
    }
  });
});

describe('measuredChipLabels', () => {
  it('orders by registry sort, dedupes and ignores unknown keys', () => {
    expect(measuredChipLabels(['h100', 'gb300', 'h100', 'not-a-chip'])).toEqual([
      HW_REGISTRY.gb300.label,
      HW_REGISTRY.h100.label,
    ]);
  });
});
