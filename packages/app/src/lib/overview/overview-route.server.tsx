import type { Metadata } from 'next';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { OverviewPageContent } from '@/components/overview/overview-page';
import { enAlternates, type Locale, zhAlternates } from '@/lib/i18n/i18n';
import { OVERVIEW_HARDWARE, overviewHardwareLabel } from '@/lib/overview/overview-data';
import { getOverviewPageData } from '@/lib/overview/overview-data.server';
import { socialMetadata } from '@/lib/seo/social-metadata';

function overviewPlatformList(locale: Locale): string {
  const labels = OVERVIEW_HARDWARE.map((hardware) => overviewHardwareLabel(hardware));
  if (locale === 'zh') return `${labels.slice(0, -1).join('、')} 和 ${labels.at(-1)}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

export function buildOverviewMetadata(locale: Locale): Metadata {
  const platforms = overviewPlatformList(locale);
  const title = locale === 'zh' ? '智能体推理成本' : 'Agentic Inference Costs';
  const description =
    locale === 'zh'
      ? `对比 ${platforms} 在 AgentX 长上下文、多轮编码场景及固定序列场景下，按超大规模云厂商口径计算的每百万总 token 成本；仅展示具备对应数据的模型。`
      : `Compare hyperscaler cost per million total tokens across ${platforms} for the AgentX long-context, multi-turn coding scenario and fixed-sequence scenarios where data is available.`;
  const path = locale === 'zh' ? '/zh/overview' : '/overview';

  return {
    title,
    description,
    alternates: locale === 'zh' ? zhAlternates('/overview') : enAlternates('/overview'),
    ...socialMetadata({
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `${SITE_URL}${path}`,
      locale,
    }),
  };
}

/**
 * Overview pages are prerendered with the default controls; `OverviewNavigationProvider`
 * loads any other state a shared URL asks for from `/api/v1/overview` after mount.
 */
export async function renderOverviewPage({ locale }: { locale: Locale }) {
  const data = await getOverviewPageData();
  return <OverviewPageContent data={data} locale={locale} />;
}
