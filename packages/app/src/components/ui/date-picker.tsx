'use client';

import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { track } from '@/lib/analytics';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface DatePickerProps {
  date?: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  className?: string;
  placeholder?: string;
  availableDates?: string[]; // Add this
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
  availableDates, // Add this
  isCheckingAvailableDates,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  // Convert date prop to internal format for calendar (MM/DD/YYYY, HH:mm:ss)
  const convertToInternalFormat = (dateStr: string | undefined): string | undefined => {
    if (!dateStr) {
      return undefined;
    }
    if (dateStr.includes('-') && !dateStr.includes(',')) {
      const [year, month, day] = dateStr.split('-');
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
    }
    return dateStr;
  };
  const [tempDate, setTempDate] = useState<string | undefined>(() => convertToInternalFormat(date));
  const [isApplying, _setIsApplying] = useState(false);
  const [error, setError] = useState('');

  // Helper to convert string (MM/dd/yyyy, HH:mm:ss) to Date
  const parseDate = (dateStr: string): Date => {
    // Parse "12/01/2025, 24:22:39" format
    const [datePart] = dateStr.split(', ');
    const [month, day, year] = datePart.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // Helper to convert Date to string (MM/dd/yyyy, HH:mm:ss)
  const dateToString = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    return `${month}/${day}/${year}, ${hours}:${minutes}:${seconds}`;
  };

  // Helper to convert Date to internal string (YYYY-MM-DD) for comparison
  const dateToInternalString = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Format date for display (handles both YYYY-MM-DD and MM/DD/YYYY, HH:mm:ss formats)
  const formatDate = (dateStr: string) => {
    let dateObj: Date;
    if (dateStr.includes('-') && !dateStr.includes(',')) {
      // YYYY-MM-DD format
      const [year, month, day] = dateStr.split('-');
      dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      // MM/DD/YYYY, HH:mm:ss format
      dateObj = parseDate(dateStr);
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(dateObj);
  };

  // Get display text for the input
  const getDisplayText = () => {
    if (!date) {
      return placeholder;
    }
    return formatDate(date);
  };

  // Handle date selection in calendar
  const handleDateClick = (dateObj: Date) => {
    const now = new Date();
    dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    const dateStr = dateToString(dateObj);
    const isSelected = tempDate && parseDate(tempDate).toDateString() === dateObj.toDateString();

    if (isSelected) {
      setTempDate(undefined);
    } else {
      setTempDate(dateStr);
    }
    track('date_picker_date_clicked', {
      date: dateToInternalString(dateObj),
      selected: !isSelected,
    });
  };

  // Apply selection
  const handleApply = async () => {
    if (!tempDate) {
      setError('Please select a date');
      return;
    }

    // Convert to YYYY-MM-DD format for existence check
    const dateObj = parseDate(tempDate);
    const internalDateStr = dateToInternalString(dateObj);

    if (availableDates && !availableDates.includes(internalDateStr)) {
      setError(`This date does not exist: ${formatDate(tempDate)}`);
      return;
    }

    track('date_picker_applied', { date: internalDateStr });
    onChange(internalDateStr);
    setOpen(false);
  };

  // Cancel selection
  const handleCancel = () => {
    setTempDate(date);
    setOpen(false);
  };

  // Get the latest date from availableDates or maxDate
  const getLatestDate = () => {
    if (availableDates && availableDates.length > 0) {
      // availableDates is already sorted, so take the last one
      return availableDates[availableDates.length - 1];
    }
    // Fallback to maxDate if provided, otherwise use current date
    return maxDate || dateToInternalString(new Date());
  };

  // Check if the selected date is already the latest
  const isLatestDateSelected = () => {
    if (!tempDate) {
      return false;
    }

    const latestDate = getLatestDate();
    const selectedDateObj = parseDate(tempDate);
    const selectedInternalDate = dateToInternalString(selectedDateObj);
    return selectedInternalDate === latestDate;
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
    const latestDate = getLatestDate();

    // Parse the latest date (YYYY-MM-DD format) and convert to display format
    const [year, month, day] = latestDate.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const now = new Date();
    dateObj.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    const dateStr = dateToString(dateObj);

    setTempDate(dateStr);
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
      track('date_picker_previous');
      onChange(availableDates[index - 1]);
    }
  };

  // Go to next available date
  const handleGoNext = () => {
    const index = getCurrentDateIndex();
    if (availableDates && index >= 0 && index < availableDates.length - 1) {
      track('date_picker_next');
      onChange(availableDates[index + 1]);
    }
  };

  // Reset when opening
  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'date_picker_opened' : 'date_picker_closed');
    if (isOpen) {
      setTempDate(convertToInternalFormat(date));
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
          disabled={isCurrentDateLatest() || isCheckingAvailableDates}
          className="text-xs px-2"
        >
          Latest
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoPrevious}
          disabled={!canGoPrevious() || isCheckingAvailableDates}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="ghost">
              <Calendar className="mr-0 h-4 w-4" />
              <strong>Run Date:</strong>
              {getDisplayText()}
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
            </div>
            {error && <p className="text-md text-center text-red-500">{error}</p>}
            <div className="flex justify-between items-center gap-2 sm:flex-row flex-col-reverse sm:space-x-2">
              <Button
                variant="outline"
                onClick={handleGoToLatest}
                disabled={isLatestDateSelected() || isCheckingAvailableDates}
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
          disabled={!canGoNext() || isCheckingAvailableDates}
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
  availableDates?: string[]; // Add this
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
  // Helper to parse date string (MM/dd/yyyy, HH:mm:ss) to Date
  const parseDateStr = (dateStr: string): Date => {
    const [datePart] = dateStr.split(', ');
    const [month, day, year] = datePart.split('/');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  };

  // Helper to convert Date to string (YYYY-MM-DD) for comparison with availableDates
  const dateToInternalString = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse minDate and maxDate props (YYYY-MM-DD format), with defaults
  const minAllowedDate = minDate
    ? new Date(minDate + ' 12:00:00')
    : new Date('2025-10-05 12:00:00');

  const maxAllowedDate = maxDate ? new Date(maxDate + ' 12:00:00') : new Date();

  maxAllowedDate.setHours(23, 59, 59, 999); // End of day

  // Determine initial month to display
  const getInitialMonth = () => {
    // If there is a selected date, show the month of the selected date
    if (selectedDate) {
      return parseDateStr(selectedDate);
    }

    // Default to the latest month with available data
    if (availableDates && availableDates.length > 0) {
      return parseDateStr(availableDates[availableDates.length - 1]);
    }
    const today = new Date();
    if (maxAllowedDate >= today) {
      return today;
    }
    return maxAllowedDate;
  };

  const [currentMonth, setCurrentMonth] = useState(getInitialMonth());

  // Reset to initial month when selectedDate changes (dialog reopens)
  React.useEffect(() => {
    setCurrentMonth(getInitialMonth());
  }, [selectedDate]);

  const isDateSelected = (date: Date) => {
    if (!selectedDate) {
      return false;
    }
    const selectedDateObj = parseDateStr(selectedDate);
    return selectedDateObj.toDateString() === date.toDateString();
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
      const dateStr = dateToInternalString(date);
      if (!availableDates.includes(dateStr)) {
        return true;
      }
    }
    return false;
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
          disabled={isCheckingAvailableDates || !canGoPrev}
          className={cn(!canGoPrev && 'opacity-30')}
        >
          ‹
        </Button>
        <h3 className="font-semibold">{monthName}</h3>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextMonth}
          disabled={isCheckingAvailableDates || !canGoNext}
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
              onClick={() => !disabled && !isCheckingAvailableDates && onDateClick(day)}
              disabled={disabled || isCheckingAvailableDates}
              className={cn(
                'h-9 w-full rounded-md text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                (disabled || isCheckingAvailableDates) &&
                  !selected &&
                  'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-current line-through',
                isToday && !selected && 'border-2 border-primary',
                !selected && !disabled && !isCheckingAvailableDates && 'bg-background',
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
