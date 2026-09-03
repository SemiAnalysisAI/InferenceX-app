import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

interface MobileControlSectionProps {
  label: string;
  count: number;
  countLabel: string;
  children: ReactNode;
  testId?: string;
}

/**
 * A secondary control group that starts collapsed on phones and remains part of
 * the normal desktop layout. `md:contents` keeps the desktop grid unchanged.
 */
export function MobileControlSection({
  label,
  count,
  countLabel,
  children,
  testId,
}: MobileControlSectionProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // URL-backed settings can differ from server defaults on the first client
  // render. Only announce their changed count after hydration has completed.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const contentId = useId();
  return (
    <div className="group md:contents" data-testid={testId}>
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls={contentId}
        onClick={() => {
          setMobileOpen((open) => !open);
          track('selector_secondary_controls_toggled', { section: testId, expanded: !mobileOpen });
        }}
        className="mb-3 flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/10 px-3 text-left text-sm font-medium text-foreground md:hidden"
      >
        <span>{label}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
          {hydrated && count > 0 && (
            <span>
              {count} {countLabel}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 transition-transform', mobileOpen && 'rotate-180')}
          />
        </span>
      </button>
      <div
        id={contentId}
        className={cn('min-w-0 flex-col gap-4 md:contents', mobileOpen ? 'flex' : 'hidden')}
      >
        {children}
      </div>
    </div>
  );
}
