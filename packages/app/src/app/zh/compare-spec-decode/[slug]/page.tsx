import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import {
  HW_REGISTRY,
  SITE_NAME,
  SITE_URL,
  SUPPORTERS_LINE_ZH,
} from '@semianalysisai/inferencex-constants';

import { JsonLd } from '@/components/json-ld';
import { AGENTIC_SCENARIO_INTRO_ZH } from '@/lib/compare-ssr-zh';
import {
  isAgenticSequence,
  type ScenarioSegment,
  sequenceForScenarioSegment,
} from '@/lib/compare-scenario-route';
import { getCachedBenchmarks, KNOWN_SEQUENCES, pickString } from '@/lib/compare-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';
import {
  computeVariantCompareTableData,
  dateRangeForVariantPair,
  pickVariantPairDefaults,
  summarizeVariantSide,
  type VariantCompareSide,
} from '@/lib/compare-variant-ssr';
import {
  buildVariantBreadcrumbJsonLdZh,
  buildVariantJsonLdZh,
  variantCompareNarrativeZh,
} from '@/lib/compare-variant-ssr-zh';
import { ZH_OG_LOCALE, zhAlternates } from '@/lib/i18n';

import CompareSpecDecodePageClient from '../../../compare-spec-decode/[slug]/page-client';

export const dynamic = 'force-dynamic';

/**
 * `/zh/compare-spec-decode/<slug>/<scenario>` renders this same page with the workload
 * pinned by the path. The segment is threaded through rather than duplicated
 * in a parallel route file so the body — redirects, JSON-LD, metadata, client
 * props — is written once and cannot drift between the two URLs.
 */
export interface ScenarioOptions {
  scenarioSegment?: ScenarioSegment;
}

/** English twin of `scenarioPath` — hreflang pairs are keyed off the
 *  English route, so the segment has to survive the locale swap. */
function enScenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/compare-spec-decode/${canonical}/${scenarioSegment}`
    : `/compare-spec-decode/${canonical}`;
}

function scenarioPath(canonical: string, scenarioSegment?: ScenarioSegment): string {
  return scenarioSegment
    ? `/zh/compare-spec-decode/${canonical}/${scenarioSegment}`
    : `/zh/compare-spec-decode/${canonical}`;
}

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildSpecDecodeMetadataZh(slug, {});
}

export function buildSpecDecodeMetadataZh(
  slug: string,
  { scenarioSegment }: ScenarioOptions,
): Metadata {
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (!parsed) return {};
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const canonical = canonicalSpecDecodeCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precision,
    parsed.method,
  );
  // The scenario segments are views of one comparison, so the bare slug URL
  // stays the indexable representative and every segment canonicalizes to it.
  // Without this, `/…/<slug>/<default-scenario>` and `/…/<slug>` would serve
  // byte-identical pages, each claiming to be canonical.
  const routePath = scenarioPath(canonical, scenarioSegment);
  const url = `${SITE_URL}${routePath}`;
  const description = `在 ${gpuLabel} ${precLabel} 上运行 ${parsed.model.label} 时，对比启用 ${aLabel} 与关闭投机解码的表现。InferenceX 是 SemiAnalysis 推出的独立开源基准测试平台，结果均经过验证且可复现。${SUPPORTERS_LINE_ZH}了解投机解码在不同交互性水平下能否提高吞吐量并降低成本。`;
  const title = `${parsed.model.label} — ${gpuLabel} ${precLabel}：启用 ${aLabel} 与关闭投机解码的对比`;
  return {
    title,
    description,
    alternates: zhAlternates(enScenarioPath(canonical)),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function CompareSpecDecodePageZh({ params, searchParams }: Props) {
  const { slug } = await params;
  return renderSpecDecodePageZh(slug, await searchParams, {});
}

export async function renderSpecDecodePageZh(
  slug: string,
  sp: Record<string, string | string[] | undefined>,
  { scenarioSegment }: ScenarioOptions,
) {
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (!parsed) notFound();

  const canonical = canonicalSpecDecodeCompareSlug(
    parsed.model.slug,
    parsed.gpu,
    parsed.precision,
    parsed.method,
  );
  if (canonical !== slug.toLowerCase()) {
    const qs = Object.entries(sp)
      .flatMap(([k, v]) => {
        if (Array.isArray(v)) return v.map((vv) => [k, vv] as const);
        if (v === undefined) return [];
        return [[k, v] as const];
      })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    // Keep the scenario segment across the redirect — dropping it would send
    // the reader to the pair's default workload instead.
    permanentRedirect(`${scenarioPath(canonical, scenarioSegment)}${qs ? `?${qs}` : ''}`);
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = '关闭';

  // Precision is fixed by the slug — both sides share it.
  const sideA: VariantCompareSide = { specMethod: parsed.method, precision: parsed.precision };
  const sideB: VariantCompareSide = { specMethod: 'none', precision: parsed.precision };
  const defaults = pickVariantPairDefaults('spec-decode', rows, parsed.gpu, sideA, sideB);

  const urlSeq = pickString(sp.i_seq);
  const pathSequence = scenarioSegment ? sequenceForScenarioSegment(scenarioSegment) : null;
  const effectiveSequence =
    pathSequence ?? (urlSeq && KNOWN_SEQUENCES.has(urlSeq) ? urlSeq : defaults.sequence);
  const effectivePrecision = parsed.precision;

  const sideAFull: VariantCompareSide = {
    specMethod: parsed.method,
    precision: effectivePrecision,
  };
  const sideBFull: VariantCompareSide = {
    specMethod: 'none',
    precision: effectivePrecision,
  };

  const { defaultTargets, ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    effectiveSequence,
    sideAFull,
    sideBFull,
  );

  const summaryA = summarizeVariantSide(rows, parsed.gpu, sideAFull);
  const summaryB = summarizeVariantSide(rows, parsed.gpu, sideBFull);
  const { oldest, newest } = dateRangeForVariantPair(rows, parsed.gpu, sideAFull, sideBFull);

  const url = `${SITE_URL}${scenarioPath(canonical, scenarioSegment)}`;
  // The PNG route exists only under the EN tree; zh JSON-LD references it there.
  const imageUrl = `${SITE_URL}/compare-spec-decode/${canonical}/spec-decode-comparison.png?lang=zh`;

  const jsonLd = buildVariantJsonLdZh(
    'spec-decode',
    parsed.model,
    parsed.gpu,
    aLabel,
    bLabel,
    url,
    summaryA,
    summaryB,
    ssrRows,
    imageUrl,
    oldest,
    newest,
  );
  const breadcrumbJsonLd = buildVariantBreadcrumbJsonLdZh(
    'spec-decode',
    `${parsed.model.label} — ${gpuLabel} ${precLabel}：启用 ${aLabel} 与关闭投机解码的对比`,
    url,
  );
  const narrative = variantCompareNarrativeZh(
    'spec-decode',
    parsed.model.label,
    `${gpuLabel} ${precLabel}`,
    aLabel,
    bLabel,
    ssrRows,
    interactivityRange,
  );

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <CompareSpecDecodePageClient
        gpu={parsed.gpu}
        method={parsed.method}
        slug={canonical}
        modelLabel={parsed.model.label}
        modelDisplayName={parsed.model.displayName}
        defaultSequence={effectiveSequence}
        defaultPrecision={effectivePrecision}
        ssrTableData={{ defaultTargets, ssrRows, interactivityRange }}
        narrative={narrative}
        agenticIntro={isAgenticSequence(effectiveSequence) ? AGENTIC_SCENARIO_INTRO_ZH : null}
        gpuLabel={gpuLabel}
        precisionLabel={precLabel}
        gpuArch={gpuMeta?.arch ?? ''}
        gpuVendor={gpuMeta?.vendor ?? ''}
        aLabel={aLabel}
        bLabel={bLabel}
        heroImageSrc={`/compare-spec-decode/${canonical}/spec-decode-comparison.png?lang=zh`}
        locale="zh"
      />
    </>
  );
}
