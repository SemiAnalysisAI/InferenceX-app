import type { Metadata } from 'next';

import { NotFoundContent } from '@/components/not-found-content';

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function NotFound() {
  return <NotFoundContent locale="en" />;
}
