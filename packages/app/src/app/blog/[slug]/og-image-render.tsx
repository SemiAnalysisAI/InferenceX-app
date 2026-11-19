import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog/blog';

export const size = { width: 1200, height: 630 };

const BLUE = '#0B86D1';
const BG = '#131416';
const PANEL_BG = '#0F1214';

const TILE_GRID: ({ file: string; rotate?: number } | null)[] = [
  { file: 'teal-chevron.png', rotate: 180 },
  { file: 'gold-diagonal.png' },
  { file: 'teal-circuit.png' },
  null,
  { file: 'gold-wavy.png' },
  { file: 'teal-chip.png' },
  { file: 'teal-chevron.png', rotate: 90 },
  { file: 'teal-organic.png' },
  null,
  { file: 'gold-circuit.png' },
  { file: 'teal-circuit.png', rotate: 180 },
  { file: 'teal-organic.png', rotate: 180 },
];

async function loadTile(name: string): Promise<string> {
  const buf = await readFile(join(process.cwd(), 'public/brand/og-tiles', name));
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function loadTiles() {
  const uniqueFiles = [...new Set(TILE_GRID.filter(Boolean).map((t) => t!.file))];
  const loaded = await Promise.all(uniqueFiles.map(async (f) => [f, await loadTile(f)] as const));
  const cache = Object.fromEntries(loaded);
  return TILE_GRID.map((t) => (t ? { src: cache[t.file], rotate: t.rotate } : null));
}

export async function renderOgImage(
  meta: Pick<BlogPostMeta, 'title' | 'subtitle' | 'date'>,
  opts?: {
    dateLabel?: string;
  },
) {
  const [logoSrc, tiles] = await Promise.all([
    readFile(join(process.cwd(), 'public/brand/logo-color.png')).then(
      (buf) => `data:image/png;base64,${buf.toString('base64')}`,
    ),
    loadTiles(),
  ]);
  const titleSize = meta.title.length > 50 ? 56 : meta.title.length > 35 ? 64 : 72;

  const contentWidth = 895;
  const textBoxHeight = 482;
  const titleLineH = Math.ceil(titleSize * 1.2);
  const charsPerTitleLine = Math.floor(contentWidth / (titleSize * 0.55));
  const titleLines = Math.ceil(meta.title.length / charsPerTitleLine);
  const titleHeight = titleLines * titleLineH + 18;
  const subtitleLineH = Math.ceil(42 * 1.4);
  const subtitleSpace = textBoxHeight - titleHeight;
  const maxSubtitleLines = Math.max(0, Math.floor(subtitleSpace / subtitleLineH));
  const charsPerSubtitleLine = Math.floor(contentWidth / (42 * 0.52));
  const maxSubtitleChars = maxSubtitleLines * charsPerSubtitleLine;

  let subtitle = meta.subtitle;
  if (subtitle.length > maxSubtitleChars && maxSubtitleChars > 0) {
    subtitle = `${subtitle.slice(0, maxSubtitleChars).replace(/\s\S*$/u, '')}…`;
  } else if (maxSubtitleChars <= 0) {
    subtitle = '';
  }

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: 195,
          height: '100%',
          backgroundColor: PANEL_BG,
          position: 'relative',
        }}
      >
        {tiles.map((tile, i) => {
          if (!tile) return null;
          const row = Math.floor(i / 2);
          const col = i % 2;
          return (
            <img
              key={i}
              src={tile.src}
              alt=""
              style={{
                position: 'absolute',
                left: 12 + col * 90,
                top: 12 + row * 104,
                width: 78,
                height: 86,
                borderRadius: 4,
                objectFit: 'cover',
                ...(tile.rotate ? { transform: `rotate(${tile.rotate}deg)` } : {}),
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 3,
            height: '100%',
            backgroundColor: BLUE,
            display: 'flex',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 55px 20px 55px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#FFFFFF',
              flexShrink: 0,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 42,
              color: '#C9CACB',
              lineHeight: 1.4,
              overflow: 'hidden',
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 28, color: '#d4d4d8' }}>
            {opts?.dateLabel ??
              new Date(`${meta.date}T00:00:00Z`).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
          </span>
          <img src={logoSrc} height={80} alt="SemiAnalysis" />
        </div>
      </div>
    </div>,
    size,
  );
}
