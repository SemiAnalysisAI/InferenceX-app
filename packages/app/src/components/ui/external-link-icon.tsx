import * as React from 'react';

import { cn } from '@/lib/utils';

interface ExternalLinkIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

const ExternalLinkIcon = React.forwardRef<SVGSVGElement, ExternalLinkIconProps>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      className={cn('ml-1 inline-block h-[1em] w-[1em]', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  ),
);
ExternalLinkIcon.displayName = 'ExternalLinkIcon';

export { ExternalLinkIcon };
