import type { Metadata } from 'next';

import OperatorXDisplay from '@/components/operatorx/OperatorXDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('operatorx');

export default function OperatorXPage() {
  return <OperatorXDisplay />;
}
