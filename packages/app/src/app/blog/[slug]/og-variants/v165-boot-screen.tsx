/**
 * V165: Boot Screen — BIOS/boot sequence with green monospace text on pure black background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const green = '#00ff41';
  const dimGreen = '#00aa2a';

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        color: green,
        fontFamily: 'monospace',
        padding: '40px 60px',
        position: 'relative',
      }}
    >
      {/* BIOS Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={20} height={20} />
          <span style={{ fontSize: 18, fontWeight: 700, marginLeft: '10px', color: green }}>
            InferenceX BIOS v1.0
          </span>
        </div>
        <span style={{ fontSize: 14, color: dimGreen }}>(C) 2024 InferenceX Corp.</span>
      </div>

      {/* Thin separator */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          borderTop: `1px solid ${dimGreen}`,
          marginBottom: '20px',
        }}
      />

      {/* Boot lines */}
      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>InferenceX Blog Engine POST...</span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>
          Memory Test: {meta.readingTime * 1024} KB OK
        </span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>Detecting Blog Article............ Found</span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>Loading article... OK</span>
      </div>

      <div style={{ display: 'flex', marginBottom: '12px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>
          -----------------------------------------------
        </span>
      </div>

      {/* Article details */}
      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>Title: </span>
        <span style={{ fontSize: 14, color: green, fontWeight: 700 }}>
          {meta.title.length > 70 ? meta.title.slice(0, 70) + '...' : meta.title}
        </span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>Author: </span>
        <span style={{ fontSize: 14, color: green }}>{meta.author}</span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>Date: </span>
        <span style={{ fontSize: 14, color: green }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>Memory: </span>
        <span style={{ fontSize: 14, color: green }}>{meta.readingTime} MIN</span>
      </div>

      {meta.tags && (
        <div style={{ display: 'flex', marginBottom: '6px' }}>
          <span style={{ fontSize: 14, color: dimGreen }}>Tags: </span>
          <span style={{ fontSize: 14, color: green }}>[{meta.tags.join(', ')}]</span>
        </div>
      )}

      <div style={{ display: 'flex', marginBottom: '6px', marginTop: '4px' }}>
        <span style={{ fontSize: 14, color: dimGreen }}>
          -----------------------------------------------
        </span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>
          Excerpt: {meta.excerpt.length > 80 ? meta.excerpt.slice(0, 80) + '...' : meta.excerpt}
        </span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>Initializing reader interface... OK</span>
      </div>

      <div style={{ display: 'flex', marginBottom: '6px' }}>
        <span style={{ fontSize: 14, color: green }}>All systems operational.</span>
      </div>

      {/* Title displayed large */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 0',
        }}
      >
        <span
          style={{
            fontSize: titleSize > 56 ? 28 : 34,
            fontWeight: 900,
            color: green,
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '900px',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Press any key */}
      <div style={{ display: 'flex', marginTop: '8px' }}>
        <span style={{ fontSize: 16, color: green }}>Press any key to continue...</span>
        {/* Blinking cursor (solid block) */}
        <div
          style={{
            display: 'flex',
            width: '10px',
            height: '18px',
            backgroundColor: green,
            marginLeft: '4px',
            marginTop: '1px',
          }}
        />
      </div>
    </div>,
    size,
  );
}
