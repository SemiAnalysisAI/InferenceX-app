import { ImageResponse } from 'next/og';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { trackServer } from '@/lib/analytics-server';
import { getCachedBenchmarks } from '@/lib/compare-ssr';
import {
  computeVariantCompareImageRows,
  computeVariantCompareTableData,
  pickVariantPairDefaults,
  type VariantCompareSide,
} from '@/lib/compare-variant-ssr';
import {
  canonicalSpecDecodeCompareSlug,
  parseSpecDecodeCompareSlug,
  precisionDisplayLabel,
  specMethodDisplayLabel,
} from '@/lib/compare-variant-slug';
import { getLogoSrc } from '@/lib/og-assets';
import {
  buildSeriesPoints,
  CHART,
  CHART_FRAME,
  COLORS,
  money,
  moneyForStep,
  niceAxis,
  R,
  renderSeriesPath,
  SIZE,
  splitByMatchRange,
} from '@/lib/png-chart';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const parsed = parseSpecDecodeCompareSlug(slug);
  if (
    !parsed ||
    canonicalSpecDecodeCompareSlug(
      parsed.model.slug,
      parsed.gpu,
      parsed.precision,
      parsed.method,
    ) !== slug.toLowerCase()
  ) {
    return new Response('Not found', { status: 404 });
  }

  const [rows, logoSrc] = await Promise.all([
    getCachedBenchmarks(parsed.model.dbKeys),
    getLogoSrc(),
  ]);

  // Precision is fixed by the slug — both sides share it.
  const sideA: VariantCompareSide = { specMethod: parsed.method, precision: parsed.precision };
  const sideB: VariantCompareSide = { specMethod: 'none', precision: parsed.precision };
  const defaults = pickVariantPairDefaults('spec-decode', rows, parsed.gpu, sideA, sideB);
  const { sequence } = defaults;
  const precision = parsed.precision;

  const { ssrRows, interactivityRange } = computeVariantCompareTableData(
    rows,
    parsed.gpu,
    sequence,
    sideA,
    sideB,
  );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeVariantCompareImageRows(
    rows,
    parsed.gpu,
    sequence,
    sideA,
    sideB,
    interactivityRange,
    plottedRows.map((r) => r.target),
  ).filter((row) => row.a || row.b);
  const curveRows = imageRows.length > 0 ? imageRows : plottedRows;

  const gpuLabel = HW_REGISTRY[parsed.gpu]?.label ?? parsed.gpu.toUpperCase();
  const precLabel = precisionDisplayLabel(parsed.precision);
  const aLabel = specMethodDisplayLabel(parsed.model.displayName, parsed.method);
  const bLabel = 'Off';

  const costs = curveRows
    .flatMap((row) => [row.a?.cost, row.b?.cost])
    .filter((cost): cost is number => typeof cost === 'number' && Number.isFinite(cost));
  const costMin = costs.length > 0 ? Math.min(...costs) : 0;
  const costMax = costs.length > 0 ? Math.max(...costs) : 1;
  const yAxis = niceAxis(Math.min(0, costMin), costMax);
  const yMin = yAxis.min;
  const yMax = yAxis.max;
  const yStep = yAxis.step;
  const xMin = curveRows.at(0)?.target ?? 0;
  const xMax = curveRows.at(-1)?.target ?? 100;
  const matchedMin = plottedRows.at(0)?.target ?? xMin;
  const matchedMax = plottedRows.at(-1)?.target ?? xMax;
  const hasLeftExtension = matchedMin - xMin >= 0.5;
  const hasRightExtension = xMax - matchedMax >= 0.5;
  const scaleX = (value: number) =>
    CHART.left + (xMax === xMin ? CHART.width / 2 : ((value - xMin) / (xMax - xMin)) * CHART.width);
  const scaleY = (value: number) =>
    CHART.top +
    CHART.height -
    (yMax === yMin ? CHART.height / 2 : ((value - yMin) / (yMax - yMin)) * CHART.height);

  const aSeries = splitByMatchRange(
    buildSeriesPoints(curveRows, (r) => r.a?.cost ?? null, scaleX, scaleY),
    matchedMin,
    matchedMax,
  );
  const bSeries = splitByMatchRange(
    buildSeriesPoints(curveRows, (r) => r.b?.cost ?? null, scaleX, scaleY),
    matchedMin,
    matchedMax,
  );
  const aHighlightPoints = plottedRows
    .filter((row) => row.a)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.a!.cost) }));
  const bHighlightPoints = plottedRows
    .filter((row) => row.b)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.b!.cost) }));
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');
  const showRangeEndpoints = hasLeftExtension || hasRightExtension;
  const svgWidth = 760 * R;
  const svgHeight = 406 * R;

  try {
    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: SIZE.width,
          height: SIZE.height,
          padding: `${38 * R}px ${46 * R}px ${26 * R}px`,
          background: COLORS.background,
          color: COLORS.text,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 * R }}>
            <div
              style={{
                display: 'flex',
                fontSize: 19 * R,
                fontWeight: 700,
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                color: COLORS.blue,
              }}
            >
              InferenceX Speculative Decoding Comparison
            </div>
            <div style={{ display: 'flex', fontSize: 41 * R, fontWeight: 800 }}>
              {parsed.model.label}
            </div>
            <div style={{ display: 'flex', fontSize: 25 * R, color: COLORS.muted }}>
              {gpuLabel} {precLabel}: {aLabel} vs {bLabel} | Cost per Million Tokens
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              border: `${R}px solid ${COLORS.border}`,
              borderRadius: 12 * R,
              padding: `${13 * R}px ${17 * R}px`,
              background: COLORS.panel,
              gap: 5 * R,
            }}
          >
            <div style={{ display: 'flex', fontSize: 14 * R, color: COLORS.muted }}>
              DEFAULT WORKLOAD
            </div>
            <div style={{ display: 'flex', fontSize: 21 * R, fontWeight: 700 }}>
              {workload || 'Default comparison'}
            </div>
            <div style={{ display: 'flex', fontSize: 14 * R, color: COLORS.muted }}>
              Lower cost is better
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 34 * R, marginTop: 22 * R }}>
          <div
            style={{ display: 'flex', position: 'relative', width: svgWidth, height: svgHeight }}
          >
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ position: 'absolute', left: 0, top: 0 }}
            >
              <rect
                x={CHART_FRAME.left}
                y={CHART_FRAME.top}
                width={CHART_FRAME.width}
                height={CHART_FRAME.height}
                rx={13 * R}
                fill={COLORS.panel}
                stroke={COLORS.border}
              />
              {yAxis.ticks.map((tick) => {
                const y = scaleY(tick);
                return (
                  <line
                    key={tick}
                    x1={CHART.left}
                    x2={CHART.left + CHART.width}
                    y1={y}
                    y2={y}
                    stroke={COLORS.grid}
                    strokeWidth={2 * R}
                  />
                );
              })}
              {plottedRows.map((row) => {
                const x = scaleX(row.target);
                return (
                  <line
                    key={`mark-${row.target}`}
                    x1={x}
                    x2={x}
                    y1={CHART.top + CHART.height}
                    y2={CHART.top + CHART.height + 6 * R}
                    stroke={COLORS.muted}
                    strokeWidth={2 * R}
                  />
                );
              })}
              {renderSeriesPath(aSeries.leftExt, COLORS.a, true)}
              {renderSeriesPath(aSeries.rightExt, COLORS.a, true)}
              {renderSeriesPath(aSeries.matched, COLORS.a, false)}
              {renderSeriesPath(bSeries.leftExt, COLORS.b, true)}
              {renderSeriesPath(bSeries.rightExt, COLORS.b, true)}
              {renderSeriesPath(bSeries.matched, COLORS.b, false)}
              {aHighlightPoints.map((point, index) => (
                <circle
                  key={`a-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={10 * R}
                  fill={COLORS.a}
                  stroke={COLORS.background}
                  strokeWidth={4 * R}
                />
              ))}
              {bHighlightPoints.map((point, index) => (
                <circle
                  key={`b-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={10 * R}
                  fill={COLORS.b}
                  stroke={COLORS.background}
                  strokeWidth={4 * R}
                />
              ))}
            </svg>
            {logoSrc && (
              <img
                src={logoSrc}
                alt=""
                height={144 * R}
                style={{
                  position: 'absolute',
                  left: CHART.left + CHART.width / 2 - 168 * R,
                  top: CHART.top + CHART.height / 2 - 72 * R,
                  opacity: 0.12,
                }}
              />
            )}
            {yAxis.ticks.map((tick) => (
              <div
                key={`y-label-${tick}`}
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: CHART_FRAME.left + 14 * R,
                  top: scaleY(tick) - 9 * R,
                  width: CHART.left - CHART_FRAME.left - 28 * R,
                  justifyContent: 'flex-end',
                  color: COLORS.muted,
                  fontSize: 15 * R,
                }}
              >
                {moneyForStep(tick, yStep)}
              </div>
            ))}
            {plottedRows.map((row) => (
              <div
                key={`x-label-${row.target}`}
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: scaleX(row.target) - 32 * R,
                  top: CHART.top + CHART.height + 15 * R,
                  width: 64 * R,
                  justifyContent: 'center',
                  color: COLORS.muted,
                  fontSize: 16 * R,
                  fontWeight: 600,
                }}
              >
                {row.target}
              </div>
            ))}
            {showRangeEndpoints && hasLeftExtension && (
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: scaleX(xMin) - 4 * R,
                  top: CHART.top + CHART.height + 16 * R,
                  width: 56 * R,
                  justifyContent: 'flex-start',
                  color: COLORS.faint,
                  fontSize: 13 * R,
                  fontStyle: 'italic',
                }}
              >
                {Math.round(xMin)}
              </div>
            )}
            {showRangeEndpoints && hasRightExtension && (
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: scaleX(xMax) - 52 * R,
                  top: CHART.top + CHART.height + 16 * R,
                  width: 56 * R,
                  justifyContent: 'flex-end',
                  color: COLORS.faint,
                  fontSize: 13 * R,
                  fontStyle: 'italic',
                }}
              >
                {Math.round(xMax)}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                left: CHART.left,
                top: CHART.top + CHART.height + 38 * R,
                width: CHART.width,
                justifyContent: 'center',
                color: COLORS.muted,
                fontSize: 15 * R,
                fontWeight: 600,
              }}
            >
              Interactivity (tok/s/user)
            </div>
            {showRangeEndpoints && (
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  left: CHART.left,
                  top: CHART.top + CHART.height + 62 * R,
                  width: CHART.width,
                  justifyContent: 'center',
                  color: COLORS.faint,
                  fontSize: 13 * R,
                  fontStyle: 'italic',
                }}
              >
                Dashed segments extend to each config's operating envelope, where cost rises steeply
              </div>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              gap: 17 * R,
              paddingTop: 18 * R,
            }}
          >
            <div style={{ display: 'flex', fontSize: 18 * R, fontWeight: 700 }}>
              Matched Interactivity
            </div>
            <div style={{ display: 'flex', gap: 20 * R, fontSize: 15 * R, color: COLORS.muted }}>
              <span style={{ display: 'flex', gap: 7 * R, alignItems: 'center' }}>
                <span
                  style={{
                    display: 'flex',
                    width: 19 * R,
                    height: 6 * R,
                    borderRadius: 3 * R,
                    background: COLORS.a,
                  }}
                />
                {aLabel}
              </span>
              <span style={{ display: 'flex', gap: 7 * R, alignItems: 'center' }}>
                <span
                  style={{
                    display: 'flex',
                    width: 19 * R,
                    height: 6 * R,
                    borderRadius: 3 * R,
                    background: COLORS.b,
                  }}
                />
                {bLabel}
              </span>
            </div>
            {plottedRows.length > 0 ? (
              plottedRows.map((row) => (
                <div
                  key={`row-${row.target}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6 * R,
                    border: `${R}px solid ${COLORS.border}`,
                    borderRadius: 10 * R,
                    padding: `${11 * R}px ${13 * R}px`,
                    background: COLORS.panel,
                  }}
                >
                  <div style={{ display: 'flex', color: COLORS.muted, fontSize: 13 * R }}>
                    {row.target} tok/s/user
                  </div>
                  <div style={{ display: 'flex', gap: 15 * R, fontSize: 19 * R, fontWeight: 700 }}>
                    <span style={{ display: 'flex', color: COLORS.a }}>
                      {row.a ? money(row.a.cost) : 'N/A'}
                    </span>
                    <span style={{ display: 'flex', color: COLORS.b }}>
                      {row.b ? money(row.b.cost) : 'N/A'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ display: 'flex', fontSize: 18 * R, color: COLORS.muted }}>
                No matched cost data available.
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: 9 * R,
            fontSize: 15 * R,
            color: COLORS.muted,
          }}
        >
          <span style={{ display: 'flex' }}>
            Speculative decoding comparison | interpolated from benchmark results
          </span>
          <span style={{ display: 'flex', color: COLORS.text, fontWeight: 700 }}>
            inferencex.semianalysis.com
          </span>
        </div>
      </div>,
      {
        ...SIZE,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackServer('compare_spec_decode_png_render_failed', {
      slug,
      model: parsed.model.slug,
      gpu: parsed.gpu,
      method: parsed.method,
      sequence,
      precision,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: message.slice(0, 500),
    });
    return new Response('PNG render failed', {
      status: 502,
      headers: { 'Cache-Control': 'public, s-maxage=60' },
    });
  }
}
