'use client';

import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/components/github-star-modal';
import { track } from '@/lib/analytics';
import { Star } from 'lucide-react';

import { useGitHubStars } from '@/hooks/api/use-github-stars';

const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

export function StarButton() {
  const { data } = useGitHubStars();
  const stars = data?.stars ?? null;
  const [hasStarred, setHasStarred] = useState(false);

  useEffect(() => {
    try {
      setHasStarred(!!localStorage.getItem(STARRED_KEY));
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
      onClick={() => {
        saveStarred();
        setHasStarred(true);
        track('footer_star_cta_clicked', { stars: stars ?? 0 });
        window.open(GITHUB_REPO_URL, '_blank', 'noopener,noreferrer');
      }}
    >
      <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
      <span>Star</span>
      {stars !== null && (
        <span className="font-semibold text-muted-foreground">{stars.toLocaleString()}</span>
      )}
    </Button>
  );
}
