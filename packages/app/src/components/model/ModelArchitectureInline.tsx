'use client';

import dynamic from 'next/dynamic';

import { toModel } from '@/lib/compare/compare-enum-coerce';

// Server-rendered so the page HTML already holds the header, notes and an svg sized to the
// diagram's final height; only the drawing happens after mount, so nothing below it moves.
const ModelArchitectureDiagram = dynamic(
  () => import('@/components/inference/ui/ModelArchitectureDiagram'),
);

export default function ModelArchitectureInline({ displayName }: { displayName: string }) {
  const model = toModel(displayName);
  if (!model) return null;
  return <ModelArchitectureDiagram model={model} variant="inline" />;
}
