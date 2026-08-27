import { getModelDeveloperLogo } from '@/lib/model-logos';

/**
 * Full-color developer logo for `/model` surfaces. Renders nothing when the
 * developer has no logo mapping, so pages can treat the logo as optional
 * decoration. Monochrome (black `currentColor`) marks get a dark-mode invert
 * so they stay visible on both themes; full-color logos render as-is.
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
      src={`/logos/${logo.file}`}
      alt={`${developer} logo`}
      width={48}
      height={48}
      className={`shrink-0 object-contain ${logo.monochrome ? 'dark:invert' : ''} ${className ?? ''}`}
    />
  );
}
