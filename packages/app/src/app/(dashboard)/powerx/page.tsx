import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('powerx');

export default function PowerXPage() {
  return (
    <PowerXSurfaceProvider>
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </PowerXSurfaceProvider>
  );
}
