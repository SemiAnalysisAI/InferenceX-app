import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/*
 * Fonts used by embed skins. They are published as `--font-embed-*` on a
 * wrapper element (next/font only lets us attach a class), and EmbedFrame
 * hoists the resolved values onto <html> so a skin's
 * `body { --font-dm-sans: var(--font-embed-sans) }` reaches portalled UI too.
 * The vLLM recipes site uses Inter + JetBrains Mono.
 */
const embedSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-embed-sans',
});
const embedMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-embed-mono',
});

/**
 * Shared shell for `/embed` and `/zh/embed`. `UnofficialRunProvider` is
 * required by the dashboard's filter contexts (same dependency `/model`
 * satisfies in its layout).
 */
export default function EmbedShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${embedSans.variable} ${embedMono.variable} contents`}>
      <UnofficialRunProvider>{children}</UnofficialRunProvider>
    </div>
  );
}
