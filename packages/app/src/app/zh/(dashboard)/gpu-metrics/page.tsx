import type { Metadata } from 'next';

import GpuMetricsDisplay from '@/components/gpu-power/GpuPowerDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('gpu-metrics');

export default function ZhGpuMetricsPage() {
  return (
    <>
      <ZhTabIntro tab="gpu-metrics" />
      <GpuMetricsDisplay />
    </>
  );
}
