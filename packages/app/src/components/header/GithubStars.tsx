'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';

import { useGitHubStarCount } from '@/lib/github/github-star-count';
import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/github/star-storage';
import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';

interface GitHubStarsProps {
  owner: string;
  repo: string;
}

export function GitHubStars({ owner, repo }: GitHubStarsProps) {
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
    <Link
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="header-star-button"
      onClick={(event) => {
        saveStarred();
        setHasStarred(true);
        track('header_star_starred', { placement: placementFor(event.currentTarget) });
      }}
      className={`${hasStarred ? '' : 'star-button-glow hover:border-primary/50 '}flex h-8 items-center gap-1.5 rounded-md border border-border/40 px-3 leading-none text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground`}
    >
      <Star aria-hidden className="size-4 fill-yellow-500 text-yellow-500" />
      <span className="text-sm font-medium text-foreground">Star</span>
      <span className="min-w-[5ch] self-center text-xs tabular-nums">
        {stars === null ? '\u00A0' : stars.toLocaleString()}
      </span>
    </Link>
  );
}
