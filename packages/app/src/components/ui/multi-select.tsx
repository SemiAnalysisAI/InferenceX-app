'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  size?: 'sm' | 'default';
  className?: string;
  disabled?: boolean;
  maxSelections?: number; // Maximum number of items that can be selected
  minSelections?: number; // Minimum number of items that must be selected
  showClearAll?: boolean;
  searchable?: boolean;
}

function MultiSelect({
  options,
  value = [],
  onChange,
  placeholder = 'Select items...',
  size = 'default',
  className,
  disabled = false,
  maxSelections,
  minSelections,
  showClearAll = true,
  searchable = true,
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const isMaxReached = maxSelections !== undefined && value.length >= maxSelections;
  const isMinReached = minSelections !== undefined && value.length <= minSelections;

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      searchRef.current?.focus();
    } else {
      // Track search usage when dropdown closes
      if (searchUsedRef.current) {
        track('multi_select_searched', { query: search });
        searchUsedRef.current = false;
      }
      setSearch('');
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = React.useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((opt) => opt.label.toLowerCase().includes(lower));
  }, [options, search]);

  const handleToggle = (optionValue: string) => {
    if (disabled) {
      return;
    }

    const isSelected = value.includes(optionValue);

    if (isSelected) {
      if (minSelections !== undefined && value.length <= minSelections) {
        return;
      }
      const newValue = value.filter((v) => v !== optionValue);
      track('multi_select_deselected', { value: optionValue });
      onChange?.(newValue);
      setIsOpen(false);
      return;
    }

    if (maxSelections !== undefined && value.length >= maxSelections) {
      return;
    }

    const newValue = [...value, optionValue];
    track('multi_select_selected', { value: optionValue });
    onChange?.(newValue);
    setIsOpen(false);
  };

  const handleRemove = (optionValue: string, e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (disabled) {
      return;
    }

    if (minSelections !== undefined && value.length <= minSelections) {
      return;
    }

    track('multi_select_removed', { value: optionValue });
    const newValue = value.filter((v) => v !== optionValue);
    onChange?.(newValue);
  };

  const searchUsedRef = React.useRef(false);

  const handleClearAll = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (disabled) {
      return;
    }
    if (minSelections !== undefined && minSelections > 0) {
      return;
    }
    track('multi_select_cleared');
    onChange?.([]);
  };

  // Preserve the order of selected values, not the order of options
  const selectedLabels = value.map((val) => {
    const option = options.find((opt) => opt.value === val);
    return option ? option.label : val;
  });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        data-slot="select-trigger"
        data-size={size}
        className={cn(
          "border-input data-placeholder:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/90 dark:hover:bg-input/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:min-h-9 data-[size=sm]:min-h-8",
          selectedLabels.length > 0 ? 'py-1' : 'py-2',
          className,
        )}
      >
        <div className="flex gap-1 flex-1 items-center min-h-5 flex-wrap">
          {value.length > 0 ? (
            selectedLabels.map((label, index) => (
              <span
                key={value[index]}
                className="bg-transparent text-foreground border border-border dark:bg-[#0a6ca8] dark:border-border inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors shrink-0"
              >
                {label}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => handleRemove(value[index], e)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRemove(value[index], e);
                    }
                  }}
                  className={cn(
                    'hover:bg-primary/20 rounded-sm cursor-pointer transition-colors',
                    (disabled || isMinReached) && 'hidden',
                  )}
                  aria-label={`Remove ${label}`}
                  aria-disabled={disabled || isMinReached}
                >
                  <XIcon className="size-4 text-foreground" />
                </span>
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        {value.length > 0 && showClearAll && (
          <span
            role="button"
            tabIndex={0}
            onClick={handleClearAll}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClearAll(e);
              }
            }}
            className={cn(
              'hover:bg-destructive/10 hover:text-destructive text-muted-foreground shrink-0 rounded-sm p-1 transition-colors',
              (disabled || (minSelections !== undefined && minSelections > 0)) &&
                'cursor-not-allowed opacity-50 pointer-events-none',
            )}
            aria-label="Clear all selections"
            aria-disabled={disabled || (minSelections !== undefined && minSelections > 0)}
          >
            <XIcon className="size-4" />
          </span>
        )}
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
          className={cn(
            'bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 absolute z-50 mt-1 max-h-60 w-full origin-top overflow-hidden rounded-md border shadow-md',
          )}
        >
          <div className="p-1 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
            {searchable && (
              <div className="flex items-center gap-1.5 px-2 pb-1 border-b mb-1">
                <SearchIcon className="size-3.5 shrink-0 text-muted-foreground mr-2" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value) searchUsedRef.current = true;
                  }}
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
            {(maxSelections !== undefined || minSelections !== undefined) && (
              <div className="text-muted-foreground px-2 py-1.5 text-xs border-b mb-1">
                {value.length}
                {maxSelections !== undefined && ` / ${maxSelections}`} selected
                {minSelections !== undefined && minSelections > 0 && (
                  <span className="block text-xs mt-0.5">Minimum: {minSelections}</span>
                )}
              </div>
            )}
            {filteredOptions.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-sm text-center">
                No results
              </div>
            )}
            {filteredOptions.map((option) => {
              const isSelected = value.includes(option.value);
              const isDisabledOption = !isSelected && isMaxReached;
              const isDisabledDeselect = isSelected && isMinReached;

              return (
                <div
                  key={option.value}
                  data-slot="select-item"
                  onClick={() =>
                    !isDisabledOption && !isDisabledDeselect && handleToggle(option.value)
                  }
                  className={cn(
                    "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none transition-all duration-150 ease-in-out",
                    'hover:bg-primary/20 hover:pl-3 hover:shadow-sm',
                    isSelected && 'bg-primary/10 font-medium',
                    (isDisabledOption || isDisabledDeselect) &&
                      'opacity-50 cursor-not-allowed hover:bg-transparent hover:pl-2 hover:shadow-none',
                  )}
                >
                  <span className="absolute right-2 flex size-3.5 items-center justify-center">
                    {isSelected && <CheckIcon className="size-4 text-primary" />}
                  </span>
                  <span className="flex items-center gap-2">{option.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export { MultiSelect };
export type { MultiSelectOption, MultiSelectProps };
