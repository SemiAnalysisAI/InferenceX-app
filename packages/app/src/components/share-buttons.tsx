'use client';

import { Button } from '@/components/ui/button';
import { track } from '@/lib/analytics';

const SITE_URL = 'https://inferencex.semianalysis.com';

const SHARE_TEXT =
  'Check out InferenceX — open-source ML inference benchmarks comparing GPUs across real-world workloads. Transparent, up-to-date data for the ML community.';

function getShareUrl(): string {
  if (typeof window === 'undefined') return SITE_URL;
  return window.location.href;
}

export function ShareTwitterButton({ text }: { text?: string }) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7"
      title="Share on X (Twitter)"
      data-testid="share-twitter"
      onClick={() => {
        const url = getShareUrl();
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(text ?? SHARE_TEXT)}&url=${encodeURIComponent(url)}`,
          '_blank',
          'noopener,noreferrer,width=600,height=400',
        );
        track('social_share_twitter');
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    </Button>
  );
}

export function ShareLinkedInButton() {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7"
      title="Share on LinkedIn"
      data-testid="share-linkedin"
      onClick={() => {
        const url = getShareUrl();
        window.open(
          `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
          '_blank',
          'noopener,noreferrer,width=600,height=600',
        );
        track('social_share_linkedin');
      }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    </Button>
  );
}
