import { ImageResponse } from 'next/og';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { pickPairDefaults } from '@/lib/compare-pair-defaults';
import { canonicalCompareSlug, parseCompareSlug } from '@/lib/compare-slug';
import {
  computeCompareImageRows,
  computeCompareTableData,
  getCachedBenchmarks,
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
const CHART = { left: 96, top: 42, width: 630, height: 272 };
const COLORS = {
  background: '#0d1117',
  panel: '#121a23',
  border: '#23303d',
  muted: '#9aa7b5',
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

function money(value: number): string {
  if (value >= 10) return `$${value.toFixed(1)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
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
  ).filter((row) => row.a || row.b);
  const curveRows = imageRows.length > 0 ? imageRows : plottedRows;

  const aLabel = HW_REGISTRY[parsed.a]?.label ?? parsed.a.toUpperCase();
  const bLabel = HW_REGISTRY[parsed.b]?.label ?? parsed.b.toUpperCase();
  const costs = curveRows
    .flatMap((row) => [row.a?.cost, row.b?.cost])
    .filter((cost): cost is number => typeof cost === 'number' && Number.isFinite(cost));
  const costMin = costs.length > 0 ? Math.min(...costs) : 0;
  const costMax = costs.length > 0 ? Math.max(...costs) : 1;
  const costPadding = Math.max((costMax - costMin) * 0.18, costMax * 0.08, 0.02);
  const yMin = Math.max(0, costMin - costPadding);
  const yMax = costMax + costPadding;
  const xMin = curveRows.at(0)?.target ?? 0;
  const xMax = curveRows.at(-1)?.target ?? 100;
  const scaleX = (value: number) =>
    CHART.left + (xMax === xMin ? CHART.width / 2 : ((value - xMin) / (xMax - xMin)) * CHART.width);
  const scaleY = (value: number) =>
    CHART.top +
    CHART.height -
    (yMax === yMin ? CHART.height / 2 : ((value - yMin) / (yMax - yMin)) * CHART.height);

  const aPoints = curveRows
    .filter((row) => row.a)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.a!.cost) }));
  const bPoints = curveRows
    .filter((row) => row.b)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.b!.cost) }));
  const aHighlightPoints = plottedRows
    .filter((row) => row.a)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.a!.cost) }));
  const bHighlightPoints = plottedRows
    .filter((row) => row.b)
    .map((row) => ({ x: scaleX(row.target), y: scaleY(row.b!.cost) }));
  const yTicks = Array.from({ length: 4 }, (_, index) => yMin + ((yMax - yMin) * index) / 3);
  const workload = [sequence, precision?.toUpperCase()].filter(Boolean).join(' / ');

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
            {yTicks.map((tick) => {
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
            {aPoints.length > 1 && (
              <path
                d={pointsPath(aPoints)}
                fill="none"
                stroke={COLORS.a}
                strokeWidth="9"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {bPoints.length > 1 && (
              <path
                d={pointsPath(bPoints)}
                fill="none"
                stroke={COLORS.b}
                strokeWidth="9"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
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
          {yTicks.map((tick) => (
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
              {money(tick)}
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
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              left: CHART.left,
              top: CHART.top + CHART.height + 43,
              width: CHART.width,
              justifyContent: 'center',
              color: COLORS.muted,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Interactivity (tok/s/user)
          </div>
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
