'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OptionInfo, SelectedOptionInfo } from '@/components/ui/option-info';
import { track } from '@/lib/analytics';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import {
  CONTROL_HEIGHT,
  CONTROL_FOCUS,
  CONTROL_OPTION_STYLE,
  SELECT_TRIGGER_STYLE,
  CONTROL_SEARCH_STYLE,
  CONTROL_SEARCH_CLEAR_STYLE,
} from './control-styles';

const STRINGS = {
  en: {
    placeholder: 'Select...',
    searchPlaceholder: 'Search...',
    searchAriaLabel: 'Search options',
    clearSearchLabel: 'Clear search',
    noResultsLabel: 'No results',
  },
  zh: {
    placeholder: '请选择...',
    searchPlaceholder: '搜索...',
    searchAriaLabel: '搜索选项',
    clearSearchLabel: '清除搜索',
    noResultsLabel: '没有结果',
  },
} as const;

export interface SearchableSelectOption {
  value: string;
  label: string;
  help?: React.ReactNode;
  testId?: string;
}

export interface SearchableSelectGroup {
  label: string;
  heading?: React.ReactNode;
  options: SearchableSelectOption[];
}

interface SearchableSelectProps {
  groups: SearchableSelectGroup[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Hydration-safe label for selectors with a known server-side default. */
  initialLabel?: string;
  className?: string;
  triggerId?: string;
  triggerTestId?: string;
  size?: 'sm' | 'default';
  disabled?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  placeholder: placeholderProp,
  initialLabel,
  className,
  triggerId,
  triggerTestId,
  size = 'default',
  disabled = false,
  open,
  onOpenChange,
  searchable = true,
  searchPlaceholder: searchPlaceholderProp,
  searchAriaLabel: searchAriaLabelProp,
  clearSearchLabel: clearSearchLabelProp,
  noResultsLabel: noResultsLabelProp,
  trackPrefix,
}: SearchableSelectProps) {
  const t = STRINGS[useLocale()];
  const placeholder = placeholderProp ?? t.placeholder;
  const searchPlaceholder = searchPlaceholderProp ?? t.searchPlaceholder;
  const searchAriaLabel = searchAriaLabelProp ?? t.searchAriaLabel;
  const clearSearchLabel = clearSearchLabelProp ?? t.clearSearchLabel;
  const noResultsLabel = noResultsLabelProp ?? t.noResultsLabel;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isOpen = !disabled && (open ?? internalOpen);
  const [search, setSearch] = React.useState('');
  const listboxId = React.useId();
  // Defer the trigger label until the component has mounted on the client.
  // The selected value derives from URL params / persisted state which only
  // resolve client-side, so SSR would otherwise lock in the default label and
  // leave it stale after hydration.
  const [mounted, setMounted] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listboxRef = React.useRef<HTMLDivElement>(null);
  const searchUsedRef = React.useRef(false);
  const escapeDismissedRef = React.useRef(false);
  const tabFocusRef = React.useRef<HTMLElement | null>(null);
  // A grid gives option selection and help their own cells/buttons. A listbox
  // option cannot contain another interactive action accessibly.
  const hasOptionHelp = groups.some((group) => group.options.some((option) => option.help));

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled) return;
    if (nextOpen) escapeDismissedRef.current = false;
    if (!nextOpen && isOpen) {
      if (searchUsedRef.current && trackPrefix) {
        track(`${trackPrefix}_searched`, { query: search });
        searchUsedRef.current = false;
      }
      setSearch('');
    }
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const filteredGroups = React.useMemo(() => {
    if (!search) return groups;
    const lower = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
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
  const triggerLabel = mounted ? (selectedLabel ?? placeholder) : (initialLabel ?? placeholder);
  const selectedOption = groups
    .flatMap((group) => group.options)
    .find((option) => (mounted ? option.value === value : option.label === initialLabel));
  const selectedHelp = selectedOption?.help;

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    onValueChange(optionValue);
    handleOpenChange(false);
  };
  const focusOption = (index: number) => {
    const options = listboxRef.current?.querySelectorAll<HTMLElement>('[data-select-option]');
    options?.[Math.max(0, Math.min(index, options.length - 1))]?.focus();
  };
  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLElement>, optionValue: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(optionValue);
      return;
    }
    if (event.key === 'ArrowRight') {
      const help = event.currentTarget
        .closest('[role="row"]')
        ?.querySelector<HTMLElement>('[data-option-help]');
      if (help) {
        event.preventDefault();
        help.focus();
      }
      return;
    }
    const options = [...(listboxRef.current?.querySelectorAll('[data-select-option]') ?? [])];
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
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            id={triggerId}
            data-testid={triggerTestId}
            data-slot="select-trigger"
            data-size={size}
            data-value={value}
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup={hasOptionHelp ? 'grid' : 'listbox'}
            aria-controls={listboxId}
            aria-label={
              hasOptionHelp
                ? triggerLabel === placeholder
                  ? placeholder
                  : `${placeholder}: ${triggerLabel}`
                : undefined
            }
            disabled={disabled}
            className={cn(
              SELECT_TRIGGER_STYLE,
              CONTROL_HEIGHT[size],
              CONTROL_FOCUS,
              'w-full',
              className,
            )}
          >
            <span
              className={cn(
                'flex-1 text-left truncate',
                selectedHelp && 'mr-7',
                (mounted ? !selectedLabel : !initialLabel) && 'text-muted-foreground',
              )}
              title={triggerLabel}
            >
              {triggerLabel}
            </span>
            <ChevronDownIcon
              className={cn(
                'size-4 opacity-90 shrink-0 transition-transform',
                isOpen && 'transform rotate-180',
              )}
            />
          </button>
        </PopoverTrigger>
        {selectedHelp && selectedOption && !isOpen && (
          <div className="pointer-events-none absolute inset-y-0 left-3 right-9 flex items-center">
            {/* Mirror the label's width so help follows short labels and stays
                inside long ones. This copy is only a layout spacer; the real
                label and native select button above own the accessible name. */}
            <span aria-hidden="true" className="invisible min-w-0 truncate text-sm">
              {triggerLabel}
            </span>
            <SelectedOptionInfo
              key={selectedOption.value}
              label={selectedOption.label}
              value={selectedOption.value}
            >
              {selectedHelp}
            </SelectedOptionInfo>
          </div>
        )}
        <PopoverContent
          data-slot="select-content"
          align="start"
          sideOffset={4}
          onKeyDown={(event) => {
            // Grid navigation uses arrows; Tab leaves the field instead of
            // walking every option/help action or looping in Radix's scope.
            // A nested help dialog retains its own keyboard behavior.
            if (
              hasOptionHelp &&
              event.key === 'Tab' &&
              event.currentTarget.contains(event.target as Node)
            ) {
              event.preventDefault();
              const stops = [
                ...document.querySelectorAll<HTMLElement>(
                  'button, a[href], input, select, textarea, [tabindex]',
                ),
              ].filter(
                (element) =>
                  element.tabIndex >= 0 &&
                  !element.matches(':disabled, [data-radix-focus-guard]') &&
                  !element.closest('[inert]') &&
                  !event.currentTarget.contains(element) &&
                  element.getClientRects().length > 0 &&
                  getComputedStyle(element).visibility !== 'hidden',
              );
              const index = stops.indexOf(triggerRef.current!);
              tabFocusRef.current = stops[index + (event.shiftKey ? -1 : 1)] ?? triggerRef.current;
              handleOpenChange(false);
            }
          }}
          onEscapeKeyDown={() => {
            escapeDismissedRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            if (tabFocusRef.current) {
              event.preventDefault();
              tabFocusRef.current.focus();
              tabFocusRef.current = null;
              return;
            }
            // Keyboard cancellation returns to the field, even if another
            // page interaction was recorded while the non-modal menu was open.
            // Outside clicks retain Radix's normal focus behavior.
            if (escapeDismissedRef.current) {
              event.preventDefault();
              triggerRef.current?.focus({ preventScroll: true });
            }
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (searchable) searchRef.current?.focus();
            else {
              const options = [
                ...(listboxRef.current?.querySelectorAll<HTMLElement>('[data-select-option]') ??
                  []),
              ];
              (options.find((option) => option.dataset.value === value) ?? options[0])?.focus();
            }
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
                className={CONTROL_SEARCH_STYLE}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className={cn(CONTROL_SEARCH_CLEAR_STYLE, CONTROL_FOCUS)}
                  aria-label={clearSearchLabel}
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {filteredGroups.length === 0 && (
            <div role="status" className="text-muted-foreground px-2 py-1.5 text-sm text-center">
              {noResultsLabel}
            </div>
          )}
          <div
            ref={listboxRef}
            id={listboxId}
            role={hasOptionHelp ? 'grid' : 'listbox'}
            aria-label={placeholder}
            className="p-1 max-h-72 overflow-y-auto custom-scrollbar"
          >
            {filteredGroups.map((group) => (
              <div
                key={group.label}
                role={hasOptionHelp ? 'rowgroup' : undefined}
                className="mb-1 last:mb-0"
              >
                {group.label && (
                  <div role={hasOptionHelp ? 'row' : undefined}>
                    <div
                      data-slot="select-label"
                      role={hasOptionHelp ? 'columnheader' : undefined}
                      aria-colspan={hasOptionHelp ? 2 : undefined}
                      className="text-muted-foreground px-2 py-1.5 text-xs font-medium"
                    >
                      {group.heading ?? group.label}
                    </div>
                  </div>
                )}
                {group.options.map((option) => {
                  const isSelected = option.value === value;
                  if (hasOptionHelp) {
                    return (
                      <div
                        key={option.value}
                        role="row"
                        aria-selected={isSelected}
                        className={cn(
                          'flex items-stretch rounded-sm',
                          isSelected && 'bg-primary/10 font-medium',
                        )}
                      >
                        <div role="gridcell" className="min-w-0 flex-1">
                          <button
                            type="button"
                            tabIndex={-1}
                            data-select-option
                            data-slot="select-item"
                            data-value={option.value}
                            data-testid={option.testId}
                            aria-pressed={isSelected}
                            onClick={() => handleSelect(option.value)}
                            onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
                            className={cn(
                              'flex size-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent',
                              CONTROL_OPTION_STYLE,
                            )}
                          >
                            <span className="min-w-0 flex-1">{option.label}</span>
                            {isSelected && (
                              <CheckIcon
                                aria-hidden="true"
                                className="size-3.5 shrink-0 text-primary"
                              />
                            )}
                          </button>
                        </div>
                        <div role="gridcell" className="flex items-center">
                          {option.help && (
                            <OptionInfo
                              label={option.label}
                              value={option.value}
                              tabIndex={-1}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowLeft') {
                                  event.preventDefault();
                                  event.currentTarget
                                    .closest('[role="row"]')
                                    ?.querySelector<HTMLElement>('[data-select-option]')
                                    ?.focus();
                                }
                              }}
                            >
                              {option.help}
                            </OptionInfo>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={option.value}
                      role="option"
                      tabIndex={-1}
                      aria-selected={isSelected}
                      data-slot="select-item"
                      data-select-option
                      data-value={option.value}
                      data-testid={option.testId}
                      onClick={() => handleSelect(option.value)}
                      onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
                      className={cn(
                        "[&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none transition-[background-color,color,box-shadow] duration-150 ease-in-out",
                        CONTROL_OPTION_STYLE,
                        'hover:bg-accent',
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
