import { notFound } from 'next/navigation';

import EmbedFrame from '@/components/embed/EmbedFrame';
import EmbeddedModelDashboard from '@/components/model/EmbeddedModelDashboard';
import { comparisonScenarioForModel } from '@/lib/compare/compare-agentx';
import { getCompareModelBySlug } from '@/lib/compare/compare-slug';
import { parseEmbedOptions } from '@/lib/embed/embed';

export type EmbedSearchParams = Record<string, string | string[] | undefined>;

export default function EmbedModelPage({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: EmbedSearchParams;
}) {
  const entry = getCompareModelBySlug(slug);
  if (!entry) notFound();

  const options = parseEmbedOptions(searchParams);
  const sequence = options.sequence ?? comparisonScenarioForModel(entry).sequence;

  return (
    <EmbedFrame theme={options.theme} skin={options.skin}>
      <EmbeddedModelDashboard
        displayName={entry.displayName}
        sequence={sequence}
        yAxisMetric={options.yAxisMetric}
        lockedFrameworks={options.frameworks.length > 0 ? options.frameworks : undefined}
        minimalChrome
      />
    </EmbedFrame>
  );
}
