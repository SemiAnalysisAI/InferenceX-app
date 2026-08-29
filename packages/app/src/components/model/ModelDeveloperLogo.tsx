import { getModelDeveloperLogo, isMonochromeLogo } from '@/lib/model-logos';
import type { Locale } from '@/lib/i18n';

import { MODEL_PAGE_COPY } from './model-page-copy';

/**
 * Full-color developer logo for `/model` surfaces. Renders nothing when the
 * developer has no logo mapping, so pages can treat the logo as optional
 * decoration. Monochrome (black `currentColor`) marks get a dark-mode invert
 * so they stay visible on both themes; full-color logos render as-is.
 */
export default function ModelDeveloperLogo({
  developer,
  locale = 'en',
  className,
}: {
  developer: string;
  locale?: Locale;
  className?: string;
}) {
  const logo = getModelDeveloperLogo(developer);
  if (!logo) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt={MODEL_PAGE_COPY[locale].developerLogoAlt(developer)}
      width={48}
      height={48}
      className={`shrink-0 object-contain ${isMonochromeLogo(logo) ? 'dark:invert' : ''} ${className ?? ''}`}
    />
  );
}
