import type { Metadata } from 'next';

import { NotFoundContent } from '@/components/not-found-content';

export const metadata: Metadata = {
  title: '页面不存在',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function ZhNotFound() {
  return <NotFoundContent locale="zh" />;
}
