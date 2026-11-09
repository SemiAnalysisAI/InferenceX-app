import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { PowerXFeatureGate } from '@/components/powerx/powerx-feature-gate';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('powerx');

export default function PowerXPage() {
  return (
    <PowerXFeatureGate locale="en">
      <PowerXSurfaceProvider>
        <InferenceProvider activeTab="inference">
          <InferenceChartDisplay />
        </InferenceProvider>
      </PowerXSurfaceProvider>
      <TabIntro tab="powerx" />
    </PowerXFeatureGate>
  );
}
