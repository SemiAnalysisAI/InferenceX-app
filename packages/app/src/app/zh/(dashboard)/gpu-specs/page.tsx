import type { Metadata } from 'next';

import { GpuSpecsContent } from '@/components/gpu-specs/gpu-specs-content';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('gpu-specs');

export default function ZhGpuSpecsPage() {
  return (
    <>
      <ZhTabIntro tab="gpu-specs" />
      <GpuSpecsContent />
    </>
  );
}
