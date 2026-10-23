'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import { toModel } from '@/lib/compare/compare-enum-coerce';

const ModelArchitectureDiagram = dynamic(
  () => import('@/components/inference/ui/ModelArchitectureDiagram'),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

export default function ModelArchitectureInline({ displayName }: { displayName: string }) {
  const model = toModel(displayName);
  if (!model) return null;
  return <ModelArchitectureDiagram model={model} variant="inline" />;
}
