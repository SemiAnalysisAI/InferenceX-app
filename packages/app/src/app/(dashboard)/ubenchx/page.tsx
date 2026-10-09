import type { Metadata } from 'next';

import { UbenchxContent } from '@/components/ubenchx/UbenchxContent';
import { tabMetadata } from '@/lib/tab-meta';

const meta = tabMetadata('ubenchx');
export const metadata: Metadata = { ...meta, robots: { index: false, follow: false } };

export default function UbenchxPage() {
  return <UbenchxContent />;
}
