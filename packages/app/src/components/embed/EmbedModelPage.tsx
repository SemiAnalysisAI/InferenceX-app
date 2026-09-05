import { notFound } from 'next/navigation';

import EmbedFrame from '@/components/embed/EmbedFrame';
import EmbeddedModelDashboard from '@/components/model/EmbeddedModelDashboard';
import { FRAMEWORK_FAMILIES } from '@/components/inference/utils/quickFilters';
import { comparisonScenarioForModel } from '@/lib/compare-agentx';
import { getCompareModelBySlug } from '@/lib/compare-slug';
import { parseEmbedOptions } from '@/lib/embed';
import { localePath, type Locale } from '@/lib/i18n';

export type EmbedSearchParams = Record<string, string | string[] | undefined>;

/**
 * Shared body of `/embed/model/[slug]` and `/zh/embed/model/[slug]`.
 *
 * Resolves the compare-slug (aliases included) to its dashboard model, seeds
 * the featured scenario unless `?scenario=` overrides it, and hands the
 * framework lock from `?framework=` to the dashboard. Unknown slugs 404.
 */
export default function EmbedModelPage({
  slug,
  searchParams,
  locale,
}: {
  slug: string;
  searchParams: EmbedSearchParams;
  locale: Locale;
}) {
  const entry = getCompareModelBySlug(slug);
  if (!entry) notFound();

  const options = parseEmbedOptions(searchParams);
  const sequence = options.sequence ?? comparisonScenarioForModel(entry).sequence;
  const frameworkLabels = FRAMEWORK_FAMILIES.filter((f) => options.frameworks.includes(f.key)).map(
    (f) => f.label,
  );

  const dashboardQuery = new URLSearchParams({
    g_model: entry.displayName,
    i_seq: sequence,
    i_optimal: '1',
  });
  if (options.frameworks.length > 0) dashboardQuery.set('i_fw', options.frameworks.join(','));
  const dashboardHref = `${localePath('/inference', locale)}?${dashboardQuery.toString()}`;

  return (
    <EmbedFrame
      theme={options.theme}
      locale={locale}
      dashboardHref={dashboardHref}
      frameworkLabels={frameworkLabels}
    >
      <EmbeddedModelDashboard
        displayName={entry.displayName}
        sequence={sequence}
        yAxisMetric={options.yAxisMetric}
        lockedFrameworks={options.frameworks.length > 0 ? options.frameworks : undefined}
      />
    </EmbedFrame>
  );
}
