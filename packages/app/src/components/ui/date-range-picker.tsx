'use client';

import { Calendar, Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    placeholder: 'Select date range',
    unavailableDatesPrefix: 'These dates do not exist: ',
    title: 'Select Date Range',
    selected: 'Selected:',
    startDate: 'Start date:',
    chooseEndDate: 'Choose an end date',
    chooseRange: 'Choose a start and end date to define your date range.',
    checking: 'Checking available dates...',
    noAvailableDates: 'No available dates',
    noAvailableDatesDescription: 'Please change Model, ISL/OSL, or Chip to see available dates.',
    oneDateAvailable: 'Only 1 date available',
    oneDateDescription:
      'Historical comparison requires at least 2 dates. Please change Model, ISL/OSL, or chip selection.',
    viewAnyway: 'View anyway',
    maxRange: 'Max Range',
    last90Days: 'Last 90 Days',
    last30Days: 'Last 30 Days',
    cancel: 'Cancel',
    applying: 'Applying...',
    apply: 'Apply',
  },
  zh: {
    placeholder: '选择日期范围',
    unavailableDatesPrefix: '以下日期不存在：',
    title: '选择日期范围',
    selected: '已选择：',
    startDate: '开始日期：',
    chooseEndDate: '请选择结束日期',
    chooseRange: '请选择开始和结束日期以定义日期范围。',
    checking: '正在检查可用日期...',
    noAvailableDates: '没有可用日期',
    noAvailableDatesDescription: '请更改模型、ISL/OSL 或芯片以查看可用日期。',
    oneDateAvailable: '仅有 1 个可用日期',
    oneDateDescription: '历史对比至少需要 2 个日期。请更改模型、ISL/OSL 或芯片选择。',
    viewAnyway: '仍然查看',
    maxRange: '最大范围',
    last90Days: '最近 90 天',
    last30Days: '最近 30 天',
    cancel: '取消',
    applying: '正在应用...',
    apply: '应用',
  },
} as const;

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
  placeholder,
  minDate,
  maxDate,
  availableDates,
  isCheckingAvailableDates,
}: DateRangePickerProps) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const resolvedPlaceholder = placeholder ?? t.placeholder;
  const [open, setOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange>(dateRange);
  const [selectingStart, setSelectingStart] = useState(true);
  const [error, setError] = useState('');
  const [isApplying, _setIsApplying] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  // Get display text for the input
  const getDisplayText = () => {
    if (!dateRange.startDate && !dateRange.endDate) {
      return resolvedPlaceholder;
    }
    if (dateRange.startDate && dateRange.endDate) {
      if (dateRange.startDate === dateRange.endDate) {
        return formatDisplayDate(dateRange.startDate, locale);
      }
      return `${formatDisplayDate(dateRange.startDate, locale)} - ${formatDisplayDate(dateRange.endDate, locale)}`;
    }
    if (dateRange.startDate) {
      return `${formatDisplayDate(dateRange.startDate, locale)} - ...`;
    }
    return resolvedPlaceholder;
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

    if (tempRange.startDate) {
      const [start, end] = [tempRange.startDate, dateStr].toSorted();
      setTempRange({ startDate: start, endDate: end });
    } else {
      setTempRange({ startDate: dateStr, endDate: '' });
      setSelectingStart(false);
    }
  };

  // Apply selection
  const handleApply = () => {
    if (tempRange.startDate && tempRange.endDate) {
      if (availableDates) {
        const dates = [tempRange.startDate, tempRange.endDate];
        const failedDates = dates.filter((date) => !availableDates.includes(date));
        if (failedDates.length > 0) {
          setError(`${t.unavailableDatesPrefix}${failedDates.join(', ')}`);
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

  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'date_range_picker_opened' : 'date_range_picker_closed');
    setError('');
    if (isOpen) {
      setTempRange(dateRange);
      setSelectingStart(!dateRange.startDate || Boolean(dateRange.endDate));
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
              'w-full min-w-0 justify-start overflow-hidden text-left font-normal',
              !dateRange.startDate && !dateRange.endDate && 'text-muted-foreground',
              className,
            )}
          >
            <Calendar className="mr-2 size-4" />
            <span className="min-w-0 truncate">{getDisplayText()}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
            <DialogDescription>
              {tempRange.startDate && tempRange.endDate ? (
                <span>
                  {t.selected}{' '}
                  <span className="font-semibold text-foreground">
                    {formatDisplayDate(tempRange.startDate, locale)} -{' '}
                    {formatDisplayDate(tempRange.endDate, locale)}
                  </span>
                </span>
              ) : tempRange.startDate ? (
                <span>
                  {t.startDate}{' '}
                  <span className="font-semibold text-foreground">
                    {formatDisplayDate(tempRange.startDate, locale)}
                  </span>{' '}
                  - {t.chooseEndDate}
                </span>
              ) : (
                t.chooseRange
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
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">{t.checking}</p>
                </div>
              </div>
            )}
            {!isCheckingAvailableDates &&
              availableDates !== undefined &&
              availableDates.length === 0 && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                  <div className="flex flex-col items-center gap-2 text-center px-4">
                    <p className="text-sm font-medium text-foreground">{t.noAvailableDates}</p>
                    <p className="text-xs text-muted-foreground">{t.noAvailableDatesDescription}</p>
                  </div>
                </div>
              )}
            {!isCheckingAvailableDates &&
              availableDates !== undefined &&
              availableDates.length === 1 && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-md">
                  <div className="flex flex-col items-center gap-2 text-center px-4">
                    <p className="text-sm font-medium text-foreground">{t.oneDateAvailable}</p>
                    <p className="text-xs text-muted-foreground">{t.oneDateDescription}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        const singleDate = availableDates[0];
                        track('date_range_picker_view_single_date', { date: singleDate });
                        onChange({ startDate: singleDate, endDate: singleDate });
                        setOpen(false);
                      }}
                    >
                      {t.viewAnyway}
                    </Button>
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
                    label: t.maxRange,
                    analyticsLabel: 'Max Range',
                    getRange: () => ({
                      startDate: availableDates[0],
                      endDate: availableDates.at(-1)!,
                    }),
                  },
                  {
                    label: t.last90Days,
                    analyticsLabel: 'Last 90 Days',
                    getRange: () => {
                      const cutoff = new Date();
                      cutoff.setDate(cutoff.getDate() - 90);
                      const cutoffStr = cutoff.toISOString().slice(0, 10);
                      const filtered = availableDates.filter((d) => d >= cutoffStr);
                      if (filtered.length < 2) return null;
                      return { startDate: filtered[0], endDate: filtered.at(-1)! };
                    },
                  },
                  {
                    label: t.last30Days,
                    analyticsLabel: 'Last 30 Days',
                    getRange: () => {
                      const cutoff = new Date();
                      cutoff.setDate(cutoff.getDate() - 30);
                      const cutoffStr = cutoff.toISOString().slice(0, 10);
                      const filtered = availableDates.filter((d) => d >= cutoffStr);
                      if (filtered.length < 2) return null;
                      return { startDate: filtered[0], endDate: filtered.at(-1)! };
                    },
                  },
                ].map(({ label, analyticsLabel, getRange }) => {
                  const range = getRange();
                  if (!range) return null;
                  return (
                    <Button
                      key={label}
                      variant="outline"
                      onClick={() => {
                        setTempRange(range);
                        track('date_range_picker_quick_select', { label: analyticsLabel });
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
                  {t.cancel}
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
                {isApplying ? t.applying : t.apply}
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
      const [start, end] = [dateRange.startDate, hoveredDate].toSorted();
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
