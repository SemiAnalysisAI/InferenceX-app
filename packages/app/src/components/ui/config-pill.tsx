import { cn } from '@/lib/shared/utils';

interface ConfigPillProps {
  label: string;
  value?: number | string;
  className?: string;
}

export function ConfigPill({ label, value, className }: ConfigPillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-sm bg-foreground/[0.08] px-1.5 text-xs leading-none whitespace-nowrap tabular-nums',
        className,
      )}
    >
      {value === undefined ? (
        label
      ) : (
        <>
          <span className="text-muted-foreground">{label}</span>
          {value}
        </>
      )}
    </span>
  );
}
