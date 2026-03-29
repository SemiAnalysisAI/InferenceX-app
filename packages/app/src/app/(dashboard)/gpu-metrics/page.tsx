import type { Metadata } from 'next';

import GpuMetricsDisplay from '@/components/gpu-power/GpuPowerDisplay';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('gpu-metrics');

export default function GpuMetricsPage() {
  return <GpuMetricsDisplay />;
}
