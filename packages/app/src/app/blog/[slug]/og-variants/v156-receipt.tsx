/**
 * V156: Receipt — Thermal till slip with dashed separators, item-style title, and total line.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const dashes = '- - - - - - - - - - - - - - - - - - - - - - - - - - -';

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#f5f0e8',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'monospace',
        color: '#2a2a2a',
      }}
    >
      {/* Receipt slip */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '600px',
          padding: '40px 50px',
          alignItems: 'center',
        }}
      >
        {/* Store name */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '4px',
          }}
        >
          <img src={logoSrc} width={28} height={28} />
        </div>
        <div style={{ display: 'flex', marginBottom: '4px' }}>
          <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '0.15em' }}>
            INFERENCEX BLOG
          </span>
        </div>
        <div style={{ display: 'flex', marginBottom: '4px' }}>
          <span style={{ fontSize: 12, color: '#666666', letterSpacing: '0.08em' }}>
            www.inferencex.com
          </span>
        </div>

        {/* Dashes */}
        <div style={{ display: 'flex', marginBottom: '12px', marginTop: '8px' }}>
          <span style={{ fontSize: 12, color: '#999999', letterSpacing: '0.05em' }}>{dashes}</span>
        </div>

        {/* Date & receipt number */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: 13, color: '#555555' }}>
            DATE:{' '}
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ fontSize: 13, color: '#555555' }}>#00{meta.readingTime}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '8px',
          }}
        >
          <span style={{ fontSize: 13, color: '#555555' }}>
            CASHIER: {meta.author.toUpperCase()}
          </span>
        </div>

        {/* Dashes */}
        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span style={{ fontSize: 12, color: '#999999', letterSpacing: '0.05em' }}>{dashes}</span>
        </div>

        {/* Item: Title */}
        <div
          style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '8px' }}
        >
          <div style={{ display: 'flex', width: '100%' }}>
            <span style={{ fontSize: titleSize > 56 ? 18 : 20, fontWeight: 700, lineHeight: 1.3 }}>
              {meta.title.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Qty line */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: 14, color: '#444444' }}>QTY: {meta.readingTime} MIN</span>
          <span style={{ fontSize: 14, color: '#444444' }}>$0.00</span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', width: '100%', marginBottom: '4px' }}>
            <span style={{ fontSize: 12, color: '#777777' }}>
              TAGS: {meta.tags.join(', ').toUpperCase()}
            </span>
          </div>
        )}

        {/* Dashes */}
        <div style={{ display: 'flex', marginTop: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: 12, color: '#999999', letterSpacing: '0.05em' }}>{dashes}</span>
        </div>

        {/* Total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700 }}>TOTAL</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>1 ARTICLE</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: 12, color: '#666666' }}>TAX</span>
          <span style={{ fontSize: 12, color: '#666666' }}>$0.00</span>
        </div>

        {/* Dashes */}
        <div style={{ display: 'flex', marginTop: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: 12, color: '#999999', letterSpacing: '0.05em' }}>{dashes}</span>
        </div>

        {/* Thank you */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span
            style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.12em', marginBottom: '4px' }}
          >
            THANK YOU FOR READING
          </span>
          <span style={{ fontSize: 11, color: '#888888' }}>PLEASE COME AGAIN</span>
        </div>
      </div>
    </div>,
    size,
  );
}
