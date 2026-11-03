import type { Metadata } from 'next';

import { LazyPowerXDashboard } from '@/components/powerx/lazy-powerx-dashboard';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('powerx');

export default function ZhPowerXPage() {
  return (
    <LazyPowerXDashboard locale="zh">
      <ZhTabIntro tab="powerx" />
    </LazyPowerXDashboard>
  );
}
