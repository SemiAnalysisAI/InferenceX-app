import { describe, expect, it } from 'vitest';

import {
  MODEL_PAGE_COPY,
  modelAliasDestination,
  modelDashboardHref,
  modelDetailHref,
  modelEnglishArticleHref,
  modelIndexHref,
} from './model-page-copy';

describe('model page copy', () => {
  it('preserves exact English page chrome', () => {
    expect(MODEL_PAGE_COPY.en.indexTitle).toBe('Model Architectures');
    expect(MODEL_PAGE_COPY.en.inferenceDashboard).toBe('Inference Dashboard');
    expect(MODEL_PAGE_COPY.en.modelBreadcrumb).toBe('Model');
    expect(MODEL_PAGE_COPY.en.released).toBe('Released');
    expect(MODEL_PAGE_COPY.en.detailTitle('Kimi K3')).toBe(
      'Kimi K3 — Architecture, Evals & Inference Performance',
    );
    expect(MODEL_PAGE_COPY.en.dashboardHeading('Kimi K3', 'AgentX')).toBe(
      'Kimi K3 inference performance (AgentX)',
    );
    expect(MODEL_PAGE_COPY.en.openDashboard).toBe('Open in full dashboard →');
  });

  it('provides natural Chinese route-owned chrome', () => {
    expect(MODEL_PAGE_COPY.zh.indexTitle).toBe('模型架构');
    expect(MODEL_PAGE_COPY.zh.indexDescription).toBe(
      '逐一解析 InferenceX 已完成基准测试的模型：涵盖 MoE 与注意力架构、厂商公布的评估成绩，以及实时推理性能数据。',
    );
    expect(MODEL_PAGE_COPY.zh.inferenceDashboard).toBe('推理仪表板');
    expect(MODEL_PAGE_COPY.zh.released).toBe('发布日期');
    expect(MODEL_PAGE_COPY.zh.englishArticleNotice).toContain('英文');
    expect(MODEL_PAGE_COPY.zh.englishArticleLink).toBe('查看英文原文');
  });
});

describe('model page locale paths', () => {
  it('keeps index, detail, aliases, dashboard, and English-source links in the intended tree', () => {
    expect(modelIndexHref('en')).toBe('/model');
    expect(modelIndexHref('zh')).toBe('/zh/model');
    expect(modelDetailHref('deepseek-r1', 'en')).toBe('/model/deepseek-r1');
    expect(modelDetailHref('deepseek-r1', 'zh')).toBe('/zh/model/deepseek-r1');
    expect(modelAliasDestination('deepseek-r1', 'zh')).toBe('/zh/model/deepseek-r1');
    expect(modelDashboardHref('g_model=DeepSeek-R1-0528', 'zh')).toBe(
      '/zh/inference?g_model=DeepSeek-R1-0528',
    );
    expect(modelEnglishArticleHref('deepseek-r1')).toBe('/model/deepseek-r1');
  });
});
