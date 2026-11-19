import type { ImgHTMLAttributes } from 'react';

export function SupporterLogoImage({
  logo,
  className = '',
  darkClassName = '',
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  logo: string;
  darkClassName?: string;
}) {
  // Morph's requested green-on-dark asset needs a dark backing in either theme.
  const treatment =
    logo === 'morph.svg'
      ? 'rounded-sm bg-[#0a0a0a] px-1'
      : logo === 'fireworks-purple.svg'
        ? ''
        : darkClassName;
  return <img {...props} src={`/logos/${logo}`} className={`${className} ${treatment}`} />;
}
