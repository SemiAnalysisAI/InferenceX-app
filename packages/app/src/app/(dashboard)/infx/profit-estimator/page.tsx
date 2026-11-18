import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadata } from '@/lib/routing/tab-meta';

export const metadata: Metadata = tabMetadata('profit-estimator');

export default function ProfitEstimatorPage() {
  return (
    <ProfitEstimatorDisplay basis="chip-hour" routeModel={defaultRouteModel('profit-estimator')} />
  );
}
