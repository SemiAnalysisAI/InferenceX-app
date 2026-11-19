import type { Metadata } from 'next';

import SubmissionsDisplay from '@/components/submissions/SubmissionsDisplay';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('submissions');

export default function ZhSubmissionsPage() {
  return <SubmissionsDisplay />;
}
