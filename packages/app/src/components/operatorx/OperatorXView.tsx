'use client';

import dynamic from 'next/dynamic';

import { topLevelModel } from '@semianalysisai/inferencex-db/operatorx/workloads';
import { useOperatorXModel } from '@/hooks/api/use-operatorx';
import { useClientSearch } from '@/hooks/useClientSearch';
import { DEFAULT_OPERATORX_MODEL } from '@/lib/routing/operatorx-category';

import { ComparisonDashboard } from './ComparisonDashboard';
import { ModelViewLoading } from './model-view/shell';
import { useOperatorXCategory } from './OperatorXHeader';

const ModelView = dynamic(() => import('./model-view/ModelView').then((mod) => mod.ModelView), {
  loading: ModelViewLoading,
});

function ModelViewTab() {
  const search = new URLSearchParams(useClientSearch());
  // The model is an InferenceX model; OperatorX files it under its checkpoint family.
  const model = topLevelModel(search.get('model') ?? DEFAULT_OPERATORX_MODEL);
  const parallel = search.get('parallel');
  const gemm = useOperatorXModel('gemm', model, parallel);
  const moe = useOperatorXModel('moe', model, parallel);
  const attention = useOperatorXModel('attention', model, parallel);
  return <ModelView gemm={gemm} moe={moe} attention={attention} />;
}

export default function OperatorXView() {
  const category = useOperatorXCategory();
  return (
    <div className="flex flex-col gap-4 pb-4" data-testid="operatorx-page">
      {category === 'model' ? (
        <ModelViewTab />
      ) : (
        <ComparisonDashboard key={category} op={category} />
      )}
    </div>
  );
}
