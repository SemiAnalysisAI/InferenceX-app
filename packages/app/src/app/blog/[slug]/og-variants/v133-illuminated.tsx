/**
 * V133: Illuminated Manuscript — Medieval vellum background with ornate initial letter, decorative vine margins, red and gold accents.
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
  const excerpt = meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt;

  const gold = '#c8a84e';
  const deepRed = '#8b1a1a';
  const vellum = '#1a1815';

  const firstLetter = meta.title.charAt(0).toUpperCase();
  const restOfTitle = meta.title.slice(1);

  // Vine pattern along left margin — circles and connecting lines
  const vineNodes = Array.from({ length: 12 }, (_, i) => ({
    top: 70 + i * 45,
    left: 38,
    size: 8 + (i % 3) * 3,
    isLeaf: i % 3 === 0,
  }));

  // Vine connecting stems (vertical lines between nodes)
  const vineStems = Array.from({ length: 11 }, (_, i) => ({
    top: 70 + i * 45 + 10,
    left: 42,
    height: 35,
  }));

  // Small decorative branch offshoots
  const branches = [
    { top: 115, left: 50, w: 15, h: 2 },
    { top: 205, left: 50, w: 20, h: 2 },
    { top: 295, left: 50, w: 12, h: 2 },
    { top: 385, left: 50, w: 18, h: 2 },
    { top: 475, left: 50, w: 14, h: 2 },
    { top: 160, left: 50, w: 10, h: 2 },
    { top: 340, left: 50, w: 16, h: 2 },
  ];

  // Corner ornaments
  const cornerSize = 30;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: vellum,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle vellum texture overlay */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#1e1c16',
          opacity: 0.4,
        }}
      />

      {/* Outer border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          left: 20,
          right: 20,
          bottom: 20,
          border: `2px solid ${gold}`,
          opacity: 0.4,
          borderRadius: 2,
        }}
      />

      {/* Inner border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 28,
          left: 28,
          right: 28,
          bottom: 28,
          border: `1px solid ${gold}`,
          opacity: 0.25,
          borderRadius: 1,
        }}
      />

      {/* Corner ornaments — top left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 14,
          left: 14,
          width: cornerSize,
          height: cornerSize,
          backgroundColor: deepRed,
          borderRadius: 3,
          border: `2px solid ${gold}`,
          opacity: 0.7,
        }}
      />
      {/* Corner ornament — top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 14,
          right: 14,
          width: cornerSize,
          height: cornerSize,
          backgroundColor: deepRed,
          borderRadius: 3,
          border: `2px solid ${gold}`,
          opacity: 0.7,
        }}
      />
      {/* Corner ornament — bottom left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 14,
          left: 14,
          width: cornerSize,
          height: cornerSize,
          backgroundColor: deepRed,
          borderRadius: 3,
          border: `2px solid ${gold}`,
          opacity: 0.7,
        }}
      />
      {/* Corner ornament — bottom right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 14,
          right: 14,
          width: cornerSize,
          height: cornerSize,
          backgroundColor: deepRed,
          borderRadius: 3,
          border: `2px solid ${gold}`,
          opacity: 0.7,
        }}
      />

      {/* Corner inner dots */}
      {[
        { top: 22, left: 22 },
        { top: 22, right: 22 },
        { bottom: 22, left: 22 },
        { bottom: 22, right: 22 },
      ].map((pos, i) => (
        <div
          key={`dot-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            ...pos,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: gold,
            opacity: 0.5,
          }}
        />
      ))}

      {/* Left margin vine — stems */}
      {vineStems.map((stem, i) => (
        <div
          key={`stem-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: stem.top,
            left: stem.left,
            width: 2,
            height: stem.height,
            backgroundColor: gold,
            opacity: 0.25,
          }}
        />
      ))}

      {/* Left margin vine — nodes */}
      {vineNodes.map((node, i) => (
        <div
          key={`node-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: node.top,
            left: node.left - node.size / 2 + 4,
            width: node.size,
            height: node.size,
            borderRadius: node.size / 2,
            backgroundColor: node.isLeaf ? deepRed : gold,
            opacity: node.isLeaf ? 0.4 : 0.3,
          }}
        />
      ))}

      {/* Vine branches */}
      {branches.map((branch, i) => (
        <div
          key={`branch-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: branch.top,
            left: branch.left,
            width: branch.w,
            height: branch.h,
            backgroundColor: gold,
            opacity: 0.2,
          }}
        />
      ))}

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          padding: '50px 60px 50px 80px',
          height: '100%',
          zIndex: 3,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 30 }}>
          <img src={logoSrc} width={28} height={28} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 15,
              color: gold,
              fontWeight: 600,
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title with illuminated initial */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20, maxWidth: 900 }}>
          {/* Illuminated initial letter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 90,
              height: 90,
              backgroundColor: deepRed,
              border: `3px solid ${gold}`,
              borderRadius: 6,
              marginRight: 16,
              marginTop: 4,
              flexShrink: 0,
            }}
          >
            {/* Inner decorative border */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 74,
                height: 74,
                border: `1px solid ${gold}`,
                borderRadius: 3,
                opacity: 0.5,
              }}
            >
              <span
                style={{
                  fontSize: 58,
                  fontWeight: 900,
                  color: gold,
                  lineHeight: 1,
                }}
              >
                {firstLetter}
              </span>
            </div>
          </div>

          {/* Rest of title */}
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              color: '#e0d0a0',
              lineHeight: 1.2,
              paddingTop: 4,
            }}
          >
            {restOfTitle}
          </div>
        </div>

        {/* Decorative line under title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            marginLeft: 106,
          }}
        >
          <div
            style={{ display: 'flex', width: 60, height: 1, backgroundColor: gold, opacity: 0.3 }}
          />
          <div
            style={{
              display: 'flex',
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: deepRed,
              opacity: 0.5,
            }}
          />
          <div
            style={{ display: 'flex', width: 60, height: 1, backgroundColor: gold, opacity: 0.3 }}
          />
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 19,
            color: '#9a8a65',
            lineHeight: 1.5,
            marginBottom: 20,
            maxWidth: 750,
            marginLeft: 106,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 15, color: '#7a6a40', fontStyle: 'italic' }}>
            Scribed by {meta.author} &middot; {formattedDate}
          </div>
          <div style={{ display: 'flex', fontSize: 14, color: '#6a5a38' }}>
            {meta.readingTime} min read
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 8, gap: 10 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 11,
                  color: gold,
                  opacity: 0.6,
                  border: `1px solid ${gold}33`,
                  borderRadius: 3,
                  padding: '2px 8px',
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
