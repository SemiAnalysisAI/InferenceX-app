import { getModelDeveloperLogo, isMonochromeLogo } from '@/lib/catalog/model-logos';
import type { Locale } from '@/lib/i18n/i18n';

import { MODEL_PAGE_COPY } from './model-page-copy';

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
