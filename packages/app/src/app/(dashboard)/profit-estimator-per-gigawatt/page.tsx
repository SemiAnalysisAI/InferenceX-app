import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('profit-estimator-per-gigawatt');

export default function ProfitEstimatorPage() {
  return (
    <>
      <ProfitEstimatorDisplay
        basis="gw-year"
        routeModel={defaultRouteModel('profit-estimator-per-gigawatt')}
      />
      <TabIntro tab="profit-estimator-per-gigawatt" />
    </>
  );
}
