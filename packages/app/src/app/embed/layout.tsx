import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import EmbedBoot from '@/components/embed/EmbedBoot';
import EmbedShell from '@/components/embed/EmbedShell';

/**
 * Embed shell. Embeds are fragments meant to live inside another site's
 * iframe, so they are kept out of search indexes; the host page is the
 * canonical surface. `EmbedShell` loads the skin fonts and the providers the
 * dashboard needs.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <EmbedBoot />
      <EmbedShell>{children}</EmbedShell>
    </>
  );
}
