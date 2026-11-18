import type { Metadata } from 'next';

import OperatorXView from '@/components/operatorx/OperatorXView';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('operatorx');

export default function ZhOperatorXPage() {
  return <OperatorXView />;
}
