import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

// Next.js no longer resolves metadata exported from nested not-found files
// (zh/not-found.tsx), so the layout's `index, follow` robots and canonical
// were leaking onto 404 responses. Declaring the metadata on the catch-all
// route keeps unknown /zh paths noindexed and canonical-free.
export const metadata: Metadata = {
  title: '页面不存在',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function UnknownChineseRoute() {
  notFound();
}
