import type { Metadata } from 'next';

import { GpuSpecsContent } from '@/components/gpu-specs/gpu-specs-content';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('gpu-specs');

export default function GpuSpecsPage() {
  return <GpuSpecsContent />;
}
