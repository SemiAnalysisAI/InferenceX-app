import {
  buildOverviewMetadata,
  type OverviewRoutePageProps,
  renderOverviewPage,
} from '@/lib/overview-route.server';

export const dynamic = 'force-dynamic';

export const metadata = buildOverviewMetadata('en');

export default function OverviewPage({ searchParams }: OverviewRoutePageProps) {
  return renderOverviewPage({ locale: 'en', searchParams });
}
