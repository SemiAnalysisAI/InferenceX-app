'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/i18n/use-locale';

// Poster art from the SemiAnalysis Offsite 2026 slide template. Each poster carries its own
// tagline, so the crop keeps the lettered part of the photo in view.
const POSTERS = [
  { src: '/decorative/semianalysis/golden-gate.webp', position: '50% 62%' },
  { src: '/decorative/semianalysis/coit-tower.webp', position: '50% 76%' },
  { src: '/decorative/semianalysis/painted-ladies.webp', position: '50% 58%' },
  { src: '/decorative/semianalysis/fishing-boat.webp', position: '50% 70%' },
  { src: '/decorative/semianalysis/lombard-street.webp', position: '50% 92%' },
] as const;

const STRINGS = {
  en: {
    eyebrow: 'SemiAnalysis × InferenceX',
    title: 'Open benchmarks. On sight.',
    description: 'Every data point traces back to a public GitHub Actions run.',
  },
  zh: {
    eyebrow: 'SemiAnalysis × InferenceX',
    title: '开放基准测试，一目了然。',
    description: '每个数据点都可追溯到一次公开的 GitHub Actions 运行。',
  },
};

function posterFor(pathname: string) {
  let hash = 0;
  for (const char of pathname) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 1_000_003;
  return POSTERS[hash % POSTERS.length];
}

export function SemiAnalysisThemeBanner() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname() ?? '/';
  const strings = STRINGS[useLocale()];
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || resolvedTheme !== 'semianalysis') return null;

  const poster = posterFor(pathname.replace(/^\/zh(?=\/|$)/u, '') || '/');

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="semianalysis-theme-banner">
      <div className="semianalysis-banner">
        <div className="semianalysis-banner-copy">
          <p className="semianalysis-eyebrow">{strings.eyebrow}</p>
          <p className="semianalysis-banner-title">{strings.title}</p>
          <p className="semianalysis-banner-description">{strings.description}</p>
        </div>
        <img
          className="semianalysis-banner-poster"
          src={poster.src}
          style={{ objectPosition: poster.position }}
          alt=""
          aria-hidden="true"
          width={720}
          height={960}
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}
