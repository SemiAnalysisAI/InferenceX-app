'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchUsedRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Clear the search box each time the dropdown opens. Done during render (not in
  // an effect) so it doesn't trip no-adjust-state-on-prop-change. Search is left
  // intact while closed — the content is unmounted, so it's invisible — which lets
  // the close branch below read the final query for analytics.
  const [prevOpenForSearch, setPrevOpenForSearch] = React.useState(isOpen);
  if (isOpen !== prevOpenForSearch) {
    setPrevOpenForSearch(isOpen);
    if (isOpen) setSearch('');
  }

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      searchRef.current?.focus();
    } else if (searchUsedRef.current && trackPrefix) {
      track(`${trackPrefix}_searched`, { query: search });
      searchUsedRef.current = false;
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, search, trackPrefix]);

  const filteredGroups = React.useMemo(() => {
    if (!search) return groups;
    const lower = search.toLowerCase();
    return groups.flatMap((g) => {
      const options = g.options.filter(
        (opt) => opt.label.toLowerCase().includes(lower) || g.label.toLowerCase().includes(lower),
      );
      return options.length > 0 ? [{ label: g.label, options }] : [];
    });
  }, [groups, search]);

  const selectedLabel = React.useMemo(() => {
    const labelByValue = new Map<string, string>();
    for (const group of groups) {
      for (const opt of group.options) {
        if (!labelByValue.has(opt.value)) labelByValue.set(opt.value, opt.label);
      }
    }
    return labelByValue.get(value);
  }, [groups, value]);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    onValueChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
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
        onClick={() => !disabled && setIsOpen(!isOpen)}
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

      {isOpen && (
        <div
          data-slot="select-content"
          // No enter animations: tailwindcss-animate sets opacity/scale to 0 at
          // the start of the animation which makes Cypress treat the search
          // input as not visible and fail cy.type().
          className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full origin-top overflow-hidden rounded-md border shadow-md"
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
                aria-label="Search options"
                placeholder="Search..."
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
                  aria-label="Clear search"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          <div
            id={listboxId}
            role="listbox"
            className="p-1 max-h-72 overflow-y-auto custom-scrollbar"
          >
            {filteredGroups.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-sm text-center">
                No results
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
                      tabIndex={0}
                      aria-selected={isSelected}
                      data-slot="select-item"
                      data-value={option.value}
                      onClick={() => handleSelect(option.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSelect(option.value);
                        }
                      }}
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
        </div>
      )}
    </div>
  );
}
