import type { Metadata } from 'next';
import RevenueCapacityDisplay from '@/components/calculator/RevenueCapacityDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';

export const metadata: Metadata = tabMetadata('revenue-capacity');

export default async function RevenueCapacityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const initial = Object.fromEntries(
    VIEW_QUERY_PARAMS['revenue-capacity'].flatMap((key) =>
      typeof query[key] === 'string' ? [[key, query[key]]] : [],
    ),
  );
  return <RevenueCapacityDisplay key={JSON.stringify(initial)} initial={initial} />;
}
