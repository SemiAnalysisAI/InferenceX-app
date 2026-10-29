import { buildOverviewMetadata, renderOverviewPage } from '@/lib/overview/overview-route.server';

export const revalidate = 3600;

export const metadata = buildOverviewMetadata('en');

export default function OverviewPage() {
  return renderOverviewPage({ locale: 'en' });
}
