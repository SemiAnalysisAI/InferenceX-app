'use client';

import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

// Stable empty default so a fresh `[]` per render doesn't defeat child memoization.
const EMPTY_VALUES: string[] = [];

interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectSection {
  /** Stable key for React list rendering */
  id: string;
  /** Section header (plain text or small composite UI) */
  header?: React.ReactNode;
  options: MultiSelectOption[];
}

interface MultiSelectOptionItemProps {
  option: MultiSelectOption;
  isSelected: boolean;
  isDisabledOption: boolean;
  onToggle: (value: string) => void;
}

// Single selectable row inside the dropdown. Rendered identically for both the
// flat-options and sectioned paths so the markup never drifts between them.
function MultiSelectOptionItem({
  option,
  isSelected,
  isDisabledOption,
  onToggle,
}: MultiSelectOptionItemProps) {
  return (
    <div
      role="option"
      tabIndex={isDisabledOption ? -1 : 0}
      aria-selected={isSelected}
      data-slot="select-item"
      onClick={() => !isDisabledOption && onToggle(option.value)}
      onKeyDown={(e) => {
        if (!isDisabledOption && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle(option.value);
        }
      }}
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
      <span className="flex items-center gap-2">{option.label}</span>
    </div>
  );
}

interface MultiSelectChipProps {
  label: string;
  optionValue: string;
  disabled: boolean;
  isMinReached: boolean;
  onRemove: (optionValue: string, e: React.SyntheticEvent) => void;
}

// One selected-value chip shown inside the trigger (non-plain-text mode).
function MultiSelectChip({
  label,
  optionValue,
  disabled,
  isMinReached,
  onRemove,
}: MultiSelectChipProps) {
  return (
    <span className="bg-transparent text-foreground border border-border dark:bg-[#0a6ca8] dark:border-border inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors shrink-0">
      {label}
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => onRemove(optionValue, e)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onRemove(optionValue, e);
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
  );
}

interface FilteredSection extends MultiSelectSection {
  options: MultiSelectOption[];
}

interface MultiSelectTriggerProps {
  triggerId?: string;
  triggerTestId?: string;
  listboxId: string;
  isOpen: boolean;
  disabled: boolean;
  size: 'sm' | 'default';
  className?: string;
  placeholder: string;
  value: string[];
  selectedLabels: string[];
  plainSelectedText: boolean;
  showClearAll: boolean;
  minSelections?: number;
  isMinReached: boolean;
  onToggleOpen: () => void;
  onRemove: (optionValue: string, e: React.SyntheticEvent) => void;
  onClearAll: (e: React.SyntheticEvent) => void;
}

// The combobox trigger button: selected chips (or plain text), clear-all, and
// the chevron. Stateless — open/disabled/handlers come from the parent.
function MultiSelectTrigger({
  triggerId,
  triggerTestId,
  listboxId,
  isOpen,
  disabled,
  size,
  className,
  placeholder,
  value,
  selectedLabels,
  plainSelectedText,
  showClearAll,
  minSelections,
  isMinReached,
  onToggleOpen,
  onRemove,
  onClearAll,
}: MultiSelectTriggerProps) {
  return (
    <button
      type="button"
      id={triggerId}
      data-testid={triggerTestId}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
      aria-controls={listboxId}
      onClick={() => !disabled && onToggleOpen()}
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
            <span className="text-foreground block min-w-0 truncate">
              {selectedLabels.join(', ')}
            </span>
          ) : (
            selectedLabels.map((label, index) => (
              <MultiSelectChip
                key={value[index]}
                label={label}
                optionValue={value[index]}
                disabled={disabled}
                isMinReached={isMinReached}
                onRemove={onRemove}
              />
            ))
          )
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>
      {value.length > 0 && showClearAll && (
        <span
          role="button"
          tabIndex={0}
          onClick={onClearAll}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClearAll(e);
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
  );
}

interface MultiSelectDropdownProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  searchRef: React.RefObject<HTMLInputElement | null>;
  listboxId: string;
  searchable: boolean;
  search: string;
  onSearchChange: (next: string) => void;
  showSelectionSummary: boolean;
  maxSelections?: number;
  minSelections?: number;
  valueCount: number;
  filteredOptions: MultiSelectOption[];
  filteredSections: FilteredSection[] | null;
  value: string[];
  isMaxReached: boolean;
  onToggle: (value: string) => void;
}

// The open dropdown panel: search box, selection summary, and the option list
// (flat or sectioned). Kept stateless — all state/refs/handlers come from the
// parent so behavior is unchanged.
function MultiSelectDropdown({
  contentRef,
  searchRef,
  listboxId,
  searchable,
  search,
  onSearchChange,
  showSelectionSummary,
  maxSelections,
  minSelections,
  valueCount,
  filteredOptions,
  filteredSections,
  value,
  isMaxReached,
  onToggle,
}: MultiSelectDropdownProps) {
  return (
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
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search options"
              placeholder="Search..."
              className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
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
        {showSelectionSummary && (maxSelections !== undefined || minSelections !== undefined) && (
          <div className="text-muted-foreground px-2 py-1.5 text-xs border-b mb-1">
            {valueCount}
            {maxSelections !== undefined && ` / ${maxSelections}`} selected
            {minSelections !== undefined && minSelections > 0 && (
              <span className="block text-xs mt-0.5">Minimum: {minSelections}</span>
            )}
          </div>
        )}
        {filteredOptions.length === 0 && (
          <div className="text-muted-foreground px-2 py-1.5 text-sm text-center">No results</div>
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
                      <MultiSelectOptionItem
                        key={option.value}
                        option={option}
                        isSelected={isSelected}
                        isDisabledOption={isDisabledOption}
                        onToggle={onToggle}
                      />
                    );
                  })}
                </div>
              );
            })
          : filteredOptions.map((option) => {
              const isSelected = value.includes(option.value);
              const isDisabledOption = !isSelected && isMaxReached && maxSelections !== 1;

              return (
                <MultiSelectOptionItem
                  key={option.value}
                  option={option}
                  isSelected={isSelected}
                  isDisabledOption={isDisabledOption}
                  onToggle={onToggle}
                />
              );
            })}
      </div>
    </div>
  );
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
}

function MultiSelect({
  options,
  sections,
  value = EMPTY_VALUES,
  onChange,
  triggerId,
  triggerTestId,
  open,
  onOpenChange,
  placeholder = 'Select items...',
  size = 'default',
  className,
  disabled = false,
  maxSelections,
  minSelections,
  showClearAll = true,
  searchable = true,
  plainSelectedText = false,
  showSelectionSummary = true,
}: MultiSelectProps) {
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
      if (!isControlledOpen) {
        setInternalIsOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlledOpen, onOpenChange],
  );

  const isMaxReached = maxSelections !== undefined && value.length >= maxSelections;
  const isMinReached = minSelections !== undefined && value.length <= minSelections;

  const prevIsOpenRef = React.useRef(isOpen);

  // Clear the search box each time the dropdown opens. Done during render (not in
  // an effect) so it doesn't trip no-adjust-state-on-prop-change. Search is left
  // intact while closed — the content is unmounted, so it's invisible — which lets
  // the close-analytics effect below read the final query before the next open.
  const [prevOpenForSearch, setPrevOpenForSearch] = React.useState(isOpen);
  if (isOpen !== prevOpenForSearch) {
    setPrevOpenForSearch(isOpen);
    if (isOpen) setSearch('');
  }

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
  }, [isOpen]);

  // Fire search analytics when the dropdown closes, reading the final query
  // before the next open clears it. Stays in an effect because a controlled
  // `open` prop can close us without setIsOpen running.
  React.useEffect(() => {
    const wasOpen = prevIsOpenRef.current;
    prevIsOpenRef.current = isOpen;

    if (wasOpen && !isOpen && searchUsedRef.current) {
      track('multi_select_searched', { query: searchStateRef.current });
      searchUsedRef.current = false;
    }
  }, [isOpen]);

  const flatOptions = React.useMemo(() => {
    if (sections?.length) {
      return sections.flatMap((s) => s.options);
    }
    return options ?? [];
  }, [options, sections]);

  const filteredSections = React.useMemo(() => {
    if (!sections?.length) return null;
    const lower = search.toLowerCase();
    const filterOpts = (opts: MultiSelectOption[]) =>
      search ? opts.filter((opt) => opt.label.toLowerCase().includes(lower)) : opts;

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
    const lower = search.toLowerCase();
    return opts.filter((opt) => opt.label.toLowerCase().includes(lower));
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
  const selectedLabels = value.map((val) => {
    const option = flatOptions.find((opt) => opt.value === val);
    return option ? option.label : val;
  });

  return (
    <div ref={containerRef} className="relative">
      <MultiSelectTrigger
        triggerId={triggerId}
        triggerTestId={triggerTestId}
        listboxId={listboxId}
        isOpen={isOpen}
        disabled={disabled}
        size={size}
        className={className}
        placeholder={placeholder}
        value={value}
        selectedLabels={selectedLabels}
        plainSelectedText={plainSelectedText}
        showClearAll={showClearAll}
        minSelections={minSelections}
        isMinReached={isMinReached}
        onToggleOpen={() => setIsOpen(!isOpen)}
        onRemove={handleRemove}
        onClearAll={handleClearAll}
      />

      {isOpen && (
        <MultiSelectDropdown
          contentRef={contentRef}
          searchRef={searchRef}
          listboxId={listboxId}
          searchable={searchable}
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            if (next) searchUsedRef.current = true;
          }}
          showSelectionSummary={showSelectionSummary}
          maxSelections={maxSelections}
          minSelections={minSelections}
          valueCount={value.length}
          filteredOptions={filteredOptions}
          filteredSections={filteredSections}
          value={value}
          isMaxReached={isMaxReached}
          onToggle={handleToggle}
        />
      )}
    </div>
  );
}

export { MultiSelect };
export type { MultiSelectOption, MultiSelectProps };
