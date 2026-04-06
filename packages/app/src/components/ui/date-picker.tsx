'use client';

import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { track } from '@/lib/analytics';

import { Button } from '@/components/ui/button';
import {
  CalendarMonthPanel,
  formatCalendarDate,
  formatDisplayDate,
  getCalendarMonthNavState,
  getLatestSelectableDate,
  isCalendarDateOutOfRange,
  parseCalendarDate,
  resolveCalendarDateBounds,
  useCalendarMonth,
} from '@/components/ui/calendar-picker-utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface DatePickerProps {
  date?: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  className?: string;
  placeholder?: string;
  availableDates?: string[];
  isCheckingAvailableDates?: boolean;
}

/**
 * Single date picker component that allows selecting a date via a modal calendar.
 */
export function DatePicker({
  date,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Select date',
  availableDates,
  isCheckingAvailableDates,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<string | undefined>(date);
  const [isApplying, _setIsApplying] = useState(false);
  const [error, setError] = useState('');

  // Get display text for the input
  const getDisplayText = () => {
    if (!date) {
      return placeholder;
    }
    return formatDisplayDate(date);
  };

  // Handle date selection in calendar
  const handleDateClick = (dateObj: Date) => {
    const dateStr = formatCalendarDate(dateObj);
    const isSelected = tempDate === dateStr;

    if (isSelected) {
      setTempDate(undefined);
    } else {
      setTempDate(dateStr);
    }
    track('date_picker_date_clicked', {
      date: dateStr,
      selected: !isSelected,
    });
  };

  // Apply selection
  const handleApply = async () => {
    if (!tempDate) {
      setError('Please select a date');
      return;
    }

    if (availableDates && !availableDates.includes(tempDate)) {
      setError(`This date does not exist: ${formatDisplayDate(tempDate)}`);
      return;
    }

    track('date_picker_applied', { date: tempDate });
    onChange(tempDate);
    setOpen(false);
  };

  // Cancel selection
  const handleCancel = () => {
    setTempDate(date);
    setOpen(false);
  };

  const getLatestDate = () => getLatestSelectableDate(availableDates, maxDate);

  // Check if the selected date is already the latest
  const isLatestDateSelected = () => {
    if (!tempDate) {
      return false;
    }

    return tempDate === getLatestDate();
  };

  // Check if the current date prop is already the latest (for external button)
  const isCurrentDateLatest = () => {
    if (!date) {
      return false;
    }
    const latestDate = getLatestDate();
    // date prop is already in YYYY-MM-DD format
    return date === latestDate;
  };

  // Go to latest date (for calendar dialog)
  const handleGoToLatest = () => {
    setTempDate(getLatestDate());
  };

  // Go to latest date directly (for external button)
  const handleGoToLatestExternal = () => {
    const latestDate = getLatestDate();
    track('date_picker_go_to_latest', { date: latestDate });
    onChange(latestDate);
  };

  // Get current date index in available dates
  const getCurrentDateIndex = () => {
    if (!date || !availableDates || availableDates.length === 0) {
      return -1;
    }
    return availableDates.indexOf(date);
  };

  // Check if we can go to previous date
  const canGoPrevious = () => {
    const index = getCurrentDateIndex();
    return index > 0;
  };

  // Check if we can go to next date
  const canGoNext = () => {
    const index = getCurrentDateIndex();
    return index >= 0 && index < (availableDates?.length ?? 0) - 1;
  };

  // Go to previous available date
  const handleGoPrevious = () => {
    const index = getCurrentDateIndex();
    if (index > 0 && availableDates) {
      track('date_picker_previous', { date: availableDates[index - 1] });
      onChange(availableDates[index - 1]);
    }
  };

  // Go to next available date
  const handleGoNext = () => {
    const index = getCurrentDateIndex();
    if (availableDates && index >= 0 && index < availableDates.length - 1) {
      track('date_picker_next', { date: availableDates[index + 1] });
      onChange(availableDates[index + 1]);
    }
  };

  // Reset when opening
  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'date_picker_opened' : 'date_picker_closed');
    if (isOpen) {
      setTempDate(date);
    }
    setOpen(isOpen);
  };

  useEffect(() => {
    setError('');
  }, [open]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGoToLatestExternal}
          disabled={isCurrentDateLatest() || !!isCheckingAvailableDates}
          className="text-xs px-2"
        >
          Latest
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoPrevious}
          disabled={!canGoPrevious() || !!isCheckingAvailableDates}
          className="h-8 w-8"
          suppressHydrationWarning
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="!px-5 min-w-[200px] dark:bg-input/90 dark:hover:bg-input/50"
            >
              <Calendar className="mr-0 h-4 w-4" />
              <strong>Run Date:</strong>
              <span className="tabular-nums inline-block w-[6.5em] text-left">
                {getDisplayText()}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Select a Run Date</DialogTitle>
              <DialogDescription>
                Select a run date to view the performance data for that run.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 relative">
              <CalendarGrid
                selectedDate={tempDate}
                onDateClick={handleDateClick}
                minDate={minDate}
                maxDate={maxDate}
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
            </div>
            {error && <p className="text-md text-center text-red-500">{error}</p>}
            <div className="flex justify-between items-center gap-2 sm:flex-row flex-col-reverse sm:space-x-2">
              <Button
                variant="outline"
                onClick={handleGoToLatest}
                disabled={isLatestDateSelected() || !!isCheckingAvailableDates}
              >
                Go to Latest
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button onClick={handleApply} disabled={isApplying}>
                  {isApplying ? 'Applying...' : 'Apply'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoNext}
          disabled={!canGoNext() || !!isCheckingAvailableDates}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface CalendarGridProps {
  selectedDate?: string;
  onDateClick: (date: Date) => void;
  minDate?: string;
  maxDate?: string;
  availableDates?: string[];
  isCheckingAvailableDates?: boolean;
}

function CalendarGrid({
  selectedDate,
  onDateClick,
  minDate,
  maxDate,
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
    selectedDate,
    availableDates,
    maxAllowedDate,
    [selectedDate],
  );

  const isDateSelected = (date: Date) => {
    if (!selectedDate) {
      return false;
    }
    const selectedDateObj = parseCalendarDate(selectedDate);
    return selectedDateObj.toDateString() === date.toDateString();
  };

  const getDayState = (date: Date) => {
    const outOfRange = isCalendarDateOutOfRange(date, minAllowedDate, maxAllowedDate);
    const dateStr = formatCalendarDate(date);

    return {
      selected: isDateSelected(date),
      disabled: outOfRange || (availableDates !== undefined && !availableDates.includes(dateStr)),
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
      track('date_picker_month_navigated', {
        direction: 'previous',
        month: newMonth.toISOString().slice(0, 7),
      });
      setCurrentMonth(newMonth);
    }
  };

  const goToNextMonth = () => {
    if (canGoNext) {
      const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
      track('date_picker_month_navigated', {
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
      isDisabled={isCheckingAvailableDates}
      getDayState={getDayState}
      onDateClick={onDateClick}
    />
  );
}
