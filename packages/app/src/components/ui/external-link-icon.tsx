import { ExternalLink } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

type ExternalLinkIconProps = React.ComponentPropsWithoutRef<typeof ExternalLink>;

const ExternalLinkIcon = React.forwardRef<SVGSVGElement, ExternalLinkIconProps>(
  ({ className, style, ...props }, ref) => (
    <ExternalLink
      ref={ref}
      className={cn(
        'inline h-[0.85em] w-[0.85em] ml-1 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity',
        className,
      )}
      style={{ verticalAlign: '-0.125em', ...style }}
      {...props}
    />
  ),
);
ExternalLinkIcon.displayName = 'ExternalLinkIcon';

export { ExternalLinkIcon };
