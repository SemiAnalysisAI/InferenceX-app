/**
 * Maps `HW_REGISTRY` vendor names to logo files under `public/logos/`.
 *
 * NVIDIA uses its official full-color mark (NVIDIA green, #76B900), which is
 * legible on both themes as-is. AMD's corporate mark is monochrome by design —
 * the brand guidelines only permit the standard black logo or the reversed-out
 * white logo (the legacy green-arrow mark is retired), so it relies on the
 * shared dark-mode invert from `isMonochromeLogo` instead of a color variant.
 *
 * Vendors without an entry (e.g. Teacup) simply render no logo — surfaces
 * treat the vendor mark as optional decoration beside the hardware label.
 */
export const HW_VENDOR_LOGOS: Record<string, string> = {
  NVIDIA: 'nvidia-color.svg',
  AMD: 'amd.svg',
};

/** Logo filename under `/logos/` for a hardware vendor, if one exists. */
export function getHwVendorLogo(vendor: string | undefined): string | undefined {
  return vendor ? HW_VENDOR_LOGOS[vendor] : undefined;
}
