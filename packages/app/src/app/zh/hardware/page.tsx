import type { Metadata } from 'next';

import { HardwareIndexContent } from '@/components/hardware/hardware-index-content';
import { hardwareIndexMetadata } from '@/lib/hardware/hardware';

export const metadata: Metadata = hardwareIndexMetadata('zh');

export default function ZhHardwareIndexPage() {
  return <HardwareIndexContent locale="zh" />;
}
