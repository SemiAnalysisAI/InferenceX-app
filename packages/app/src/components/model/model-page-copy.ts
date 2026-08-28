import { localePath, type Locale } from '@/lib/i18n';

const INDEX_DESCRIPTION_EN =
  'Architecture deep-dives for every model benchmarked on InferenceX: MoE and attention design, official vendor eval scores, and live inference performance data.';

export const MODEL_PAGE_COPY = {
  en: {
    indexTitle: 'Model Architectures',
    indexDescription: INDEX_DESCRIPTION_EN,
    inferenceDashboard: 'Inference Dashboard',
    modelBreadcrumb: 'Model',
    released: 'Released',
    detailTitle: (model: string) => `${model} — Architecture, Evals & Inference Performance`,
    dashboardHeading: (model: string, scenario: string) =>
      `${model} inference performance (${scenario})`,
    dashboardDescription: (model: string, scenario: string) =>
      `Live InferenceX benchmark data for ${model} on the ${scenario} workload, measured in total tokens per dollar across every chip config with data.`,
    openDashboard: 'Open in full dashboard →',
    englishArticleNotice: '',
    englishArticleLink: '',
    developerLogoAlt: (developer: string) => `${developer} logo`,
  },
  zh: {
    indexTitle: '模型架构',
    indexDescription:
      '逐一解析 InferenceX 收录的模型：包括 MoE 与注意力架构、厂商公布的评估成绩和实时推理性能数据。',
    inferenceDashboard: '推理仪表板',
    modelBreadcrumb: '模型',
    released: '发布日期',
    detailTitle: (model: string) => `${model}：架构、评估与推理性能`,
    dashboardHeading: (model: string, scenario: string) => `${model} 推理性能（${scenario}）`,
    dashboardDescription: (model: string, scenario: string) =>
      `展示 ${model} 在 ${scenario} 工作负载下的 InferenceX 实时基准测试结果，覆盖所有有数据的芯片配置，并以每美元总 token 数为比较指标。`,
    openDashboard: '在完整仪表板中查看 →',
    englishArticleNotice:
      '模型深度解析正文目前仅提供英文版；下方保留英文原文，页面其余文案均已中文化。',
    englishArticleLink: '查看英文原文',
    developerLogoAlt: (developer: string) => `${developer} 标志`,
  },
} as const;

export function modelIndexHref(locale: Locale): string {
  return localePath('/model', locale);
}

export function modelDetailHref(slug: string, locale: Locale): string {
  return localePath(`/model/${slug}`, locale);
}

export function modelAliasDestination(canonicalSlug: string, locale: Locale): string {
  return modelDetailHref(canonicalSlug, locale);
}

export function modelDashboardHref(query: string, locale: Locale): string {
  return `${localePath('/inference', locale)}?${query}`;
}

export function modelEnglishArticleHref(slug: string): string {
  return modelDetailHref(slug, 'en');
}
