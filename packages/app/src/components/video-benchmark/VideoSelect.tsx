'use client';

import { useId } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function VideoSelect({
  label,
  value,
  onValueChange,
  options,
  testId,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  testId?: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onValueChange} disabled={options.length === 0}>
        <SelectTrigger
          id={id}
          data-testid={testId}
          aria-label={label}
          className="w-full min-w-0 focus-visible:ring-2 focus-visible:ring-ring *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate"
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent className="w-(--radix-select-trigger-width) max-w-[calc(100vw-2rem)]">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="whitespace-normal break-all"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
