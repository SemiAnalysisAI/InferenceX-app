'use client';

import { Calendar, X } from 'lucide-react';
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
export interface MultiDatePickerProps {
  dates: string[];
  onChange: (dates: string[]) => void;
  maxDates?: number;
  minDate?: string;
  maxDate?: string;
  className?: string;
  placeholder?: string;
  availableDates?: string[]; // Add this
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
  placeholder = 'Select dates',
  availableDates, // Add this
}: MultiDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [tempDates, setTempDates] = useState<string[]>(dates);
  const [isApplying, _setIsApplying] = useState(false);
  const [error, setError] = useState('');
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
    if (dates.length === 0) {
      return placeholder;
    }
    if (dates.length === 1) {
      return formatDate(dates[0]);
    }
    if (dates.length === 2) {
      return `${formatDate(dates[0])} vs ${formatDate(dates[1])}`;
    }
    return `${dates.length} dates selected`;
  };

  // Handle date selection in calendar
  const handleDateClick = (date: Date) => {
    const dateStr = dateToString(date);
    const isSelected = tempDates.includes(dateStr);

    if (isSelected) {
      setTempDates(tempDates.filter((d) => d !== dateStr));
    } else {
      if (tempDates.length < maxDates) {
        setTempDates([...tempDates, dateStr].sort());
      }
    }
    track('multi_date_picker_date_clicked', { date: dateStr, selected: !isSelected });
  };

  // Remove a specific date from temp selection
  const handleRemoveTempDate = (dateStr: string) => {
    setTempDates(tempDates.filter((d) => d !== dateStr));
  };

  // Apply selection
  const handleApply = () => {
    if (availableDates) {
      const failedDates = tempDates.filter((date) => !availableDates.includes(date));
      if (failedDates.length > 0) {
        setError(`These dates do not exist: ${failedDates.join(', ')}`);
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

  // Reset when opening
  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'multi_date_picker_opened' : 'multi_date_picker_closed');
    if (isOpen) {
      setTempDates(dates);
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
              !dates.length && 'text-muted-foreground',
              className,
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {getDisplayText()}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Select Comparison Dates</DialogTitle>
            <DialogDescription>
              Choose up to {maxDates} dates to compare GPU performance over time.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <CalendarGrid
              selectedDates={tempDates}
              onDateClick={handleDateClick}
              maxDates={maxDates}
              minDate={minDate}
              maxDate={maxDate}
              availableDates={availableDates} // Add this
            />
            {tempDates.length > 0 && maxDates > 1 && (
              <div className="mt-4 p-3 bg-muted/30 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Selected Dates:</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setTempDates([])}
                    className="h-6 px-2 text-xs"
                  >
                    Clear All
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tempDates.map((dateStr, index) => (
                    <div
                      key={index}
                      className="px-2 py-1 bg-primary text-primary-foreground rounded-md text-xs flex items-center gap-1 group"
                    >
                      {formatDate(dateStr)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTempDate(dateStr);
                        }}
                        className="ml-1 hover:bg-primary-foreground/20 rounded-sm p-0.5 transition-colors"
                        aria-label={`Remove ${formatDate(dateStr)}`}
                      >
                        <X className="h-3 w-3" />
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
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? 'Applying...' : 'Apply'}
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
  availableDates?: string[]; // Add this
}

function CalendarGrid({
  selectedDates,
  onDateClick,
  maxDates,
  minDate,
  maxDate,
  availableDates, // Add this
}: CalendarGridProps) {
  // Parse minDate and maxDate props, with defaults
  const minAllowedDate = minDate
    ? new Date(minDate + ' 12:00:00')
    : new Date('2025-10-10 12:00:00');

  const maxAllowedDate = maxDate ? new Date(maxDate + ' 12:00:00') : new Date();

  maxAllowedDate.setHours(23, 59, 59, 999); // End of day

  // Determine initial month to display
  const getInitialMonth = () => {
    // If there are selected dates, show the month of the first selected date
    if (selectedDates.length > 0) {
      return new Date(selectedDates[0] + ' 12:00:00');
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

  // Reset to initial month when selectedDates change (dialog reopens)
  React.useEffect(() => {
    setCurrentMonth(getInitialMonth());
  }, [selectedDates.join(',')]); // Use join to create a stable dependency

  // Helper to convert Date to string (YYYY-MM-DD)
  const dateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isDateSelected = (date: Date) => {
    return selectedDates.includes(dateToString(date));
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
    return dateOnly <= minDateOnly || dateOnly >= maxDateOnly;
  };

  const isDateDisabled = (date: Date) => {
    const outOfRange = isDateOutOfRange(date);
    if (outOfRange) {
      return true;
    }
    if (availableDates) {
      const dateStr = dateToString(date);
      if (!availableDates.includes(dateStr)) {
        return true;
      }
    }
    return selectedDates.length >= maxDates && !isDateSelected(date);
  };

  // Generate calendar days - always returns 42 cells (6 rows) for consistent height
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    // Pad to 42 cells (6 rows × 7 days) for consistent height
    while (days.length < 42) {
      days.push(null);
    }

    return days;
  };

  const days = getDaysInMonth();
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

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
    currentMonth.getFullYear() < latestMonth.getFullYear() ||
    (currentMonth.getFullYear() === latestMonth.getFullYear() &&
      currentMonth.getMonth() < latestMonth.getMonth());

  const goToPreviousMonth = () => {
    if (canGoPrev)
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    if (canGoNext)
      setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousMonth}
          disabled={!canGoPrev}
          className={cn(!canGoPrev && 'opacity-30')}
        >
          ‹
        </Button>
        <h3 className="font-semibold">{monthName}</h3>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextMonth}
          disabled={!canGoNext}
          className={cn(!canGoNext && 'opacity-30')}
        >
          ›
        </Button>
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
          const disabled = isDateDisabled(day);
          const isToday = day.toDateString() === new Date().toDateString();
          const outOfRange = isDateOutOfRange(day);

          return (
            <button
              key={index}
              onClick={() => !disabled && onDateClick(day)}
              disabled={disabled}
              className={cn(
                'h-9 w-full rounded-md text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                disabled &&
                  !selected &&
                  'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-current line-through',
                isToday && !selected && 'border-2 border-primary',
                !selected && !disabled && 'bg-background',
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
}
