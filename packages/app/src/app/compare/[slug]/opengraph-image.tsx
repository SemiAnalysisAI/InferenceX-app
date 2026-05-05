import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { allCanonicalComparePairs, parseCompareSlug, toCompareSlug } from '@/lib/compare-slug';

export const alt = 'GPU inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BLUE = '#0B86D1';
const BG = '#131416';
const PANEL_BG = '#0F1214';
const VENDOR_COLOR: Record<string, string> = {
  NVIDIA: '#76B900',
  AMD: '#ED1C24',
  Intel: '#0071C5',
};

export function generateStaticParams() {
  return allCanonicalComparePairs().map(({ a, b }) => ({ slug: toCompareSlug(a, b) }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pair = parseCompareSlug(slug);
  const logoSrc = await readFile(join(process.cwd(), 'public/brand/logo-color.png')).then(
    (buf) => `data:image/png;base64,${buf.toString('base64')}`,
  );

  if (!pair) {
    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: BG,
          color: '#fafafa',
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        InferenceX GPU Comparison
      </div>,
      size,
    );
  }

  const aMeta = HW_REGISTRY[pair.a];
  const bMeta = HW_REGISTRY[pair.b];
  const aLabel = aMeta?.label ?? pair.a.toUpperCase();
  const bLabel = bMeta?.label ?? pair.b.toUpperCase();
  const aColor = aMeta ? (VENDOR_COLOR[aMeta.vendor] ?? BLUE) : BLUE;
  const bColor = bMeta ? (VENDOR_COLOR[bMeta.vendor] ?? BLUE) : BLUE;

  const fontSize = aLabel.length + bLabel.length > 22 ? 96 : 120;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        position: 'relative',
        padding: '60px 70px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 6,
          height: '100%',
          backgroundColor: BLUE,
          display: 'flex',
        }}
      />
      <div
        style={{
          fontSize: 28,
          color: '#9BA0A6',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          display: 'flex',
        }}
      >
        Head-to-head GPU benchmark
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 40,
          marginTop: 30,
        }}
      >
        <GpuPanel
          label={aLabel}
          vendor={aMeta?.vendor}
          arch={aMeta?.arch}
          color={aColor}
          fontSize={fontSize}
          align="flex-start"
        />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: '#FFFFFF',
              backgroundColor: PANEL_BG,
              padding: '14px 28px',
              borderRadius: 999,
              border: `2px solid ${BLUE}`,
              display: 'flex',
            }}
          >
            VS
          </div>
        </div>
        <GpuPanel
          label={bLabel}
          vendor={bMeta?.vendor}
          arch={bMeta?.arch}
          color={bColor}
          fontSize={fontSize}
          align="flex-end"
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 20,
          borderTop: '1px solid #2A2D31',
        }}
      >
        <span style={{ fontSize: 28, color: '#9BA0A6', display: 'flex' }}>
          AI inference benchmark · latency, throughput, cost
        </span>
        <img src={logoSrc} height={64} />
      </div>
    </div>,
    size,
  );
}

function GpuPanel({
  label,
  vendor,
  arch,
  color,
  fontSize,
  align,
}: {
  label: string;
  vendor?: string;
  arch?: string;
  color: string;
  fontSize: number;
  align: 'flex-start' | 'flex-end';
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        alignItems: align,
        textAlign: align === 'flex-start' ? 'left' : 'right',
        gap: 12,
      }}
    >
      <div
        style={{
          fontSize,
          fontWeight: 800,
          color: '#FFFFFF',
          lineHeight: 1.05,
          display: 'flex',
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {vendor && (
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: '#FFFFFF',
              backgroundColor: color,
              padding: '4px 14px',
              borderRadius: 6,
              display: 'flex',
            }}
          >
            {vendor}
          </span>
        )}
        {arch && <span style={{ fontSize: 26, color: '#C9CACB', display: 'flex' }}>{arch}</span>}
      </div>
    </div>
  );
}
