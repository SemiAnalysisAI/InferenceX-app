'use client';

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
        className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
        onClick={() => track('blog_back_clicked')}
      >
        &larr;&nbsp;&nbsp;{label}
      </Link>
    </nav>
  );
}
