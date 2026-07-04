import type { Metadata } from 'next';

import SubmissionsDisplay from '@/components/submissions/SubmissionsDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('submissions');

export default function ZhSubmissionsPage() {
  return (
    <>
      <ZhTabIntro tab="submissions" />
      <SubmissionsDisplay />
    </>
  );
}
