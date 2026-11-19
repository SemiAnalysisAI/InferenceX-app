'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useGitHubStarCount } from '@/lib/github/github-star-count';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/github/star-storage';
import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';
import { useLocale } from '@/lib/i18n/use-locale';

const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

const STAR_TITLE = { en: 'Star on GitHub', zh: '在 GitHub 上加星' } as const;

export function StarButton() {
  const locale = useLocale();
  const stars = useGitHubStarCount();
  const [hasStarred, setHasStarred] = useState(false);

  useEffect(() => {
    try {
      setHasStarred(Boolean(localStorage.getItem(STARRED_KEY)));
    } catch {}

    const handleStarred = () => setHasStarred(true);
    window.addEventListener(STARRED_EVENT, handleStarred);
    return () => window.removeEventListener(STARRED_EVENT, handleStarred);
  }, []);

  return (
    <Button
      variant="outline"
      size="xs"
      className={hasStarred ? undefined : 'star-button-glow'}
      title={STAR_TITLE[locale]}
      data-testid="footer-star-cta"
      onClick={(event) => {
        saveStarred();
        setHasStarred(true);
        track('footer_star_starred', { placement: placementFor(event.currentTarget) });
        window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
      }}
    >
      <Star className="size-3.5 fill-yellow-500 text-yellow-500" />
      <span>Star</span>
      {stars !== null && (
        <span className="font-semibold tabular-nums text-muted-foreground">
          {stars.toLocaleString()}
        </span>
      )}
    </Button>
  );
}
