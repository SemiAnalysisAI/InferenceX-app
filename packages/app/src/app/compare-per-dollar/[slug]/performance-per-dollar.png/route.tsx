import { ImageResponse } from 'next/og';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare-slug';
import {
  computeCompareImageRows,
  computeCompareTableData,
  getCachedBenchmarks,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISPLAY_SIZE = { width: 1200, height: 675 };
const IMAGE_SCALE = 2;
const SIZE = {
  width: DISPLAY_SIZE.width * IMAGE_SCALE,
  height: DISPLAY_SIZE.height * IMAGE_SCALE,
};
const CHART_FRAME = { left: 0, top: 18, width: 746, height: 382 };
const CHART = { left: 96, top: 42, width: 630, height: 260 };
const COLORS = {
  background: '#0d1117',
  panel: '#121a23',
  border: '#23303d',
  muted: '#9aa7b5',
  faint: '#5f6e7d',
  text: '#f3f7fb',
  a: '#38d9a9',
  b: '#f7b041',
  grid: '#263544',
  blue: '#0b86d1',
};

interface Point {
  x: number;
  y: number;
}

interface TargetedPoint extends Point {
  target: number;
}

function money(value: number): string {
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}

/** Decimals chosen from the tick step so every label in the axis prints with
 * the same precision (no $0.000/$9.01/$18.0 mix). */
function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  return Math.max(0, Math.ceil(-Math.log10(step)));
}

function moneyForStep(value: number, step: number): string {
  return `$${value.toFixed(decimalsForStep(step))}`;
}

/** "Nice" step in the 1/2/5 × 10ⁿ family, the same convention d3 uses. */
function niceStep(span: number, targetCount: number): number {
  const rawStep = span / Math.max(1, targetCount - 1);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / mag;
  if (normalized < 1.5) return mag;
  if (normalized < 3) return 2 * mag;
  if (normalized < 7) return 5 * mag;
  return 10 * mag;
}

function niceAxis(
  min: number,
  max: number,
  targetCount = 5,
): { min: number; max: number; step: number; ticks: number[] } {
  if (max <= min) return { min, max: min + 1, step: 1, ticks: [min] };
  const step = niceStep(max - min, targetCount);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step * 1e-6; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  return { min: niceMin, max: niceMax, step, ticks };
}

function pointsPath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed || canonicalCompareSlug(parsed.model.slug, parsed.a, parsed.b) !== slug) {
    return new Response('Not found', { status: 404 });
  }

  const rows = await getCachedBenchmarks(parsed.model.dbKeys);
  const { sequence, precision } = pickPairDefaults(rows, parsed.a, parsed.b);
  const { ssrRows, interactivityRange } = computeCompareTableData(
    rows,
    parsed.a,
    parsed.b,
    sequence,
    precision,
  );
  const plottedRows = ssrRows.filter((row) => row.a || row.b);
  const imageRows = computeCompareImageRows(
    rows,
    parsed.a,
    parsed.b,
    sequence,
    precision,
    interactivityRange,
    plottedRows.map((r) => r.target),
  ).filter((row) => row.a || row.b);
  const curveRows = imageRows.length > 0 ? imageRows : plottedRows;

  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();
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

  function buildSeriesPoints(getCost: (row: SsrInterpolatedRow) => number | null): TargetedPoint[] {
    return curveRows
      .map((row) => ({ target: row.target, cost: getCost(row) }))
      .filter((p): p is { target: number; cost: number } => p.cost !== null)
      .map((p) => ({ x: scaleX(p.target), y: scaleY(p.cost), target: p.target }));
  }

  function splitByMatchRange(points: TargetedPoint[]) {
    return {
      matched: points.filter((p) => p.target >= matchedMin && p.target <= matchedMax),
      leftExt: points.filter((p) => p.target <= matchedMin),
      rightExt: points.filter((p) => p.target >= matchedMax),
    };
  }

  const aSeries = splitByMatchRange(buildSeriesPoints((r) => r.a?.cost ?? null));
  const bSeries = splitByMatchRange(buildSeriesPoints((r) => r.b?.cost ?? null));
  const aHighlightPoints = plottedRows
    .filter((row) => row.a)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.a!.cost) }));
  const bHighlightPoints = plottedRows
    .filter((row) => row.b)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.b!.cost) }));
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');
  const showRangeEndpoints = hasLeftExtension || hasRightExtension;

  function renderSeriesPath(points: Point[], stroke: string, dashed: boolean) {
    if (points.length < 2) return null;
    return (
      <path
        d={pointsPath(points)}
        fill="none"
        stroke={stroke}
        strokeWidth="9"
        strokeOpacity={dashed ? 0.55 : 1}
        strokeDasharray={dashed ? '14 10' : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    );
  }

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: DISPLAY_SIZE.width,
        height: DISPLAY_SIZE.height,
        padding: '38px 46px 26px',
        background: COLORS.background,
        color: COLORS.text,
        fontFamily: 'Arial, sans-serif',
        transform: `scale(${IMAGE_SCALE})`,
        transformOrigin: 'top left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              fontWeight: 700,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: COLORS.blue,
            }}
          >
            InferenceX Performance per Dollar
          </div>
          <div style={{ display: 'flex', fontSize: 41, fontWeight: 800 }}>{parsed.model.label}</div>
          <div style={{ display: 'flex', fontSize: 25, color: COLORS.muted }}>
            {aLabel} vs {bLabel} | Cost per Million Tokens
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: '13px 17px',
            background: COLORS.panel,
            gap: 5,
          }}
        >
          <div style={{ display: 'flex', fontSize: 14, color: COLORS.muted }}>DEFAULT WORKLOAD</div>
          <div style={{ display: 'flex', fontSize: 21, fontWeight: 700 }}>
            {workload || 'Default comparison'}
          </div>
          <div style={{ display: 'flex', fontSize: 14, color: COLORS.muted }}>
            Lower cost is better
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 34, marginTop: 22 }}>
        <div style={{ display: 'flex', position: 'relative', width: 760, height: 406 }}>
          <svg
            width="760"
            height="406"
            viewBox="0 0 760 406"
            style={{ position: 'absolute', left: 0, top: 0 }}
          >
            <rect
              x={CHART_FRAME.left}
              y={CHART_FRAME.top}
              width={CHART_FRAME.width}
              height={CHART_FRAME.height}
              rx="13"
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
                  strokeWidth="2"
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
                  y2={CHART.top + CHART.height + 6}
                  stroke={COLORS.muted}
                  strokeWidth="2"
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
                r="10"
                fill={COLORS.a}
                stroke={COLORS.background}
                strokeWidth="4"
              />
            ))}
            {bHighlightPoints.map((point, index) => (
              <circle
                key={`b-${index}`}
                cx={point.x}
                cy={point.y}
                r="10"
                fill={COLORS.b}
                stroke={COLORS.background}
                strokeWidth="4"
              />
            ))}
          </svg>
          {yAxis.ticks.map((tick) => (
            <div
              key={`y-label-${tick}`}
              style={{
                display: 'flex',
                position: 'absolute',
                left: CHART_FRAME.left + 14,
                top: scaleY(tick) - 9,
                width: CHART.left - CHART_FRAME.left - 28,
                justifyContent: 'flex-end',
                color: COLORS.muted,
                fontSize: 15,
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
                left: scaleX(row.target) - 32,
                top: CHART.top + CHART.height + 15,
                width: 64,
                justifyContent: 'center',
                color: COLORS.muted,
                fontSize: 16,
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
                left: scaleX(xMin) - 4,
                top: CHART.top + CHART.height + 16,
                width: 56,
                justifyContent: 'flex-start',
                color: COLORS.faint,
                fontSize: 13,
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
                left: scaleX(xMax) - 52,
                top: CHART.top + CHART.height + 16,
                width: 56,
                justifyContent: 'flex-end',
                color: COLORS.faint,
                fontSize: 13,
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
              top: CHART.top + CHART.height + 38,
              width: CHART.width,
              justifyContent: 'center',
              color: COLORS.muted,
              fontSize: 15,
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
                top: CHART.top + CHART.height + 62,
                width: CHART.width,
                justifyContent: 'center',
                color: COLORS.faint,
                fontSize: 13,
                fontStyle: 'italic',
              }}
            >
              Dashed segments extend to each SKU's operating envelope, where cost rises steeply
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            gap: 17,
            paddingTop: 18,
          }}
        >
          <div style={{ display: 'flex', fontSize: 18, fontWeight: 700 }}>
            Matched Interactivity
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 15, color: COLORS.muted }}>
            <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <span
                style={{
                  display: 'flex',
                  width: 19,
                  height: 6,
                  borderRadius: 3,
                  background: COLORS.a,
                }}
              />
              {aLabel}
            </span>
            <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <span
                style={{
                  display: 'flex',
                  width: 19,
                  height: 6,
                  borderRadius: 3,
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
                  gap: 6,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: '11px 13px',
                  background: COLORS.panel,
                }}
              >
                <div style={{ display: 'flex', color: COLORS.muted, fontSize: 13 }}>
                  {row.target} tok/s/user
                </div>
                <div style={{ display: 'flex', gap: 15, fontSize: 19, fontWeight: 700 }}>
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
            <div style={{ display: 'flex', fontSize: 18, color: COLORS.muted }}>
              No matched cost data available.
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 9,
          fontSize: 15,
          color: COLORS.muted,
        }}
      >
        <span style={{ display: 'flex' }}>
          Owning-hyperscaler TCO | interpolated from benchmark results
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
}
