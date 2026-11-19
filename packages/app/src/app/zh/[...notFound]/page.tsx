import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: '页面不存在',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function UnknownChineseRoute() {
  notFound();
}
