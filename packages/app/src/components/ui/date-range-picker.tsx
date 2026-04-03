'use client';

import { Calendar, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  availableDates?: string[];
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
  availableDates,
  isCheckingAvailableDates,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(dateRange);
  const [selectingStart, setSelectingStart] = useState(true);
  const [error, setError] = useState('');
  const [isApplying, _setIsApplying] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Get display text for the input
  const getDisplayText = () => {
    if (!dateRange.startDate && !dateRange.endDate) {
      return placeholder;
    }
    if (dateRange.startDate && dateRange.endDate) {
      return `${formatDisplayDate(dateRange.startDate)} - ${formatDisplayDate(dateRange.endDate)}`;
    }
    if (dateRange.startDate) {
      return `${formatDisplayDate(dateRange.startDate)} - ...`;
    }
    return placeholder;
  };

  // Handle date selection in calendar
  const handleDateClick = (date: Date) => {
    const dateStr = formatCalendarDate(date);
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
                    {formatDisplayDate(tempRange.startDate)} -{' '}
                    {formatDisplayDate(tempRange.endDate)}
                  </span>
                </span>
              ) : tempRange.startDate ? (
                <span>
                  Start date:{' '}
                  <span className="font-semibold text-foreground">
                    {formatDisplayDate(tempRange.startDate)}
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
              availableDates={availableDates}
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
  availableDates?: string[];
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
  availableDates,
  isCheckingAvailableDates,
}: CalendarGridProps) {
  const { minAllowedDate, maxAllowedDate, earliestMonth, latestMonth } = resolveCalendarDateBounds(
    minDate,
    maxDate,
    availableDates,
    '2025-10-05',
  );
  const [currentMonth, setCurrentMonth] = useCalendarMonth(
    dateRange.startDate,
    availableDates,
    maxAllowedDate,
    [dateRange.startDate, dateRange.endDate],
  );

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
    const dateStr = formatCalendarDate(date);

    // Don't highlight if it's the start or end date
    if (dateStr === effectiveRange.start || dateStr === effectiveRange.end) {
      return false;
    }

    if (effectiveRange.end) {
      return dateStr > effectiveRange.start && dateStr < effectiveRange.end;
    }
    return false;
  };

  const getDayState = (date: Date) => {
    const dateStr = formatCalendarDate(date);
    const outOfRange = isCalendarDateOutOfRange(date, minAllowedDate, maxAllowedDate);

    return {
      selected: dateStr === dateRange.startDate || dateStr === dateRange.endDate,
      disabled: outOfRange || (availableDates !== undefined && !availableDates.includes(dateStr)),
      hovered: dateStr === hoveredDate,
      inRange: isDateInRange(date),
      outOfRange,
    };
  };

  // Get second month (next month)
  const secondMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
  const { canGoPrevious, canGoNext } = getCalendarMonthNavState(
    currentMonth,
    earliestMonth,
    latestMonth,
    secondMonth,
  );

  const goToPreviousMonth = () => {
    if (canGoPrevious) {
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
      onDateHover(formatCalendarDate(date));
    } else {
      onDateHover(null);
    }
  };

  return (
    <div className="space-y-4" onMouseLeave={() => !isCheckingAvailableDates && onDateHover(null)}>
      <div className="grid grid-cols-2 gap-6">
        <CalendarMonthPanel
          month={currentMonth}
          onPreviousMonth={goToPreviousMonth}
          canGoPrevious={canGoPrevious}
          isDisabled={isCheckingAvailableDates}
          getDayState={getDayState}
          onDateClick={onDateClick}
          onDateHover={handleDateHover}
        />
        <CalendarMonthPanel
          month={secondMonth}
          onNextMonth={goToNextMonth}
          canGoNext={canGoNext}
          isDisabled={isCheckingAvailableDates}
          getDayState={getDayState}
          onDateClick={onDateClick}
          onDateHover={handleDateHover}
        />
      </div>
    </div>
  );
}
