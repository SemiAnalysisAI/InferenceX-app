import type { Metadata } from 'next';

import { LazyProfitEstimatorDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { defaultRouteModel } from '@/lib/routing/model-routes';
import { tabMetadataZh } from '@/lib/routing/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('profit-estimator');

export default function ZhProfitEstimatorPage() {
  return (
    <>
      <LazyProfitEstimatorDisplay
        basis="chip-hour"
        routeModel={defaultRouteModel('profit-estimator')}
      />
      <ZhTabIntro tab="profit-estimator" />
    </>
  );
}
