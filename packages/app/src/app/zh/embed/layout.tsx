import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import EmbedBoot from '@/components/embed/EmbedBoot';
import EmbedShell from '@/components/embed/EmbedShell';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ZhEmbedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EmbedBoot />
      <EmbedShell>{children}</EmbedShell>
    </>
  );
}
