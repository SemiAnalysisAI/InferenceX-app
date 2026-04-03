'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';

import { FOOTER_RELIABILITY_LINK } from './footer-links';

const linkClassName = 'text-sm text-muted-foreground hover:text-foreground transition-colors';

function FooterReliabilityLink() {
  return (
    <Link
      data-testid={FOOTER_RELIABILITY_LINK.testId}
      href={FOOTER_RELIABILITY_LINK.href}
      className={linkClassName}
      onClick={() => track(FOOTER_RELIABILITY_LINK.event)}
    >
      {FOOTER_RELIABILITY_LINK.label}
    </Link>
  );
}

export { FooterReliabilityLink };
