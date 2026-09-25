import type { Metadata } from 'next';

import OperatorXView from '@/components/operatorx/OperatorXView';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('operatorx');

export default function OperatorXPage() {
  return <OperatorXView />;
}
