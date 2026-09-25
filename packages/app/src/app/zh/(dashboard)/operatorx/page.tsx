import type { Metadata } from 'next';

import OperatorXView from '@/components/operatorx/OperatorXView';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('operatorx');

export default function ZhOperatorXPage() {
  return (
    <>
      <ZhTabIntro tab="operatorx" />
      <OperatorXView />
    </>
  );
}
