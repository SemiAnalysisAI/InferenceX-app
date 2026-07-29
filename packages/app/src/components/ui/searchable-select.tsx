'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectGroup {
  label: string;
  options: SearchableSelectOption[];
}

interface SearchableSelectProps {
  groups: SearchableSelectGroup[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerId?: string;
  triggerTestId?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  clearSearchLabel?: string;
  noResultsLabel?: string;
  /** Analytics event prefix, e.g. "yaxis_metric" → "yaxis_metric_searched" */
  trackPrefix?: string;
}

export function SearchableSelect({
  groups,
  value,
  onValueChange,
  placeholder = 'Select...',
  className,
  triggerId,
  triggerTestId,
  disabled = false,
  searchable = true,
  searchPlaceholder = 'Search...',
  searchAriaLabel = 'Search options',
  clearSearchLabel = 'Clear search',
  noResultsLabel = 'No results',
  trackPrefix,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const listboxId = React.useId();
  // Defer the trigger label until the component has mounted on the client.
  // The selected value derives from URL params / persisted state which only
  // resolve client-side, so SSR would otherwise lock in the default label and
  // leave it stale after hydration.
  const [mounted, setMounted] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const searchUsedRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      if (searchUsedRef.current && trackPrefix) {
        track(`${trackPrefix}_searched`, { query: search });
        searchUsedRef.current = false;
      }
      setSearch('');
    }
  }, [isOpen, search, trackPrefix]);

  const filteredGroups = React.useMemo(() => {
    if (!search) return groups;
    const lower = search.toLowerCase();
    return groups
      .map((g) => ({
        label: g.label,
        options: g.options.filter(
          (opt) => opt.label.toLowerCase().includes(lower) || g.label.toLowerCase().includes(lower),
        ),
      }))
      .filter((g) => g.options.length > 0);
  }, [groups, search]);

  const selectedLabel = React.useMemo(() => {
    for (const group of groups) {
      const match = group.options.find((opt) => opt.value === value);
      if (match) return match.label;
    }
    return undefined;
  }, [groups, value]);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    onValueChange(optionValue);
    setIsOpen(false);
  };
  const focusOption = (index: number) => {
    const options = listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    options?.[Math.max(0, Math.min(index, options.length - 1))]?.focus();
  };
  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, optionValue: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(optionValue);
      return;
    }
    const options = [...(listboxRef.current?.querySelectorAll('[role="option"]') ?? [])];
    const current = options.indexOf(event.currentTarget);
    const target =
      event.key === 'ArrowDown'
        ? current + 1
        : event.key === 'ArrowUp'
          ? current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : null;
    if (target !== null) {
      event.preventDefault();
      focusOption(target);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => !disabled && setIsOpen(open)}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            type="button"
            id={triggerId}
            data-testid={triggerTestId}
            data-slot="select-trigger"
            data-size="default"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            disabled={disabled}
            className={cn(
              "border-input data-placeholder:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/90 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 min-h-9",
              className,
            )}
          >
            <span
              className={cn(
                'flex-1 text-left truncate',
                (!mounted || !selectedLabel) && 'text-muted-foreground',
              )}
            >
              {mounted ? (selectedLabel ?? placeholder) : placeholder}
            </span>
            <ChevronDownIcon
              className={cn(
                'size-4 opacity-90 shrink-0 transition-transform',
                isOpen && 'transform rotate-180',
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          data-slot="select-content"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            searchRef.current?.focus();
          }}
          className="z-[100] w-[var(--radix-popover-trigger-width)] overflow-hidden p-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
        >
          {/* Search header lives outside the scrollable region so it never picks up
           * `sticky` → `position: fixed` resolution that puts it behind the page
           * header (and breaks Cypress's visibility check on the input). */}
          {searchable && (
            <div className="flex items-center gap-1.5 px-2 py-1 border-b bg-popover">
              <SearchIcon className="size-3.5 shrink-0 text-muted-foreground mr-2" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (e.target.value) searchUsedRef.current = true;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusOption(0);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusOption(Number.MAX_SAFE_INTEGER);
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchAriaLabel}
                className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={clearSearchLabel}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            className="p-1 max-h-72 overflow-y-auto custom-scrollbar"
          >
            {filteredGroups.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-sm text-center">
                {noResultsLabel}
              </div>
            )}
            {filteredGroups.map((group) => (
              <div key={group.label} className="mb-1 last:mb-0">
                <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                  {group.label}
                </div>
                {group.options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <div
                      key={option.value}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-slot="select-item"
                      data-value={option.value}
                      onClick={() => handleSelect(option.value)}
                      onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
                      className={cn(
                        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none transition-all duration-150 ease-in-out",
                        'hover:bg-primary/20 hover:pl-3 hover:shadow-sm',
                        isSelected && 'bg-primary/10 font-medium',
                      )}
                    >
                      <span className="absolute right-2 flex size-3.5 items-center justify-center">
                        {isSelected && <CheckIcon className="size-4 text-primary" />}
                      </span>
                      <span>{option.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      </div>
    </Popover>
  );
}
