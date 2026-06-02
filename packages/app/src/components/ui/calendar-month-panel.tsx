'use client';

import { Button } from '@/components/ui/button';
import {
  type CalendarMonthPanelProps,
  formatCalendarDate,
} from '@/components/ui/calendar-picker-utils';
import { cn } from '@/lib/utils';

function getCalendarMonthDays(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: (Date | null)[] = [];

  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    days.push(new Date(year, monthIndex, day));
  }

  while (days.length < 42) {
    days.push(null);
  }

  return days;
}

export function CalendarMonthPanel({
  month,
  onPreviousMonth,
  onNextMonth,
  canGoPrevious = true,
  canGoNext = true,
  isDisabled = false,
  getDayState,
  onDateClick,
  onDateHover,
}: CalendarMonthPanelProps) {
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = getCalendarMonthDays(month);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {onPreviousMonth ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onPreviousMonth}
            disabled={isDisabled || !canGoPrevious}
            className={cn(!canGoPrevious && 'opacity-30')}
          >
            ‹
          </Button>
        ) : (
          <div className="w-10" />
        )}
        <h3 className="font-semibold">{monthName}</h3>
        {onNextMonth ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onNextMonth}
            disabled={isDisabled || !canGoNext}
            className={cn(!canGoNext && 'opacity-30')}
          >
            ›
          </Button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((weekday) => (
          <div key={weekday} className="text-center text-xs font-medium text-muted-foreground py-2">
            {weekday}
          </div>
        ))}

        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="h-9" />;
          }

          const { selected, disabled, hovered, inRange, outOfRange } = getDayState(day);
          const isToday = day.toDateString() === new Date().toDateString();

          return (
            <button
              type="button"
              key={formatCalendarDate(day)}
              onClick={() => !disabled && !isDisabled && onDateClick(day)}
              onMouseEnter={() => !isDisabled && onDateHover?.(day)}
              onMouseLeave={() => !isDisabled && onDateHover?.(null)}
              disabled={disabled || isDisabled}
              className={cn(
                'h-9 w-full rounded-md text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected && 'bg-primary text-primary-foreground hover:bg-primary/90',
                hovered && !selected && 'bg-primary text-primary-foreground',
                inRange && !selected && !hovered && 'bg-primary/20',
                (disabled || isDisabled) &&
                  !selected &&
                  'opacity-30 cursor-not-allowed hover:bg-transparent hover:text-current line-through',
                !(disabled || isDisabled) &&
                  !selected &&
                  !hovered &&
                  !inRange &&
                  'hover:bg-accent hover:text-accent-foreground',
                isToday && !selected && 'border-2 border-primary',
                !selected && !(disabled || isDisabled) && !inRange && !hovered && 'bg-background',
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
