import type { ReactNode } from 'react';

import { UnofficialRunProvider } from '@/components/unofficial-run-provider';

export default function ZhModelLayout({ children }: { children: ReactNode }) {
  return <UnofficialRunProvider>{children}</UnofficialRunProvider>;
}
