'use client';

import { track } from '@/lib/analytics';
import { Star } from 'lucide-react';
import Link from 'next/link';

import { useGitHubStars } from '@/hooks/api/use-github-stars';

const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

export function FooterStarCta() {
  const { data } = useGitHubStars();
  const stars = data?.stars ?? null;

  return (
    <div
      data-testid="footer-star-cta"
      className="flex flex-col items-center gap-3 mb-6 pb-6 border-b border-border/40"
    >
      <p className="text-sm text-muted-foreground text-center max-w-md">
        InferenceX is open source. If this data helps your work, a star on GitHub goes a long way.
      </p>
      <Link
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 hover:border-primary/50 dark:hover:border-primary/50 hover:bg-primary/5 dark:hover:bg-primary/10 transition-all"
        onClick={() => track('footer_star_cta_clicked', { stars: stars ?? 0 })}
      >
        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 group-hover:scale-110 transition-transform" />
        <span className="text-sm font-medium">Star on GitHub</span>
        {stars !== null && (
          <span className="text-xs font-semibold text-muted-foreground ml-1">
            {stars.toLocaleString()}
          </span>
        )}
      </Link>
    </div>
  );
}
