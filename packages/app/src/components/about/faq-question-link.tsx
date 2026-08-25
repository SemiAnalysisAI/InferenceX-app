'use client';

import { LinkIcon } from 'lucide-react';

import { track } from '@/lib/analytics';

export function FaqQuestionLink({ id, question }: { id: string; question: string }) {
  return (
    <a
      href={`#${id}`}
      onClick={() => track('about_faq_link_clicked', { id })}
      className="group inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <span>{question}</span>
      <LinkIcon
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-brand"
      />
    </a>
  );
}
