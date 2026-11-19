import type { ReactNode } from 'react';

/** Section title for explorer views, with an optional count or note and actions on the right. */
export function SectionHeader({
  label,
  detail,
  actions,
}: {
  label: string;
  detail?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-sm font-medium text-foreground">{label}</h2>
      <span aria-hidden="true" className="h-px flex-1 bg-border/30" />
      {detail !== undefined && (
        <span className="text-xs tabular-nums text-muted-foreground">{detail}</span>
      )}
      {actions}
    </div>
  );
}
