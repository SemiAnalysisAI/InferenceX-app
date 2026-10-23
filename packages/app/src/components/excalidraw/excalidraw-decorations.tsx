'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  bannerRect,
  bannerUnderline,
  docArrow,
  docArrowHead,
  docDiamond,
  docEllipse,
  docRect,
  type SketchPath,
} from './sketch-shapes';

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
      <svg className="excalidraw-doodle excalidraw-doodle-rect" viewBox="0 0 140 80">
        <Sketch paths={docRect} />
      </svg>
      <svg className="excalidraw-doodle excalidraw-doodle-arrow" viewBox="0 0 140 80">
        <Sketch paths={docArrow} />
        <Sketch paths={docArrowHead} />
      </svg>
      <svg className="excalidraw-doodle excalidraw-doodle-ellipse" viewBox="0 0 140 92">
        <Sketch paths={docEllipse} />
      </svg>
      <svg className="excalidraw-doodle excalidraw-doodle-diamond" viewBox="0 0 120 104">
        <Sketch paths={docDiamond} />
      </svg>
    </div>
  );
}
