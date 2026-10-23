'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/i18n/use-locale';
import { bannerRect, bannerUnderline, type SketchPath } from './sketch-shapes';

function Sketch({ paths }: { paths: SketchPath[] }) {
  return paths.map((path, index) => (
    <path
      key={index}
      d={path.d}
      stroke={path.stroke}
      strokeWidth={path.strokeWidth}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

export function ExcalidrawThemeBanner() {
  const { resolvedTheme } = useTheme();
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'excalidraw') return null;

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="excalidraw-theme-banner">
      <div className="excalidraw-theme-banner">
        <div className="excalidraw-banner-mark">
          <svg viewBox="0 0 240 56" aria-hidden="true" className="excalidraw-banner-frame">
            <Sketch paths={bannerRect} />
            <Sketch paths={bannerUnderline} />
          </svg>
          <p className="excalidraw-wordmark">InferenceX</p>
        </div>
        <p className="excalidraw-tagline">
          {locale === 'zh'
            ? '白板模式 · 基准测试，手绘风格'
            : 'Whiteboard mode · benchmarks, sketched by hand'}
        </p>
      </div>
    </div>
  );
}

export function ExcalidrawDecorations() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const check = () =>
      setActive(
        root.classList.contains('excalidraw') && !Object.hasOwn(root.dataset, 'inferencexEmbed'),
      );
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;

  return (
    <div className="excalidraw-scene" data-testid="excalidraw-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/excalidraw/gpu-sketch-mobile.webp" />
        <img
          className="excalidraw-scene-image"
          src="/decorative/excalidraw/gpu-sketch.webp"
          alt=""
          width={1536}
          height={1024}
          decoding="async"
          draggable={false}
        />
      </picture>
    </div>
  );
}
