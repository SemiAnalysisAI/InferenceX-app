import type { ComponentType } from 'react';

import { createMdxComponents } from '@/components/blog/mdx-components';
import type { Locale } from '@/lib/i18n/i18n';
import { tutorialImageSrc } from '@/lib/powerx/tutorial';

import { TutorialCallout, type TutorialCalloutProps } from './tutorial-callout';

/**
 * The blog component map plus the two tutorial-only overrides: GitHub alerts render as callouts,
 * and `../../public/...` image paths (which GitHub resolves) map to the app's `/...` paths.
 */
export function createPowerXTutorialComponents(locale: Locale): Record<string, ComponentType<any>> {
  const base = createMdxComponents(locale);
  const BaseImage = base.img;
  return {
    ...base,
    aside: (props: TutorialCalloutProps) => <TutorialCallout {...props} locale={locale} />,
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
      <BaseImage
        {...props}
        src={typeof props.src === 'string' ? tutorialImageSrc(props.src) : props.src}
      />
    ),
  };
}
