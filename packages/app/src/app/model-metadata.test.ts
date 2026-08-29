import { describe, expect, it } from 'vitest';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

import { modelDetailMetadata, modelIndexMetadata } from '@/lib/model-page-metadata';

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

  it('localizes detail metadata while preserving model facts', () => {
    const en = modelDetailMetadata('deepseek-r1', 'en');
    const zh = modelDetailMetadata('deepseek-r1', 'zh');

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
    expect(zh.openGraph).toMatchObject({
      locale: 'zh_CN',
      url: `${SITE_URL}/zh/model/deepseek-r1`,
    });
  });
});
