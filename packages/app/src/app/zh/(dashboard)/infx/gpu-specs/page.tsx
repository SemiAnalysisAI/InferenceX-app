import type { Metadata } from 'next';

import { GpuSpecsContent } from '@/components/gpu-specs/gpu-specs-content';

import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('gpu-specs');

export default function ZhGpuSpecsPage() {
  return <GpuSpecsContent />;
}
