/**
 * V175: Cyberpunk Hologram — Holographic projection on very dark background with scan lines, cyan/magenta glitch offset, AR registration corners.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;
  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // Horizontal scan lines across the entire image
  const scanLines = Array.from({ length: 105 }, (_, i) => ({
    top: i * 6,
    opacity: i % 3 === 0 ? 0.12 : 0.06,
  }));

  // Corner registration marks (AR/hologram style L-brackets)
  // Each corner has a horizontal and vertical arm
  const cornerMarks = [
    // Top-left
    { hTop: 30, hLeft: 30, hWidth: 40, vTop: 30, vLeft: 30, vHeight: 40 },
    // Top-right
    { hTop: 30, hLeft: 1130, hWidth: 40, vTop: 30, vLeft: 1166, vHeight: 40 },
    // Bottom-left
    { hTop: 580, hLeft: 30, hWidth: 40, vTop: 560, vLeft: 30, vHeight: 40 },
    // Bottom-right
    { hTop: 580, hLeft: 1130, hWidth: 40, vTop: 560, vLeft: 1166, vHeight: 40 },
  ];

  // Small data readout elements
  const dataReadouts = [
    { top: 35, left: 85, text: 'SYS.ONLINE' },
    { top: 35, left: 1000, text: 'FREQ: 847.3 THz' },
    { top: 585, left: 85, text: 'PROJ.STABLE' },
    { top: 585, left: 980, text: 'RES: 1200x630' },
  ];

  // Vertical interference bars
  const interferenceBars = [
    { left: 180, width: 1, height: 630, opacity: 0.08 },
    { left: 400, width: 2, height: 630, opacity: 0.05 },
    { left: 750, width: 1, height: 630, opacity: 0.07 },
    { left: 1020, width: 2, height: 630, opacity: 0.04 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#050508',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scan lines */}
      {scanLines.map((line, i) => (
        <div
          key={`sl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: 0,
            width: '100%',
            height: 1,
            backgroundColor: '#00ffff',
            opacity: line.opacity,
          }}
        />
      ))}

      {/* Vertical interference bars */}
      {interferenceBars.map((bar, i) => (
        <div
          key={`ib${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: bar.left,
            width: bar.width,
            height: bar.height,
            backgroundColor: '#00ffff',
            opacity: bar.opacity,
          }}
        />
      ))}

      {/* Corner registration marks */}
      {cornerMarks.map((corner, i) => (
        <div key={`cm${i}`} style={{ display: 'flex' }}>
          {/* Horizontal arm */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: corner.hTop,
              left: corner.hLeft,
              width: corner.hWidth,
              height: 2,
              backgroundColor: '#00ffff',
              opacity: 0.7,
            }}
          />
          {/* Vertical arm */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: corner.vTop,
              left: corner.vLeft,
              width: 2,
              height: corner.vHeight,
              backgroundColor: '#00ffff',
              opacity: 0.7,
            }}
          />
          {/* Corner dot */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: corner.vTop - 2,
              left: corner.hLeft - 2,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#00ffff',
              opacity: 0.5,
            }}
          />
        </div>
      ))}

      {/* Data readouts */}
      {dataReadouts.map((readout, i) => (
        <div
          key={`dr${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: readout.top,
            left: readout.left,
            fontSize: 10,
            color: '#00ffff',
            opacity: 0.35,
            letterSpacing: '0.15em',
            fontWeight: 600,
          }}
        >
          {readout.text}
        </div>
      ))}

      {/* HOLOGRAPHIC PROJECTION watermark — horizontal across center */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 308,
          left: 0,
          width: '100%',
          justifyContent: 'center',
          fontSize: 14,
          color: '#00ffff',
          opacity: 0.08,
          letterSpacing: '0.8em',
          fontWeight: 700,
          zIndex: 1,
        }}
      >
        HOLOGRAPHIC PROJECTION
      </div>

      {/* Magenta glitch offset of title */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 203,
          left: 123,
          right: 77,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#ff00ff',
          opacity: 0.35,
          zIndex: 2,
        }}
      >
        {meta.title}
      </div>

      {/* Cyan secondary offset */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 197,
          left: 117,
          right: 83,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#00ffff',
          opacity: 0.2,
          zIndex: 2,
        }}
      >
        {meta.title}
      </div>

      {/* Holographic projection border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 70,
          left: 80,
          right: 80,
          bottom: 70,
          border: '1px solid #00ffff',
          opacity: 0.15,
          zIndex: 2,
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '80px 120px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={32} height={32} />
            <span
              style={{
                marginLeft: 10,
                fontSize: 18,
                fontWeight: 700,
                color: '#00ffff',
                letterSpacing: '0.12em',
              }}
            >
              InferenceX
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {/* Pulsing indicator */}
            <div
              style={{
                display: 'flex',
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#00ffff',
                opacity: 0.8,
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: 12,
                color: '#00ffff',
                opacity: 0.6,
                letterSpacing: '0.2em',
                fontWeight: 600,
              }}
            >
              HOLO.ACTIVE
            </div>
          </div>
        </div>

        {/* Title — primary cyan layer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#00ffff',
              opacity: 0.9,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 17,
              color: '#00bbcc',
              lineHeight: 1.5,
              opacity: 0.6,
            }}
          >
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', fontSize: 14, color: '#00ffff', opacity: 0.7 }}>
              {meta.author}
            </div>
            <div style={{ display: 'flex', fontSize: 13, color: '#00aaaa', opacity: 0.5 }}>
              {formattedDate}
            </div>
            <div style={{ display: 'flex', fontSize: 12, color: '#008888', opacity: 0.4 }}>
              {meta.readingTime} min read
            </div>
          </div>
          {meta.tags && (
            <div style={{ display: 'flex', gap: 12 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#ff00ff',
                    letterSpacing: '0.12em',
                    opacity: 0.5,
                    fontWeight: 600,
                  }}
                >
                  {tag.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 8,
          left: 0,
          right: 0,
          justifyContent: 'center',
          fontSize: 9,
          color: '#00ffff',
          opacity: 0.15,
          letterSpacing: '0.3em',
          zIndex: 10,
        }}
      >
        BLADE RUNNER HOLO-SYS v4.9 // REPLICANT CERTIFIED
      </div>
    </div>,
    size,
  );
}
