import type { CSSProperties } from 'react';

import { VENDOR_LABELS, vendorColor, type Vendor } from '@/lib/charts/dynamic-colors';
import { cn } from '@/lib/shared/utils';

/**
 * Vendor-colored dot, the one chip identifier used across InferenceX. Vendors without a brand
 * color get a neutral dot. Matching is case-insensitive.
 */
export function VendorDot({ vendor, className }: { vendor: string; className?: string }) {
  const key = vendor.toLowerCase() as Vendor;
  const known = key !== 'unknown' && Object.hasOwn(VENDOR_LABELS, key);
  return (
    <span
      role="img"
      aria-label={known ? VENDOR_LABELS[key] : vendor}
      style={
        known
          ? ({
              '--vendor-dot': vendorColor(key, 'light'),
              '--vendor-dot-dark': vendorColor(key, 'dark'),
            } as CSSProperties)
          : undefined
      }
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        known ? 'bg-(--vendor-dot) dark:bg-(--vendor-dot-dark)' : 'bg-muted-foreground/60',
        className,
      )}
    />
  );
}
