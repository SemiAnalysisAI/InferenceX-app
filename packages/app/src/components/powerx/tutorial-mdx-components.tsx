import { cloneElement, type ComponentType, isValidElement, type ReactElement } from 'react';

import { createMdxComponents } from '@/components/blog/mdx-components';
import { Reveal } from '@/components/motion/reveal';
import type { Locale } from '@/lib/i18n/i18n';

import { TutorialCallout, type TutorialCalloutProps } from './tutorial-callout';
import { POWERX_TUTORIAL_WIDGETS, type PowerXTutorialWidgetName } from './widgets';

/**
 * The blog component map plus the tutorial-only overrides: H2s carry a running section number
 * and fade-rise once when scrolled into view, `<Callout>` renders a ruled aside, and
 * `<Widget name>` mounts a registered client widget at its declared layout.
 */
export function createPowerXTutorialComponents(locale: Locale): Record<string, ComponentType<any>> {
  const base = createMdxComponents(locale);
  const BaseH2 = base.h2;
  let section = 0;
  return {
    ...base,
    h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
      section += 1;
      const number = String(section).padStart(2, '0');
      const heading = <BaseH2 {...props} />;
      const rendered = (heading.type as (p: typeof props) => ReactElement)(props);
      if (!isValidElement<{ children?: React.ReactNode }>(rendered)) return heading;
      return (
        <Reveal>
          {cloneElement(
            rendered,
            { 'data-section': number } as Record<string, unknown>,
            <span
              aria-hidden="true"
              className="mb-3 block font-mono text-xs font-semibold tracking-eyebrow text-brand"
            >
              {number}
            </span>,
            rendered.props.children,
          )}
        </Reveal>
      );
    },
    Callout: (props: Omit<TutorialCalloutProps, 'locale'>) => (
      <TutorialCallout {...props} locale={locale} />
    ),
    Widget: ({ name, alt }: { name: PowerXTutorialWidgetName; alt: string }) => {
      const { component: Widget, layout } = POWERX_TUTORIAL_WIDGETS[name];
      return (
        <div
          data-layout={layout}
          className={layout === 'bleed' ? 'my-10 max-w-none' : 'my-8 max-w-[72ch]'}
        >
          <Widget locale={locale} alt={alt} />
        </div>
      );
    },
  };
}
