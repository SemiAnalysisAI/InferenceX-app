import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('profit-estimator-per-megawatt');

export default function ProfitEstimatorPage() {
  return (
    <ProfitEstimatorDisplay
      basis="mw-hour"
      routeModel={defaultRouteModel('profit-estimator-per-megawatt')}
    />
  );
}
