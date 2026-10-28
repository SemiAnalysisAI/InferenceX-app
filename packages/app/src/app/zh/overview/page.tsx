import { buildOverviewMetadata, renderOverviewPage } from '@/lib/overview/overview-route.server';

export const revalidate = 3600;

export const metadata = buildOverviewMetadata('zh');

export default function ZhOverviewPage() {
  return renderOverviewPage({ locale: 'zh' });
}
