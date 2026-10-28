import type { Metadata } from 'next';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { PowerXFeatureGate } from '@/components/powerx/powerx-feature-gate';
import { PowerXSurfaceProvider } from '@/components/inference/ui/powerx-surface';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('powerx');

export default function ZhPowerXPage() {
  return (
    <PowerXFeatureGate locale="zh">
      <ZhTabIntro tab="powerx" />
      <PowerXSurfaceProvider>
        <InferenceProvider activeTab="inference">
          <InferenceChartDisplay />
        </InferenceProvider>
      </PowerXSurfaceProvider>
    </PowerXFeatureGate>
  );
}
