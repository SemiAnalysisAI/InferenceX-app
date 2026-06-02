import type { ReactNode } from 'react';

export function DashboardCTA(props: { href?: string; children?: ReactNode }) {
  const href = props.href ?? 'https://inferencex.semianalysis.com';
  return (
    <div className="my-6 flex justify-center">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-0 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-brand/90"
      >
        {props.children ?? 'See full InferenceX Dashboard'}
      </a>
    </div>
  );
}
