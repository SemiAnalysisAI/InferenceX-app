import type { Metadata } from 'next';

import ProfitEstimatorDisplay from '@/components/calculator/ProfitEstimatorDisplay';

import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('profit-estimator-per-million-dollars');

export default function ZhProfitEstimatorPage() {
  return (
    <ProfitEstimatorDisplay
      basis="spend-1m"
      routeModel={defaultRouteModel('profit-estimator-per-million-dollars')}
    />
  );
}
