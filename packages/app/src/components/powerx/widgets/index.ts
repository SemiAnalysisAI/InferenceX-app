import type { ComponentType } from 'react';

import { FlowWidget } from './flow-widget';
import { LadderWidget } from './ladder-widget';
import { LoadWidget } from './load-widget';
import { MeasuredVsModeledWidget } from './measured-vs-modeled-widget';
import { RunConfigWidget } from './run-config-widget';
import { ValidityWidget } from './validity-widget';
import type { WidgetLayout, WidgetProps } from './widget-chrome';
import { WorkedExampleWidget } from './worked-example-widget';

/**
 * Widgets the tutorial mounts in place of `../../public/images/powerx-tutorial/widgets/<key>.<ext>`.
 * The image is the GitHub fallback (a screenshot, or the exported SVG for the flow diagram); the
 * page renders the component at the declared layout.
 */
export const POWERX_TUTORIAL_WIDGETS = {
  ladder: { component: LadderWidget, layout: 'bleed' },
  flow: { component: FlowWidget, layout: 'bleed' },
  'measured-vs-modeled': { component: MeasuredVsModeledWidget, layout: 'bleed' },
  load: { component: LoadWidget, layout: 'column' },
  validity: { component: ValidityWidget, layout: 'column' },
  'run-config': { component: RunConfigWidget, layout: 'column' },
  'worked-example': { component: WorkedExampleWidget, layout: 'column' },
} as const satisfies Record<
  string,
  { component: ComponentType<WidgetProps>; layout: WidgetLayout }
>;

export type PowerXTutorialWidgetName = keyof typeof POWERX_TUTORIAL_WIDGETS;

export const isPowerXTutorialWidget = (name: string): name is PowerXTutorialWidgetName =>
  Object.hasOwn(POWERX_TUTORIAL_WIDGETS, name);
