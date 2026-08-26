'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import { toModel } from '@/lib/compare-enum-coerce';

// Client-only like the old dashboard drawer: the SVG diagram sizes itself
// against the rendered container, so it has no meaningful SSR output.
const ModelArchitectureDiagram = dynamic(
  () => import('@/components/inference/ui/ModelArchitectureDiagram'),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

/**
 * Always-expanded architecture diagram for `/model/[slug]` pages. Renders
 * nothing when the model has no `MODEL_ARCHITECTURES` entry (the diagram
 * component returns null) — the page's MDX Architecture section still covers
 * those models in prose.
 */
export default function ModelArchitectureInline({ displayName }: { displayName: string }) {
  const model = toModel(displayName);
  if (!model) return null;
  return <ModelArchitectureDiagram model={model} variant="inline" />;
}
