import type { Metadata } from 'next';

import OperatorXDashboard from '@/components/operatorx/OperatorXDashboard';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('operatorx');

export default function ZhOperatorXPage() {
  return (
    <>
      <ZhTabIntro tab="operatorx" />
      <OperatorXDashboard />
    </>
  );
}
