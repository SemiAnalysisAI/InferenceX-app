'use client';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';
import { Star } from 'lucide-react';
import Link from 'next/link';

import { useGitHubStars } from '@/hooks/api/use-github-stars';

const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';

export function FooterStarButton() {
  const { data } = useGitHubStars();
  const stars = data?.stars ?? null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      asChild
      data-testid="footer-star-cta"
    >
      <Link
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track('footer_star_cta_clicked', { stars: stars ?? 0 })}
      >
        <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
        <span>Star</span>
        {stars !== null && (
          <span className="font-semibold text-muted-foreground">{stars.toLocaleString()}</span>
        )}
      </Link>
    </Button>
  );
}
