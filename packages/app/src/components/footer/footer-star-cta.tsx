'use client';

import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useGitHubStarCount } from '@/lib/github/github-star-count';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/github/star-storage';
import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';
import { Star } from 'lucide-react';

const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

export function StarButton() {
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
      size="sm"
      className={`h-7 gap-1.5 text-xs${hasStarred ? '' : ' star-button-glow'}`}
      title="Star on GitHub"
      data-testid="footer-star-cta"
      onClick={(event) => {
        saveStarred();
        setHasStarred(true);
        track('footer_star_starred', { placement: placementFor(event.currentTarget) });
        window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
      }}
    >
      <Star className="size-3.5 text-yellow-500 fill-yellow-500" />
      <span>Star</span>
      {stars !== null && (
        <span className="font-semibold text-muted-foreground">{stars.toLocaleString()}</span>
      )}
    </Button>
  );
}
