import {
  buildOverviewMetadata,
  type OverviewRoutePageProps,
  renderOverviewPage,
} from '@/lib/overview/overview-route.server';

export const dynamic = 'force-dynamic';

export const metadata = buildOverviewMetadata('zh');

export default function ZhOverviewPage({ searchParams }: OverviewRoutePageProps) {
  return renderOverviewPage({ locale: 'zh', searchParams });
}
