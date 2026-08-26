import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

/**
 * Model deep-dive shell. `UnofficialRunProvider` is required by the embedded
 * dashboard's filter contexts (same dependency the /compare routes satisfy in
 * their layout).
 */
export default function ModelLayout({ children }: { children: ReactNode }) {
  return <UnofficialRunProvider>{children}</UnofficialRunProvider>;
}
