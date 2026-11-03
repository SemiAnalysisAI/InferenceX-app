import type { Metadata } from 'next';

import { LazyProfitEstimatorDisplay } from '@/components/calculator/lazy-calculator-displays';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

export const metadata: Metadata = tabMetadata('profit-estimator');

export default function ProfitEstimatorPage() {
  return (
    <>
      <LazyProfitEstimatorDisplay
        basis="chip-hour"
        routeModel={defaultRouteModel('profit-estimator')}
      />
      <TabIntro tab="profit-estimator" />
    </>
  );
}
