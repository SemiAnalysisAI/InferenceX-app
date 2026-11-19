'use client';

import { Square, SquareCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/lib/i18n/use-locale';

const STRINGS = {
  en: { label: (n: number) => `Hide cells under ${n}` },
  zh: { label: (n: number) => `隐藏少于 ${n} 的单元格` },
};

export function HideSmallToggle({
  threshold,
  pressed,
  onPressedChange,
}: {
  threshold: number;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  const t = STRINGS[useLocale()];
  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className="aria-pressed:bg-card aria-pressed:text-foreground dark:aria-pressed:bg-input/30"
    >
      {pressed ? <SquareCheck aria-hidden="true" /> : <Square aria-hidden="true" />}
      {t.label(threshold)}
    </Button>
  );
}
