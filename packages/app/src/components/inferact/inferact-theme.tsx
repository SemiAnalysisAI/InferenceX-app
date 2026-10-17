'use client';

import { usePathname } from 'next/navigation';
import type { CSSProperties } from 'react';
import { useLocale } from '@/lib/i18n/use-locale';
import { useDecorationMotion } from '../effects/use-decoration-motion';
import './inferact-theme.css';

const STRINGS = {
  en: {
    eyebrow: 'Open-source continuous benchmarking',
    title: 'Inference you can measure.',
    terminal: 'PUBLIC RECIPES / REAL HARDWARE',
    diagram:
      'prefill → decode\n\nlatency\nthroughput\nconcurrency\n\nmodels × hardware\n\nopen benchmark recipes',
  },
  zh: {
    eyebrow: '开源持续基准测试',
    title: '让推理性能可测量。',
    terminal: '公开测试配置 / 真实硬件',
    diagram: 'prefill → decode\n\n延迟\n吞吐量\n并发数\n\n模型 × 硬件\n\n公开的基准测试配置',
  },
};

export default function InferactTheme() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = STRINGS[locale];
  const motion = useDecorationMotion();
  const landing = pathname === '/' || pathname === '/zh';
  return (
    <div
      className={`inferact-theme-banner ${landing ? 'is-landing' : 'is-compact'}`}
      data-testid="inferact-theme-banner"
      ref={motion}
      data-motion="paused"
    >
      <div className="inferact-title-block">
        <p className="inferact-eyebrow">{t.eyebrow}</p>
        <p className="inferact-display">
          <span>{landing ? t.title : 'InferenceX'}</span>
        </p>
      </div>
      {landing && (
        <div className="inferact-collage" aria-hidden="true">
          <div className="inferact-blueprint">
            <div className="inferact-rack-field">
              {Array.from({ length: 7 }, (_, rack) => (
                <div
                  className="inferact-rack"
                  key={rack}
                  style={{ '--rack': rack } as CSSProperties}
                >
                  {Array.from({ length: 12 }, (_slot, slot) => (
                    <i key={slot} />
                  ))}
                </div>
              ))}
            </div>
            <div className="inferact-grain" />
          </div>
          <div className="inferact-code-panel">
            <span>{t.terminal}</span>
            <pre>{t.diagram}</pre>
            <div className="inferact-orbit" />
            <div className="inferact-orbit second" />
          </div>
          <div className="inferact-pixel pixel-one" />
          <div className="inferact-pixel pixel-two" />
          <span className="inferact-crosshair crosshair-one">+</span>
          <span className="inferact-crosshair crosshair-two">+</span>
        </div>
      )}
    </div>
  );
}
