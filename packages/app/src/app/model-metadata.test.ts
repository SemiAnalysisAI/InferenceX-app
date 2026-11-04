import { describe, expect, it, vi } from 'vitest';

import { HW_REGISTRY, SITE_URL } from '@semianalysisai/inferencex-constants';

vi.mock('@/lib/compare/compare-availability', () => ({
  getHardwareByModelSlug: () =>
    Promise.resolve(
      new Map([
        ['deepseek-r1', new Set(['h100', 'mi355x', 'b200'])],
        ['kimi-k3', new Set()],
      ]),
    ),
}));

vi.mock('@/lib/cache/api-cache', () => ({
  cachedDerivedData: <T>(fn: () => Promise<T>) => fn,
}));

import { modelDetailMetadata, modelIndexMetadata } from '@/lib/catalog/model-page-metadata';

describe('model page metadata locale pairing', () => {
  it('pairs the English and Chinese index canonicals and hreflang values', () => {
    const enIndexMetadata = modelIndexMetadata('en');
    const zhIndexMetadata = modelIndexMetadata('zh');
    expect(enIndexMetadata.alternates).toEqual({
      canonical: `${SITE_URL}/model`,
      languages: {
        en: `${SITE_URL}/model`,
        'zh-CN': `${SITE_URL}/zh/model`,
        'x-default': `${SITE_URL}/model`,
      },
    });
    expect(zhIndexMetadata.alternates).toEqual({
      canonical: `${SITE_URL}/zh/model`,
      languages: enIndexMetadata.alternates?.languages,
    });
    expect(zhIndexMetadata.openGraph).toMatchObject({
      locale: 'zh_CN',
      url: `${SITE_URL}/zh/model`,
    });
    expect(zhIndexMetadata.title).toEqual({
      absolute: '模型架构：各模型的 MoE 架构、注意力机制与评估结果 | InferenceX',
    });
    expect(zhIndexMetadata.openGraph).toMatchObject({
      title: '模型架构：各模型的 MoE 架构、注意力机制与评估结果',
    });
  });

  it('localizes detail metadata while preserving model facts', async () => {
    const en = await modelDetailMetadata('deepseek-r1', 'en');
    const zh = await modelDetailMetadata('deepseek-r1', 'zh');

    expect(en.alternates).toEqual({
      canonical: `${SITE_URL}/model/deepseek-r1`,
      languages: {
        en: `${SITE_URL}/model/deepseek-r1`,
        'zh-CN': `${SITE_URL}/zh/model/deepseek-r1`,
        'x-default': `${SITE_URL}/model/deepseek-r1`,
      },
    });
    expect(zh.alternates).toEqual({
      canonical: `${SITE_URL}/zh/model/deepseek-r1`,
      languages: en.alternates?.languages,
    });
    expect(en.title).toEqual({
      absolute: 'DeepSeek R1 0528 — Architecture, Evals & Inference Performance | InferenceX',
    });
    expect(zh.title).toEqual({
      absolute: 'DeepSeek R1 0528：架构、评估与推理性能 | InferenceX',
    });
    expect(zh.description).toContain('671B');
    expect(en.description).toBe(
      `DeepSeek R1 0528: 671B / 37B active, 164K context. Measured tok/s and $/M tok on ${HW_REGISTRY.b200.label}, ${HW_REGISTRY.mi355x.label} and ${HW_REGISTRY.h100.label}, plus architecture and evals.`,
    );
    expect(zh.description).toContain(`${HW_REGISTRY.b200.label}、`);
    expect(en.openGraph?.description).toBe(en.description);
    expect(en.twitter?.description).toBe(en.description);
    expect(zh.openGraph).toMatchObject({
      locale: 'zh_CN',
      url: `${SITE_URL}/zh/model/deepseek-r1`,
    });
  });
});

describe('model detail metadata without measured chips', () => {
  it('keeps the spec lead and omits the chip list', async () => {
    const en = await modelDetailMetadata('kimi-k3', 'en');
    expect(en.description).toMatch(/^Kimi K3: 2\.8T \/ 104B active, 1M context\. /u);
    expect(en.description).not.toContain('Measured');
  });
});
