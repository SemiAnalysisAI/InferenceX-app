/**
 * V162: Nutrition Label — Classic FDA nutrition facts layout with thick rules, serving info, and ingredients.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Nutrition label container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '700px',
          border: '2px solid #000000',
          padding: '12px 16px',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Blog Facts header */}
        <div style={{ display: 'flex', marginBottom: '2px' }}>
          <span
            style={{ fontSize: 42, fontWeight: 900, color: '#000000', fontFamily: 'sans-serif' }}
          >
            Blog Facts
          </span>
        </div>

        {/* Thick rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '8px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Serving size */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#000000' }}>
            Serving Size 1 Article ({meta.readingTime} min)
          </span>
        </div>
        <div style={{ display: 'flex', width: '100%', marginBottom: '2px' }}>
          <span style={{ fontSize: 14, color: '#000000' }}>Servings Per Blog: Many</span>
        </div>

        {/* Medium thick rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '5px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Amount per serving */}
        <div style={{ display: 'flex', width: '100%', marginBottom: '2px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#000000' }}>
            Amount Per Serving
          </span>
        </div>

        {/* Thin rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Calories */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 900, color: '#000000' }}>
            Calories from Insight
          </span>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#000000' }}>100%</span>
        </div>

        {/* Medium rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '3px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* % Daily Value header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#000000' }}>% Daily Value*</span>
        </div>

        {/* Thin rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Knowledge */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>Knowledge </span>
            <span style={{ fontSize: 13, color: '#000000' }}>{meta.readingTime}min</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>100%</span>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Author */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>Author </span>
            <span style={{ fontSize: 13, color: '#000000' }}>{meta.author}</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Date */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>Published </span>
            <span style={{ fontSize: 13, color: '#000000' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Reading Enjoyment */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: '2px',
          }}
        >
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>
              Reading Enjoyment{' '}
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#000000' }}>99%</span>
        </div>

        {/* Thick rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '5px',
            backgroundColor: '#000000',
            marginTop: '4px',
            marginBottom: '6px',
          }}
        />

        {/* Ingredients */}
        <div
          style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: '4px' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#000000' }}>
              <span style={{ fontWeight: 700 }}>INGREDIENTS: </span>
              {meta.title}.{meta.tags ? ` Contains: ${meta.tags.join(', ')}.` : ''}
            </span>
          </div>
        </div>

        {/* Thin rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#000000',
            marginBottom: '4px',
          }}
        />

        {/* Footnote */}
        <div style={{ display: 'flex', width: '100%' }}>
          <span style={{ fontSize: 9, color: '#555555' }}>
            * Percent Daily Values are based on a 2,000 word reading diet. Your daily values may
            vary.
          </span>
        </div>
      </div>

      {/* Logo — outside label, bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '16px',
          right: '30px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={20} height={20} />
        <span style={{ fontSize: 10, color: '#aaaaaa', marginLeft: '6px', letterSpacing: '0.1em' }}>
          INFERENCEX
        </span>
      </div>
    </div>,
    size,
  );
}
