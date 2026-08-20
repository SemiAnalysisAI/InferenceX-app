'use client';

import { Calendar, X } from 'lucide-react';
import { useState } from 'react';

import { track } from '@/lib/analytics';

import { Button } from '@/components/ui/button';
import {
  CalendarMonthPanel,
  formatCalendarDate,
  formatDisplayDate,
  getCalendarMonthNavState,
  isCalendarDateOutOfRange,
  resolveCalendarDateBounds,
  useCalendarMonth,
} from '@/components/ui/calendar-picker-utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';

const STRINGS = {
  en: {
    placeholder: 'Select dates',
    comparisonSeparator: ' vs ',
    selectedSuffix: ' dates selected',
    unavailableDatesPrefix: 'These dates do not exist: ',
    title: 'Select Comparison Dates',
    descriptionPrefix: 'Choose up to ',
    descriptionSuffix: ' dates to compare chip performance over time.',
    selectedDates: 'Selected Dates:',
    clearAll: 'Clear All',
    removeDatePrefix: 'Remove ',
    cancel: 'Cancel',
    applying: 'Applying...',
    apply: 'Apply',
  },
  zh: {
    placeholder: '选择日期',
    comparisonSeparator: ' 对比 ',
    selectedSuffix: ' 个日期已选择',
    unavailableDatesPrefix: '以下日期不存在：',
    title: '选择对比日期',
    descriptionPrefix: '最多选择 ',
    descriptionSuffix: ' 个日期，以对比 Chip 性能随时间的变化。',
    selectedDates: '已选日期：',
    clearAll: '全部清除',
    removeDatePrefix: '移除 ',
    cancel: '取消',
    applying: '正在应用...',
    apply: '应用',
  },
} as const;
export interface MultiDatePickerProps {
  dates: string[];
  onChange: (dates: string[]) => void;
  maxDates?: number;
  minDate?: string;
  maxDate?: string;
  className?: string;
  placeholder?: string;
  availableDates?: string[];
}

/**
 * Multi-date picker component that allows selecting multiple dates via a modal calendar.
 * Displays individual date for 1 date, "x vs y" for 2 dates, or "N dates selected" for 3+ dates.
 */
export function MultiDatePicker({
  dates,
  onChange,
  maxDates = 2,
  minDate,
  maxDate,
  className,
  placeholder,
  availableDates,
}: MultiDatePickerProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const resolvedPlaceholder = placeholder ?? t.placeholder;
  const [open, setOpen] = useState(false);
  const [tempDates, setTempDates] = useState<string[]>(dates);
  const [isApplying, _setIsApplying] = useState(false);
  const [error, setError] = useState('');

  // Get display text for the input
  const getDisplayText = () => {
    if (dates.length === 0) {
      return resolvedPlaceholder;
    }
    if (dates.length === 1) {
      return formatDisplayDate(dates[0], locale);
    }
    if (dates.length === 2) {
      return `${formatDisplayDate(dates[0], locale)}${t.comparisonSeparator}${formatDisplayDate(dates[1], locale)}`;
    }
    return `${dates.length}${t.selectedSuffix}`;
  };

  // Handle date selection in calendar
  const handleDateClick = (date: Date) => {
    const dateStr = formatCalendarDate(date);
    const isSelected = tempDates.includes(dateStr);

    if (isSelected) {
      setTempDates(tempDates.filter((d) => d !== dateStr));
    } else if (tempDates.length < maxDates) {
      setTempDates([...tempDates, dateStr].toSorted());
    }
    track('multi_date_picker_date_clicked', { date: dateStr, selected: !isSelected });
  };

  // Remove a specific date from temp selection
  const handleRemoveTempDate = (dateStr: string) => {
    track('multi_date_picker_date_removed', { date: dateStr });
    setTempDates(tempDates.filter((d) => d !== dateStr));
  };

  // Apply selection
  const handleApply = () => {
    if (availableDates) {
      const failedDates = tempDates.filter((date) => !availableDates.includes(date));
      if (failedDates.length > 0) {
        setError(`${t.unavailableDatesPrefix}${failedDates.join(', ')}`);
        return;
      }
    }

    track('multi_date_picker_applied', { dates: tempDates });
    onChange(tempDates);
    setOpen(false);
  };

  // Cancel selection
  const handleCancel = () => {
    setTempDates(dates);
    setOpen(false);
  };

  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'multi_date_picker_opened' : 'multi_date_picker_closed');
    setError('');
    if (isOpen) {
      setTempDates(dates);
    }
    setOpen(isOpen);
  };

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              dates.length === 0 && 'text-muted-foreground',
              className,
            )}
          >
            <Calendar className="mr-2 size-4" />
            {getDisplayText()}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>
              {t.descriptionPrefix}
              {maxDates}
              {t.descriptionSuffix}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <CalendarGrid
              selectedDates={tempDates}
              onDateClick={handleDateClick}
              maxDates={maxDates}
              minDate={minDate}
              maxDate={maxDate}
              availableDates={availableDates}
            />
            {tempDates.length > 0 && maxDates > 1 && (
              <div className="mt-4 p-3 bg-muted/30 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">{t.selectedDates}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      track('multi_date_picker_cleared', { dateCount: tempDates.length });
                      setTempDates([]);
                    }}
                    className="h-6 px-2 text-xs"
                  >
                    {t.clearAll}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tempDates.map((dateStr, index) => (
                    <div
                      key={index}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-xs flex items-center gap-1 group"
                    >
                      {formatDisplayDate(dateStr, locale)}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTempDate(dateStr);
                        }}
                        className="ml-1 hover:bg-primary-foreground/20 rounded-sm p-0.5 transition-colors"
                        aria-label={`${t.removeDatePrefix}${formatDisplayDate(dateStr, locale)}`}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {error && <p className="text-md text-center text-red-500">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={handleCancel}>
                {t.cancel}
              </Button>
            </DialogClose>
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? t.applying : t.apply}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CalendarGridProps {
  selectedDates: string[];
  onDateClick: (date: Date) => void;
  maxDates: number;
  minDate?: string;
  maxDate?: string;
  availableDates?: string[];
}

function CalendarGrid({
  selectedDates,
  onDateClick,
  maxDates,
  minDate,
  maxDate,
  availableDates,
}: CalendarGridProps) {
  const { minAllowedDate, maxAllowedDate, earliestMonth, latestMonth } = resolveCalendarDateBounds(
    minDate,
    maxDate,
    availableDates,
    '2025-10-10',
  );
  const [currentMonth, setCurrentMonth] = useCalendarMonth(
    selectedDates[0],
    availableDates,
    maxAllowedDate,
    [selectedDates.join(',')],
  );

  const isDateSelected = (date: Date) => selectedDates.includes(formatCalendarDate(date));

  const getDayState = (date: Date) => {
    const outOfRange = isCalendarDateOutOfRange(date, minAllowedDate, maxAllowedDate, true);
    const selected = isDateSelected(date);
    const dateStr = formatCalendarDate(date);

    return {
      selected,
      disabled:
        outOfRange ||
        (availableDates !== undefined && !availableDates.includes(dateStr)) ||
        (selectedDates.length >= maxDates && !selected),
      outOfRange,
    };
  };

  const { canGoPrevious, canGoNext } = getCalendarMonthNavState(
    currentMonth,
    earliestMonth,
    latestMonth,
  );

  const goToPreviousMonth = () => {
    if (canGoPrevious) {
      const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
      track('multi_date_picker_month_navigated', {
        direction: 'previous',
        month: newMonth.toISOString().slice(0, 7),
      });
      setCurrentMonth(newMonth);
    }
  };

  const goToNextMonth = () => {
    if (canGoNext) {
      const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
      track('multi_date_picker_month_navigated', {
        direction: 'next',
        month: newMonth.toISOString().slice(0, 7),
      });
      setCurrentMonth(newMonth);
    }
  };

  return (
    <CalendarMonthPanel
      month={currentMonth}
      onPreviousMonth={goToPreviousMonth}
      onNextMonth={goToNextMonth}
      canGoPrevious={canGoPrevious}
      canGoNext={canGoNext}
      getDayState={getDayState}
      onDateClick={onDateClick}
    />
  );
}
