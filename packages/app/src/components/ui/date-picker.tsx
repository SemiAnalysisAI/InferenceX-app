'use client';

import { Calendar, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useId, useState } from 'react';

import { track } from '@/lib/analytics/analytics';

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
import { Label } from '@/components/ui/label';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: {
    placeholder: 'Select date',
    selectDateError: 'Please select a date',
    unavailableDatePrefix: 'This date does not exist: ',
    latest: 'Latest',
    previousDate: 'Previous available date',
    nextDate: 'Next available date',
    runDate: 'Run Date:',
    title: 'Select a Run Date',
    description: 'Select a run date to view the performance data for that run.',
    checking: 'Checking available dates...',
    goToLatest: 'Go to Latest',
    cancel: 'Cancel',
    applying: 'Applying...',
    apply: 'Apply',
  },
  zh: {
    placeholder: '选择日期',
    selectDateError: '请选择一个日期',
    unavailableDatePrefix: '此日期不存在：',
    latest: '最新',
    previousDate: '上一个可用日期',
    nextDate: '下一个可用日期',
    runDate: '运行日期：',
    title: '选择运行日期',
    description: '选择运行日期以查看该次运行的性能数据。',
    checking: '正在检查可用日期...',
    goToLatest: '前往最新日期',
    cancel: '取消',
    applying: '正在应用...',
    apply: '应用',
  },
} as const;

export interface DatePickerProps {
  date?: string;
  onChange: (date: string) => void;
  minDate?: string;
  maxDate?: string;
  className?: string;
  placeholder?: string;
  availableDates?: string[];
  isCheckingAvailableDates?: boolean;
  isLatestRunSelected?: boolean;
  onGoToLatestRun?: () => void;
  /**
   * Renders the picker as a labelled form field: the label sits above the control with
   * Latest on its right, and the stepper fills the field width so it lines up with the
   * other selectors in a control panel.
   */
  label?: string;
}

export function DatePicker({
  date,
  onChange,
  minDate,
  maxDate,
  placeholder,
  availableDates,
  isCheckingAvailableDates,
  isLatestRunSelected = true,
  onGoToLatestRun,
  label,
}: DatePickerProps) {
  const fieldId = useId();
  const triggerId = `${fieldId}-trigger`;
  const labelId = `${fieldId}-label`;
  const valueId = `${fieldId}-value`;
  const locale = useLocale();
  const t = STRINGS[locale];
  const resolvedPlaceholder = placeholder ?? t.placeholder;
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<string | undefined>(date);
  const [isApplying, _setIsApplying] = useState(false);
  const [error, setError] = useState('');

  const getDisplayText = () => {
    if (!date) {
      return resolvedPlaceholder;
    }
    return formatDisplayDate(date, locale);
  };

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

  const handleApply = () => {
    if (!tempDate) {
      setError(t.selectDateError);
      return;
    }

    if (availableDates && !availableDates.includes(tempDate)) {
      setError(`${t.unavailableDatePrefix}${formatDisplayDate(tempDate, locale)}`);
      return;
    }

    track('date_picker_applied', { date: tempDate });
    onChange(tempDate);
    setOpen(false);
  };

  const handleCancel = () => {
    track('date_picker_cancelled', { changed: tempDate !== date });
    setTempDate(date);
    setOpen(false);
  };

  const getLatestDate = () => getLatestSelectableDate(availableDates, maxDate);

  const isLatestDateSelected = () => {
    if (!tempDate) {
      return false;
    }

    return tempDate === getLatestDate();
  };

  const isCurrentDateLatest = () => {
    if (!date) {
      return false;
    }
    const latestDate = getLatestDate();
    return date === latestDate;
  };

  const handleGoToLatest = () => {
    track('date_picker_go_to_latest', { date: getLatestDate(), placement: 'popover' });
    setTempDate(getLatestDate());
  };

  const handleGoToLatestExternal = () => {
    if (isCurrentDateLatest()) {
      if (!isLatestRunSelected && onGoToLatestRun) {
        track('date_picker_go_to_latest_run');
        onGoToLatestRun();
      }
      return;
    }
    const latestDate = getLatestDate();
    track('date_picker_go_to_latest', { date: latestDate, placement: 'toolbar' });
    onChange(latestDate);
  };

  const isLatestDisabled = isCurrentDateLatest() && isLatestRunSelected;

  const getCurrentDateIndex = () => {
    if (!date || !availableDates || availableDates.length === 0) {
      return -1;
    }
    return availableDates.indexOf(date);
  };

  const canGoPrevious = () => {
    const index = getCurrentDateIndex();
    return index > 0;
  };

  const canGoNext = () => {
    const index = getCurrentDateIndex();
    return index >= 0 && index < (availableDates?.length ?? 0) - 1;
  };

  const handleGoPrevious = () => {
    const index = getCurrentDateIndex();
    if (index > 0 && availableDates) {
      track('date_picker_previous', { date: availableDates[index - 1] });
      onChange(availableDates[index - 1]);
    }
  };

  const handleGoNext = () => {
    const index = getCurrentDateIndex();
    if (availableDates && index >= 0 && index < availableDates.length - 1) {
      track('date_picker_next', { date: availableDates[index + 1] });
      onChange(availableDates[index + 1]);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    track(isOpen ? 'date_picker_opened' : 'date_picker_closed');
    setError('');
    if (isOpen) {
      setTempDate(date);
    }
    setOpen(isOpen);
  };

  const latestButton = (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleGoToLatestExternal}
      disabled={isLatestDisabled || Boolean(isCheckingAvailableDates)}
      className={label ? '-my-1.5 h-8 px-2' : 'px-2'}
    >
      {t.latest}
    </Button>
  );

  const previousButton = (
    <Button
      variant={label ? 'outline' : 'ghost'}
      size="icon"
      onClick={handleGoPrevious}
      disabled={!canGoPrevious() || Boolean(isCheckingAvailableDates)}
      className={label ? undefined : 'size-11 md:size-8'}
      suppressHydrationWarning
      aria-label={t.previousDate}
    >
      <ChevronLeft className="size-4" />
    </Button>
  );

  const nextButton = (
    <Button
      variant={label ? 'outline' : 'ghost'}
      size="icon"
      onClick={handleGoNext}
      disabled={!canGoNext() || Boolean(isCheckingAvailableDates)}
      className={label ? undefined : 'size-11 md:size-8'}
      aria-label={t.nextDate}
    >
      <ChevronRight className="size-4" />
    </Button>
  );

  const dialog = (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {label ? (
          <Button
            id={triggerId}
            variant="outline"
            aria-labelledby={`${labelId} ${valueId}`}
            className="w-full min-w-0 justify-start overflow-hidden px-3"
          >
            <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
            <span id={valueId} className="min-w-0 truncate text-left tabular-nums">
              {getDisplayText()}
            </span>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="min-w-0 flex-1 overflow-hidden px-3 sm:min-w-[200px] sm:flex-none"
          >
            <Calendar className="mr-0 hidden size-4 sm:block" />
            <strong className="sr-only sm:not-sr-only">{t.runDate}</strong>
            <span className="tabular-nums inline-block min-w-0 truncate text-left sm:min-w-[6.5em]">
              {getDisplayText()}
            </span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
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
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{t.checking}</p>
              </div>
            </div>
          )}
        </div>
        {error && <p className="text-md text-center text-red-500">{error}</p>}
        <div className="flex justify-between items-center gap-2 sm:flex-row flex-col-reverse sm:space-x-2">
          <Button
            variant="outline"
            onClick={handleGoToLatest}
            disabled={isLatestDateSelected() || Boolean(isCheckingAvailableDates)}
          >
            {t.goToLatest}
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" onClick={handleCancel}>
                {t.cancel}
              </Button>
            </DialogClose>
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? t.applying : t.apply}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (label) {
    return (
      <div className="flex min-w-0 flex-col space-y-1.5" data-slot="date-field">
        <div className="flex items-center justify-between gap-2">
          <Label id={labelId} htmlFor={triggerId}>
            {label}
          </Label>
          {latestButton}
        </div>
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
          {previousButton}
          {dialog}
          {nextButton}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex max-w-full items-center gap-0.5">
        {latestButton}
        {previousButton}
        {dialog}
        {nextButton}
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
