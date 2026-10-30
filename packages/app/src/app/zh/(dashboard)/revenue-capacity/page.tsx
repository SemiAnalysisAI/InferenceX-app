import type { Metadata } from 'next';
import RevenueCapacityPage from '@/app/(dashboard)/revenue-capacity/page';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('revenue-capacity');

export default RevenueCapacityPage;
