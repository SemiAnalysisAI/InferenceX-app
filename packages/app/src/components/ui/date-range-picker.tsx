'use client';

import { Calendar, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { track } from '@/lib/analytics';

import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface DateRangePickerProps {
  dateRange: DateRange;
  onChange: (dateRange: DateRange) => void;
  className?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  availableDates?: string[]; // Add this
  isCheckingAvailableDates?: boolean;
}

/**
 * Date range picker component that allows selecting a start and end date via a modal calendar.
 * Displays "Start - End" when both dates are selected.
 */
export function DateRangePicker({
  dateRange,
  onChange,
  className,
  placeholder = 'Select date range',
  minDate,
  maxDate,
  availableDates, // Add this
  isCheckingAvailableDates,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(dateRange);
  const [selectingStart, setSelectingStart] = useState(true);
  const [error, setError] = useState('');
  const [isApplying, _setIsApplying] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  // Helper to convert string to Date
  const parseDate = (dateStr: string): Date => {
    return new Date(dateStr + 'T12:00:00');
  };

  // Helper to convert Date to string (YYYY-MM-DD)
  const dateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = parseDate(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  // Get display text for the input
  const getDisplayText = () => {
    if (!dateRange.startDate && !dateRange.endDate) {
      return placeholder;
    }
    if (dateRange.startDate && dateRange.endDate) {
      return `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`;
    }
    if (dateRange.startDate) {
      return `${formatDate(dateRange.startDate)} - ...`;
    }
    return placeholder;
  };

  // Handle date selection in calendar
  const handleDateClick = (date: Date) => {
    const dateStr = dateToString(date);
    track('date_range_picker_date_clicked', { date: dateStr });

    if (tempRange.startDate && tempRange.endDate) {
      setTempRange({ startDate: dateStr, endDate: '' });
      setSelectingStart(false);
      return;
    }

    if (!tempRange.startDate) {
      setTempRange({ startDate: dateStr, endDate: '' });
      setSelectingStart(false);
    } else {
      const [start, end] = [tempRange.startDate, dateStr].sort();
      setTempRange({ startDate: start, endDate: end });
    }
  };

  // Apply selection
  const handleApply = async () => {
    if (tempRange.startDate && tempRange.endDate) {
      if (availableDates) {
        const dates = [tempRange.startDate, tempRange.endDate];
        const failedDates = dates.filter((date) => !availableDates.includes(date));
        if (failedDates.length > 0) {
          setError(`These dates do not exist: ${failedDates.join(', ')}`);
          return;
        }
      }
      track('date_range_picker_applied', { start: tempRange.startDate, end: tempRange.endDate });
      onChange(tempRange);
      setOpen(false);
    }
  };

  // Cancel selection
  const handleCancel = () => {
    setTempRange(dateRange);
    setSelectingStart(true);
    setOpen(false);
  };

  // Reset when opening
  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'date_range_picker_opened' : 'date_range_picker_closed');
    if (isOpen) {
      setTempRange(dateRange);
      setSelectingStart(!dateRange.startDate || !!dateRange.endDate);
    }
    setOpen(isOpen);
  };

  useEffect(() => {
    setError('');
  }, [open]);

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !dateRange.startDate && !dateRange.endDate && 'text-muted-foreground',
              className,
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {getDisplayText()}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
            <DialogDescription>
              {tempRange.startDate && tempRange.endDate ? (
                <span>
                  Selected:{' '}
                  <span className="font-semibold text-foreground">
                    {formatDate(tempRange.startDate)} - {formatDate(tempRange.endDate)}
                  </span>
                </span>
              ) : tempRange.startDate ? (
                <span>
                  Start date:{' '}
                  <span className="font-semibold text-foreground">
                    {formatDate(tempRange.startDate)}
                  </span>{' '}
                  - Choose an end date
                </span>
              ) : (
                'Choose a start and end date to define your date range.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 relative">
            <CalendarGrid
              dateRange={tempRange}
              onDateClick={handleDateClick}
              selectingStart={selectingStart}
              minDate={minDate}
              maxDate={maxDate}
              hoveredDate={hoveredDate}
              onDateHover={setHoveredDate}
              availableDates={availableDates} // Add this
              isCheckingAvailableDates={isCheckingAvailableDates}
            />
            {isCheckingAvailableDates && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Checking available dates...</p>
                </div>
              </div>
            )}
            {!isCheckingAvailableDates &&
              availableDates !== undefined &&
              availableDates.length === 0 && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                  <div className="flex flex-col items-center gap-2 text-center px-4">
                    <p className="text-sm font-medium text-foreground">No available dates</p>
                    <p className="text-xs text-muted-foreground">
                      Please change Model, ISL/OSL, or GPU to see available dates.
                    </p>
                  </div>
                </div>
              )}
            {!isCheckingAvailableDates &&
              availableDates !== undefined &&
              availableDates.length === 1 && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                  <div className="flex flex-col items-center gap-2 text-center px-4">
                    <p className="text-sm font-medium text-foreground">Only 1 date available</p>
                    <p className="text-xs text-muted-foreground">
                      Historical comparison requires at least 2 dates. Please change Model, ISL/OSL,
                      or GPU selection.
                    </p>
                  </div>
                </div>
              )}
          </div>
          {error && <p className="text-md text-center text-red-500">{error}</p>}
          <DialogFooter className="flex-row justify-between sm:justify-between">
            {availableDates && availableDates.length >= 2 ? (
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: 'Max Range',
                    getRange: () => ({
                      startDate: availableDates[0],
                      endDate: availableDates[availableDates.length - 1],
                    }),
                  },
                  {
                    label: 'Last 90 Days',
                    getRange: () => {
                      const cutoff = new Date();
                      cutoff.setDate(cutoff.getDate() - 90);
                      const cutoffStr = cutoff.toISOString().slice(0, 10);
                      const filtered = availableDates.filter((d) => d >= cutoffStr);
                      if (filtered.length < 2) return null;
                      return { startDate: filtered[0], endDate: filtered[filtered.length - 1] };
                    },
                  },
                  {
                    label: 'Last 30 Days',
                    getRange: () => {
                      const cutoff = new Date();
                      cutoff.setDate(cutoff.getDate() - 30);
                      const cutoffStr = cutoff.toISOString().slice(0, 10);
                      const filtered = availableDates.filter((d) => d >= cutoffStr);
                      if (filtered.length < 2) return null;
                      return { startDate: filtered[0], endDate: filtered[filtered.length - 1] };
                    },
                  },
                ].map(({ label, getRange }) => {
                  const range = getRange();
                  if (!range) return null;
                  return (
                    <Button
                      key={label}
                      variant="outline"
                      onClick={() => {
                        setTempRange(range);
                        track('date_range_picker_quick_select', { label });
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleApply}
                disabled={
                  !tempRange.startDate ||
                  !tempRange.endDate ||
                  isApplying ||
                  (availableDates !== undefined && availableDates.length < 2)
                }
              >
                {isApplying ? 'Applying...' : 'Apply'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CalendarGridProps {
  dateRange: DateRange;
  onDateClick: (date: Date) => void;
  selectingStart: boolean;
  minDate?: string;
  maxDate?: string;
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
  availableDates?: string[]; // Add this
  isCheckingAvailableDates?: boolean;
}

function CalendarGrid({
  dateRange,
  onDateClick,
  selectingStart,
  minDate,
  maxDate,
  hoveredDate,
  onDateHover,
  availableDates, // Add this
  isCheckingAvailableDates,
}: CalendarGridProps) {
  // Parse minDate and maxDate props, with defaults
  const minAllowedDate = minDate
    ? new Date(minDate + ' 12:00:00')
    : new Date('2025-10-05 12:00:00');

  const maxAllowedDate = maxDate ? new Date(maxDate + ' 12:00:00') : new Date();

  maxAllowedDate.setHours(23, 59, 59, 999); // End of day

  // Determine initial month to display
  const getInitialMonth = () => {
    if (dateRange.startDate) {
      return new Date(dateRange.startDate + ' 12:00:00');
    }
    // Default to the latest month with available data
    if (availableDates && availableDates.length > 0) {
      return new Date(availableDates[availableDates.length - 1] + 'T12:00:00');
    }
    const today = new Date();
    if (maxAllowedDate >= today) {
      return today;
    }
    return maxAllowedDate;
  };

  const [currentMonth, setCurrentMonth] = useState(getInitialMonth());

  // Reset to initial month when dateRange changes (dialog reopens)
  useEffect(() => {
    setCurrentMonth(getInitialMonth());
  }, [dateRange.startDate, dateRange.endDate]);

  // Helper to convert Date to string (YYYY-MM-DD)
  const dateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get the effective range for highlighting (includes hover)
  const getEffectiveRange = () => {
    if (!dateRange.startDate) {
      return { start: null, end: null };
    }

    // If hovering and first date is selected, show preview range in either direction
    if (hoveredDate && !dateRange.endDate && !selectingStart) {
      const [start, end] = [dateRange.startDate, hoveredDate].sort();
      return { start, end };
    }

    // Otherwise use the actual range
    if (dateRange.startDate && dateRange.endDate) {
      return { start: dateRange.startDate, end: dateRange.endDate };
    }

    return { start: dateRange.startDate, end: null };
  };

  const effectiveRange = getEffectiveRange();

  const isDateInRange = (date: Date) => {
    if (!effectiveRange.start) {
      return false;
    }
    const dateStr = dateToString(date);

    // Don't highlight if it's the start or end date
    if (dateStr === effectiveRange.start || dateStr === effectiveRange.end) {
      return false;
    }

    if (effectiveRange.end) {
      return dateStr > effectiveRange.start && dateStr < effectiveRange.end;
    }
    return false;
  };

  const isDateSelected = (date: Date) => {
    const dateStr = dateToString(date);
    return dateStr === dateRange.startDate || dateStr === dateRange.endDate;
  };

  const isDateHovered = (date: Date) => {
    if (!hoveredDate) {
      return false;
    }
    const dateStr = dateToString(date);
    return dateStr === hoveredDate;
  };

  const isDateOutOfRange = (date: Date) => {
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const minDateOnly = new Date(
      minAllowedDate.getFullYear(),
      minAllowedDate.getMonth(),
      minAllowedDate.getDate(),
    );
    const maxDateOnly = new Date(
      maxAllowedDate.getFullYear(),
      maxAllowedDate.getMonth(),
      maxAllowedDate.getDate(),
    );
    return dateOnly < minDateOnly || dateOnly > maxDateOnly;
  };

  const isDateDisabled = (date: Date) => {
    if (isDateOutOfRange(date)) {
      return true;
    }
    if (availableDates) {
      const dateStr = dateToString(date);
      if (!availableDates.includes(dateStr)) {
        return true;
      }
    }
    return false;
  };

  // Generate calendar days for a given month - always returns 42 cells (6 rows) for consistent height
  const getDaysInMonth = (month: Date) => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1);
    const lastDay = new Date(year, monthIndex + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, monthIndex, day));
    }

    // Pad to 42 cells (6 rows × 7 days) for consistent height
    while (days.length < 42) {
      days.push(null);
    }

    return days;
  };

  // Get second month (next month)
  const secondMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);

  const firstMonthDays = getDaysInMonth(currentMonth);
  const secondMonthDays = getDaysInMonth(secondMonth);
  const firstMonthName = currentMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const secondMonthName = secondMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Clamp navigation to months that contain available data
  const earliestMonth =
    availableDates && availableDates.length > 0
      ? new Date(availableDates[0] + 'T12:00:00')
      : minAllowedDate;
  const latestMonth =
    availableDates && availableDates.length > 0
      ? new Date(availableDates[availableDates.length - 1] + 'T12:00:00')
      : maxAllowedDate;

  const canGoPrev =
    currentMonth.getFullYear() > earliestMonth.getFullYear() ||
    (currentMonth.getFullYear() === earliestMonth.getFullYear() &&
      currentMonth.getMonth() > earliestMonth.getMonth());
  const canGoNext =
    secondMonth.getFullYear() < latestMonth.getFullYear() ||
    (secondMonth.getFullYear() === latestMonth.getFullYear() &&
      secondMonth.getMonth() < latestMonth.getMonth());

  const goToPreviousMonth = () => {
    if (canGoPrev) {
      const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
      track('date_range_picker_month_navigated', {
        direction: 'previous',
        month: newMonth.toISOString().slice(0, 7),
      });
      setCurrentMonth(newMonth);
    }
  };

  const goToNextMonth = () => {
    if (canGoNext) {
      const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
      track('date_range_picker_month_navigated', {
        direction: 'next',
        month: newMonth.toISOString().slice(0, 7),
      });
      setCurrentMonth(newMonth);
    }
  };

  const handleDateHover = (date: Date | null) => {
    if (!date) {
      onDateHover(null);
      return;
    }

    // Only show hover effect when start date is selected and we're selecting end date
    if (!selectingStart && dateRange.startDate) {
      onDateHover(dateToString(date));
    } else {
      onDateHover(null);
    }
  };

  const renderCalendarMonth = (
    days: (Date | null)[],
    monthName: string,
    showPrevButton: boolean,
    showNextButton: boolean,
  ) => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {showPrevButton ? (
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousMonth}
            disabled={isCheckingAvailableDates || !canGoPrev}
            className={cn(!canGoPrev && 'opacity-30')}
          >
            ‹
          </Button>
        ) : (
          <div className="w-10" />
        )}
        <h3 className="font-semibold">{monthName}</h3>
        {showNextButton ? (
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            disabled={isCheckingAvailableDates || !canGoNext}
            className={cn(!canGoNext && 'opacity-30')}
          >
            ›
          </Button>
        ) : (
          <div className="w-10" />
        )}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="h-9" />;
          }

          const selected = isDateSelected(day);
          const inRange = isDateInRange(day);
          const hovered = isDateHovered(day);
          const disabled = isDateDisabled(day);
          const isToday = day.toDateString() === new Date().toDateString();
          const outOfRange = isDateOutOfRange(day);

          return (
            <button
              key={index}
              onClick={() => !disabled && !isCheckingAvailableDates && onDateClick(day)}
              onMouseEnter={() => !isCheckingAvailableDates && handleDateHover(day)}
              onMouseLeave={() => !isCheckingAvailableDates && handleDateHover(null)}
              disabled={disabled || isCheckingAvailableDates}
              className={cn(
                'h-9 w-full rounded-md text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                hovered && !selected && 'bg-primary text-primary-foreground',
                inRange && !selected && !hovered && 'bg-primary/20',
                disabled &&
                  !selected &&
                  'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-current line-through',
                !disabled &&
                  !selected &&
                  !hovered &&
                  !inRange &&
                  'hover:bg-accent hover:text-accent-foreground',
                isToday && !selected && 'border-2 border-primary',
                !selected && !disabled && !inRange && !hovered && 'bg-background',
                outOfRange && !selected && 'text-muted-foreground',
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4" onMouseLeave={() => !isCheckingAvailableDates && onDateHover(null)}>
      <div className="grid grid-cols-2 gap-6">
        {renderCalendarMonth(firstMonthDays, firstMonthName, true, false)}
        {renderCalendarMonth(secondMonthDays, secondMonthName, false, true)}
      </div>
    </div>
  );
}
