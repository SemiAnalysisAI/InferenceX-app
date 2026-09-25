import type { Metadata } from 'next';

import OperatorXDashboard from '@/components/operatorx/OperatorXDashboard';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('operatorx');

export default function OperatorXPage() {
  return <OperatorXDashboard />;
}
