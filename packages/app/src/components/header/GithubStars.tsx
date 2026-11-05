'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
      className={`${hasStarred ? '' : 'star-button-glow hover:border-primary/50 dark:hover:border-primary/50 '}flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-400 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="#eab308"
        stroke="#eab308"
        className="size-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
      <span className="text-sm font-medium">Star</span>
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 self-center min-w-[5ch] tabular-nums">
        {stars === null ? '\u00A0' : stars.toLocaleString()}
      </span>
    </Link>
  );
}
