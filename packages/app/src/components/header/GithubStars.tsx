'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

import { STARRED_EVENT, STARRED_KEY, saveStarred } from '@/lib/star-storage';

interface GitHubStarsProps {
  owner: string;
  repo: string;
  starCount?: number | null;
}

export function GitHubStars({ owner, repo, starCount }: GitHubStarsProps) {
  const stars = starCount ?? null;
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
    <Link
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="header-star-button"
      onClick={() => {
        saveStarred();
        setHasStarred(true);
      }}
      className={`${hasStarred ? '' : 'star-button-glow '}flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-primary/50 dark:hover:border-primary/50 transition-colors`}
    >
      {/* Star Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="#eab308"
        stroke="#eab308"
        className="w-4 h-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
        />
      </svg>
      <span className="text-sm font-medium">Star</span>
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 self-center min-w-[2ch]">
        {stars !== null ? stars.toLocaleString() : '\u00A0'}
      </span>
    </Link>
  );
}
