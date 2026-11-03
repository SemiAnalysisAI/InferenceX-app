import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import { LazyUnofficialRunProvider } from '@/providers/lazy-unofficial-run-provider';

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

export default function EmbedShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${embedSans.variable} ${embedMono.variable} contents`}>
      <LazyUnofficialRunProvider>{children}</LazyUnofficialRunProvider>
    </div>
  );
}
