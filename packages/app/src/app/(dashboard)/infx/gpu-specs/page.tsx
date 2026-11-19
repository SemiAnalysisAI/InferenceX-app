import type { Metadata } from 'next';

import { GpuSpecsContent } from '@/components/gpu-specs/gpu-specs-content';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('gpu-specs');

export default function GpuSpecsPage() {
  return <GpuSpecsContent />;
}
