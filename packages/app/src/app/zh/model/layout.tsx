import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/providers/unofficial-run-provider';

export default function ZhModelLayout({ children }: { children: ReactNode }) {
  return <UnofficialRunProvider>{children}</UnofficialRunProvider>;
}
