import type { Metadata } from 'next';

import SubmissionsDisplay from '@/components/submissions/SubmissionsDisplay';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('submissions');

export default function SubmissionsPage() {
  return <SubmissionsDisplay />;
}
