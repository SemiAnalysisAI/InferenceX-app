import type { ImgHTMLAttributes } from 'react';

const DARK_VARIANTS: Record<string, string> = {
  'morph.svg': 'morph-dark.svg',
};

export function SupporterLogoImage({
  logo,
  className = '',
  darkClassName = '',
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  logo: string;
  darkClassName?: string;
}) {
  const darkLogo = DARK_VARIANTS[logo];
  if (!darkLogo) {
    return <img {...props} src={`/logos/${logo}`} className={`${className} ${darkClassName}`} />;
  }

  // Official theme variants retain brand colors without CSS filters.
  return (
    <>
      <img {...props} src={`/logos/${logo}`} className={`${className} dark:hidden`} />
      <img {...props} src={`/logos/${darkLogo}`} className={`${className} hidden dark:block`} />
    </>
  );
}
