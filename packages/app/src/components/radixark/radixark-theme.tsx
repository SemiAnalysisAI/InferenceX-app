'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/use-locale';
import { useDecorationMotion } from '../effects/use-decoration-motion';
import './radixark-theme.css';

export default function RadixArkTheme() {
  const pathname = usePathname();
  const locale = useLocale();
  const motion = useDecorationMotion();
  const landing = pathname === '/' || pathname === '/zh';
  return (
    <div
      className={`radixark-theme-banner ${landing ? 'is-landing' : 'is-compact'}`}
      data-testid="radixark-theme-banner"
      ref={motion}
      data-motion="paused"
    >
      <div className="radixark-atmosphere" aria-hidden="true">
        <div className="radixark-smoke smoke-one" />
        <div className="radixark-smoke smoke-two" />
        <div className="radixark-horizon" />
        <div className="radixark-flare" />
        <div className="radixark-dust" />
      </div>
      <div className="radixark-title-block">
        <p className="radixark-wordmark">
          Inference<span>X</span>
        </p>
        <p className="radixark-tagline">
          {locale === 'zh' ? '人人可用的 AI 基准测试' : 'BENCHMARK AI FOR ALL'}
        </p>
      </div>
    </div>
  );
}
