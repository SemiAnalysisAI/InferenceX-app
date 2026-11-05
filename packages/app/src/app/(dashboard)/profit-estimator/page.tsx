import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('profit-estimator');

export default function ProfitEstimatorPage() {
  return (
    <>
      <ProfitEstimatorDisplay
        basis="chip-hour"
        routeModel={defaultRouteModel('profit-estimator')}
      />
      <TabIntro tab="profit-estimator" />
    </>
  );
}
