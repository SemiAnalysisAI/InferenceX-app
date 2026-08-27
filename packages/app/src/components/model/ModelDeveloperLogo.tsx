import { getModelDeveloperLogo } from '@/lib/model-logos';

/**
 * Developer logo for `/model` surfaces. Renders nothing when the developer
 * has no logo mapping, so pages can treat the logo as optional decoration.
 * Mirrors the quotes-page logo treatment (grayscale + dark-mode invert) so
 * monochrome `currentColor` SVGs stay visible on both themes.
 */
export default function ModelDeveloperLogo({
  developer,
  className,
}: {
  developer: string;
  className?: string;
}) {
  const logo = getModelDeveloperLogo(developer);
  if (!logo) return null;

  return (
    <img
      src={`/logos/${logo}`}
      alt={`${developer} logo`}
      width={48}
      height={48}
      className={`shrink-0 object-contain grayscale opacity-70 dark:invert ${className ?? ''}`}
    />
  );
}
