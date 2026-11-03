import { cn } from '@/lib/shared/utils';

const VENDOR_DOT: Record<string, { color: string; label: string }> = {
  nvidia: { color: 'bg-[#76b900]', label: 'NVIDIA' },
  amd: { color: 'bg-[#ed1c24]', label: 'AMD' },
};

/**
 * Vendor-colored dot, the one chip identifier used across InferenceX. Vendors without a brand
 * color get a neutral dot. Matching is case-insensitive.
 */
export function VendorDot({ vendor, className }: { vendor: string; className?: string }) {
  const entry = VENDOR_DOT[vendor.toLowerCase()];
  return (
    <span
      role="img"
      aria-label={entry?.label ?? vendor}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        entry?.color ?? 'bg-muted-foreground/60',
        className,
      )}
    />
  );
}
