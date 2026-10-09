'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    placeholder: 'Select...',
  },
  zh: {
    placeholder: '请选择…',
  },
} as const;

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'default';
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className = '',
  size = 'default',
}: SelectProps) {
  const t = STRINGS[useLocale()];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const selected = options.find((o) => o.value === value);
  const textSize = 'text-sm';
  const pad = size === 'sm' ? 'h-8 px-3' : 'h-9 px-3';

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 ${pad} ${textSize} bg-transparent border border-input rounded-md shadow-xs hover:bg-surface-hover transition-colors w-full text-left`}
      >
        <span
          className={`flex-1 truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {selected?.label ?? placeholder ?? t.placeholder}
        </span>
        <ChevronDown
          className={`size-4 opacity-90 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[140px] max-h-[240px] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (!opt.disabled) {
                  onChange(opt.value);
                  setOpen(false);
                }
              }}
              className={`w-full text-left rounded-sm px-2 py-1.5 ${textSize} transition-colors ${
                opt.value === value
                  ? 'bg-surface-hover text-foreground font-medium'
                  : 'text-foreground hover:bg-surface-hover'
              } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
