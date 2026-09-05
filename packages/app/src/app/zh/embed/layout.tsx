import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/**
 * Embed shell. Embeds are fragments meant to live inside another site's
 * iframe, so they are kept out of search indexes; the host page is the
 * canonical surface. `UnofficialRunProvider` is required by the dashboard's
 * filter contexts (same dependency `/model` satisfies in its layout).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ZhEmbedLayout({ children }: { children: ReactNode }) {
  return <UnofficialRunProvider>{children}</UnofficialRunProvider>;
}
