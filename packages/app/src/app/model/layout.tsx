import type { ReactNode } from 'react';

import { LazyUnofficialRunProvider } from '@/providers/lazy-unofficial-run-provider';

export default function ModelLayout({ children }: { children: ReactNode }) {
  return <LazyUnofficialRunProvider>{children}</LazyUnofficialRunProvider>;
}
