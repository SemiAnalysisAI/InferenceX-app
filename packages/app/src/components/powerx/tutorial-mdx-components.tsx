import type { ComponentType } from 'react';

import { createMdxComponents } from '@/components/blog/mdx-components';
import type { Locale } from '@/lib/i18n/i18n';
import { tutorialImageSrc, tutorialWidgetName } from '@/lib/powerx/tutorial';

import { TutorialCallout, type TutorialCalloutProps } from './tutorial-callout';
import { isPowerXTutorialWidget, POWERX_TUTORIAL_WIDGETS } from './widgets';

/**
 * The blog component map plus the tutorial-only overrides: GitHub alerts render as callouts,
 * `../../public/...` image paths (which GitHub resolves) map to the app's `/...` paths, and an
 * image under `images/powerx-tutorial/widgets/` mounts the registered client widget instead of
 * the PNG, which stays as the GitHub fallback.
 */
export function createPowerXTutorialComponents(locale: Locale): Record<string, ComponentType<any>> {
  const base = createMdxComponents(locale);
  const BaseImage = base.img;
  return {
    ...base,
    aside: (props: TutorialCalloutProps) => <TutorialCallout {...props} locale={locale} />,
    img: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
      const src = typeof props.src === 'string' ? props.src : null;
      const widget = src === null ? null : tutorialWidgetName(src);
      if (widget !== null && isPowerXTutorialWidget(widget)) {
        const Widget = POWERX_TUTORIAL_WIDGETS[widget];
        return <Widget locale={locale} alt={props.alt ?? widget} />;
      }
      return <BaseImage {...props} src={src === null ? props.src : tutorialImageSrc(src)} />;
    },
  };
}
