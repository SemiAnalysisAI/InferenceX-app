'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { track } from '@/lib/analytics';

export function BlogBackLink({
  href = '/blog',
  label = 'Back to articles',
}: {
  href?: string;
  label?: string;
} = {}) {
  return (
    <nav>
      <Link
        href={href}
        className="inline-flex min-h-8 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => track('blog_back_clicked')}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {label}
      </Link>
    </nav>
  );
}
