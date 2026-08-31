'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { track } from '@/lib/analytics';
import { matchesSearch } from '@/lib/search-match';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    placeholder: 'Select items...',
    searchPlaceholder: 'Search...',
    searchAriaLabel: 'Search options',
    noResultsLabel: 'No results',
    clearSearchLabel: 'Clear search',
    selectedSuffix: ' selected',
    minimumPrefix: 'Minimum: ',
    removePrefix: 'Remove ',
    clearAllSelections: 'Clear all selections',
  },
  zh: {
    placeholder: '选择项目...',
    searchPlaceholder: '搜索...',
    searchAriaLabel: '搜索选项',
    noResultsLabel: '没有结果',
    clearSearchLabel: '清除搜索',
    selectedSuffix: ' 项已选择',
    minimumPrefix: '最少：',
    removePrefix: '移除 ',
    clearAllSelections: '清除所有选择',
  },
} as const;

interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional leading visual (e.g. a brand logo) rendered before the label. */
  icon?: React.ReactNode;
  /** Optional trailing visual (e.g. a NEW pill) rendered after the label. */
  badge?: React.ReactNode;
}

export interface MultiSelectSection {
  /** Stable key for React list rendering */
  id: string;
  /** Section header (plain text or small composite UI) */
  header?: React.ReactNode;
  options: MultiSelectOption[];
}

interface MultiSelectProps {
  options?: MultiSelectOption[];
  sections?: MultiSelectSection[];
  value?: string[];
  onChange?: (value: string[]) => void;
  triggerId?: string;
  triggerTestId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  size?: 'sm' | 'default';
  className?: string;
  disabled?: boolean;
  maxSelections?: number; // Maximum number of items that can be selected
  minSelections?: number; // Minimum number of items that must be selected
  showClearAll?: boolean;
  searchable?: boolean;
  plainSelectedText?: boolean;
  showSelectionSummary?: boolean;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  noResultsLabel?: string;
  clearSearchLabel?: string;
  selectedSuffix?: string;
  minimumPrefix?: string;
}

function MultiSelect({
  options,
  sections,
  value = [],
  onChange,
  triggerId,
  triggerTestId,
  open,
  onOpenChange,
  placeholder,
  size = 'default',
  className,
  disabled = false,
  maxSelections,
  minSelections,
  showClearAll = true,
  searchable = true,
  plainSelectedText = false,
  showSelectionSummary = true,
  searchPlaceholder,
  searchAriaLabel,
  noResultsLabel,
  clearSearchLabel,
  selectedSuffix,
  minimumPrefix,
}: MultiSelectProps) {
  const t = STRINGS[useLocale()];
  const resolvedPlaceholder = placeholder ?? t.placeholder;
  const resolvedSearchPlaceholder = searchPlaceholder ?? t.searchPlaceholder;
  const resolvedSearchAriaLabel = searchAriaLabel ?? t.searchAriaLabel;
  const resolvedNoResultsLabel = noResultsLabel ?? t.noResultsLabel;
  const resolvedClearSearchLabel = clearSearchLabel ?? t.clearSearchLabel;
  const resolvedSelectedSuffix = selectedSuffix ?? t.selectedSuffix;
  const resolvedMinimumPrefix = minimumPrefix ?? t.minimumPrefix;
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const listboxId = React.useId();
  const searchStateRef = React.useRef(search);
  searchStateRef.current = search;
  const searchableRef = React.useRef(searchable);
  searchableRef.current = searchable;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const searchUsedRef = React.useRef(false);
  const isControlledOpen = open !== undefined;
  const isOpen = isControlledOpen ? open : internalIsOpen;
  const setIsOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isOpen) {
        if (searchUsedRef.current) {
          track('multi_select_searched', { query: searchStateRef.current });
          searchUsedRef.current = false;
        }
        setSearch('');
      }
      if (!isControlledOpen) {
        setInternalIsOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlledOpen, isOpen, onOpenChange],
  );

  const isMaxReached = maxSelections !== undefined && value.length >= maxSelections;
  const isMinReached = minSelections !== undefined && value.length <= minSelections;

  React.useEffect(() => {
    const handlePointerDownOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleFocusOutside = (event: FocusEvent) => {
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
      // Capture-phase pointerdown closes this menu before other dropdown triggers
      // process the same interaction, enabling smooth one-click handoff.
      document.addEventListener('pointerdown', handlePointerDownOutside, true);
      document.addEventListener('focusin', handleFocusOutside);
      document.addEventListener('keydown', handleKeyDown);
      if (searchableRef.current) {
        searchRef.current?.focus();
      } else {
        contentRef.current?.focus();
      }
    }

    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
      document.removeEventListener('focusin', handleFocusOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setIsOpen]);

  const flatOptions = React.useMemo(() => {
    if (sections?.length) {
      return sections.flatMap((s) => s.options);
    }
    return options ?? [];
  }, [options, sections]);

  const filteredSections = React.useMemo(() => {
    if (!sections?.length) return null;
    // Punctuation-insensitive token matching so "B300 vllm" finds "B300 (vLLM)" (#406).
    const filterOpts = (opts: MultiSelectOption[]) =>
      search ? opts.filter((opt) => matchesSearch(search, opt.label)) : opts;

    return sections.map((section) => ({
      ...section,
      options: filterOpts(section.options),
    }));
  }, [sections, search]);

  const filteredOptions = React.useMemo(() => {
    if (filteredSections) {
      return filteredSections.flatMap((s) => s.options);
    }
    const opts = flatOptions;
    if (!search) return opts;
    return opts.filter((opt) => matchesSearch(search, opt.label));
  }, [filteredSections, flatOptions, search]);

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
      // Single-select mode should replace the previous value in one click.
      if (maxSelections === 1) {
        const newValue = [optionValue];
        track('multi_select_selected', { value: optionValue });
        onChange?.(newValue);
        setIsOpen(false);
        return;
      }
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
  const selectedOptions = value.map(
    (val) => flatOptions.find((opt) => opt.value === val) ?? { value: val, label: val },
  );
  const selectedLabels = selectedOptions.map((opt) => opt.label);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={triggerId}
        data-testid={triggerTestId}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
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
        <div className="flex gap-1 flex-1 min-w-0 items-center min-h-5 flex-wrap">
          {value.length > 0 ? (
            plainSelectedText ? (
              <span className="text-foreground flex min-w-0 items-center gap-1.5">
                {selectedOptions.length === 1 && selectedOptions[0].icon}
                <span className="block min-w-0 truncate">{selectedLabels.join(', ')}</span>
              </span>
            ) : (
              selectedLabels.map((label, index) => (
                <span
                  key={value[index]}
                  className="bg-transparent text-foreground border border-border dark:bg-[#0a6ca8] dark:border-border inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors shrink-0"
                >
                  {selectedOptions[index]?.icon}
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
                    aria-label={`${t.removePrefix}${label}`}
                    aria-disabled={disabled || isMinReached}
                  >
                    <XIcon className="size-4 text-foreground" />
                  </span>
                </span>
              ))
            )
          ) : (
            <span className="text-muted-foreground">{resolvedPlaceholder}</span>
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
            aria-label={t.clearAllSelections}
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
          ref={contentRef}
          id={listboxId}
          tabIndex={-1}
          data-slot="select-content"
          className={cn(
            'bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 absolute z-[120] mt-1 max-h-60 w-full origin-top overflow-hidden rounded-md border shadow-md',
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
                  placeholder={resolvedSearchPlaceholder}
                  aria-label={resolvedSearchAriaLabel}
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
                    aria-label={resolvedClearSearchLabel}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
            )}
            {showSelectionSummary &&
              (maxSelections !== undefined || minSelections !== undefined) && (
                <div className="text-muted-foreground px-2 py-1.5 text-xs border-b mb-1">
                  {value.length}
                  {maxSelections !== undefined && ` / ${maxSelections}`}
                  {resolvedSelectedSuffix}
                  {minSelections !== undefined && minSelections > 0 && (
                    <span className="block text-xs mt-0.5">
                      {resolvedMinimumPrefix}
                      {minSelections}
                    </span>
                  )}
                </div>
              )}
            {filteredOptions.length === 0 && (
              <div className="text-muted-foreground px-2 py-1.5 text-sm text-center">
                {resolvedNoResultsLabel}
              </div>
            )}
            {filteredSections
              ? filteredSections.map((section) => {
                  if (section.options.length === 0) return null;
                  return (
                    <div key={section.id} className="space-y-0.5">
                      {section.header && (
                        <div className="text-muted-foreground px-2 py-1.5 text-xs font-medium">
                          {section.header}
                        </div>
                      )}
                      {section.options.map((option) => {
                        const isSelected = value.includes(option.value);
                        const isDisabledOption = !isSelected && isMaxReached && maxSelections !== 1;

                        return (
                          <div
                            key={option.value}
                            role="option"
                            aria-selected={isSelected}
                            data-slot="select-item"
                            onClick={() => !isDisabledOption && handleToggle(option.value)}
                            className={cn(
                              "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none transition-all duration-150 ease-in-out",
                              'hover:bg-primary/20 hover:pl-3 hover:shadow-sm',
                              isSelected && 'bg-primary/10 font-medium',
                              isDisabledOption &&
                                'opacity-50 cursor-not-allowed hover:bg-transparent hover:pl-2 hover:shadow-none',
                            )}
                          >
                            <span className="absolute right-2 flex size-3.5 items-center justify-center">
                              {isSelected && <CheckIcon className="size-4 text-primary" />}
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              {option.icon}
                              {option.label}
                              {option.badge}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              : filteredOptions.map((option) => {
                  const isSelected = value.includes(option.value);
                  const isDisabledOption = !isSelected && isMaxReached && maxSelections !== 1;

                  return (
                    <div
                      key={option.value}
                      role="option"
                      aria-selected={isSelected}
                      data-slot="select-item"
                      onClick={() => !isDisabledOption && handleToggle(option.value)}
                      className={cn(
                        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none transition-all duration-150 ease-in-out",
                        'hover:bg-primary/20 hover:pl-3 hover:shadow-sm',
                        isSelected && 'bg-primary/10 font-medium',
                        isDisabledOption &&
                          'opacity-50 cursor-not-allowed hover:bg-transparent hover:pl-2 hover:shadow-none',
                      )}
                    >
                      <span className="absolute right-2 flex size-3.5 items-center justify-center">
                        {isSelected && <CheckIcon className="size-4 text-primary" />}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        {option.icon}
                        {option.label}
                        {option.badge}
                      </span>
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
