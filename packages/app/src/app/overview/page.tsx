import { buildOverviewMetadata, renderOverviewPage } from '@/lib/overview/overview-route.server';

export const revalidate = 86400;

export const metadata = buildOverviewMetadata('en');

export default function OverviewPage() {
  return renderOverviewPage({ locale: 'en' });
}
