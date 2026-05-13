'use client';

import { track } from '@/lib/analytics';

// Attribution link rendered at the bottom of every embed view. Deep-links to
// the canonical /inference URL with the equivalent internal params so the
// partner site's audience can click through to the full dashboard.
export function EmbedAttribution({ canonicalHref }: { canonicalHref: string }) {
  return (
    <a
      data-testid="embed-attribution"
      href={canonicalHref}
      target="_blank"
      rel="noopener"
      onClick={() => track('embed_attribution_clicked', { href: canonicalHref })}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
    >
      SemiAnalysis InferenceX
      <span aria-hidden>→</span>
    </a>
  );
}
