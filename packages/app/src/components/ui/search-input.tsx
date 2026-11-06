import { Search, X } from 'lucide-react';
import type { ComponentProps } from 'react';

import { CONTROL_HEIGHT, CONTROL_SEARCH_CLEAR_STYLE } from '@/components/ui/control-styles';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/shared/utils';

export function SearchInput({
  value,
  onClear,
  clearLabel,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'type'> & {
  value: string;
  onClear: () => void;
  clearLabel: string;
}) {
  return (
    <div className={cn('relative w-full sm:w-80', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        value={value}
        className={cn(CONTROL_HEIGHT.sm, 'pl-9 pr-11 md:pr-8')}
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className={cn(CONTROL_SEARCH_CLEAR_STYLE, 'absolute right-0 top-1/2 -translate-y-1/2')}
          aria-label={clearLabel}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
