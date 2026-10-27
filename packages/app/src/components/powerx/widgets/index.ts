import type { ComponentType } from 'react';

import { ChartWidget } from './chart-widget';
import { PowerBasisWidget } from './power-basis-widget';
import { RunConfigWidget } from './run-config-widget';
import { ValidityWidget } from './validity-widget';
import type { WidgetProps } from './widget-chrome';

/**
 * Widgets the tutorial mounts in place of `../../public/images/powerx-tutorial/widgets/<key>.png`.
 * The PNG is the GitHub fallback (a screenshot of the widget); the page renders the component.
 */
export const POWERX_TUTORIAL_WIDGETS = {
  'power-basis': PowerBasisWidget,
  'run-config': RunConfigWidget,
  validity: ValidityWidget,
  chart: ChartWidget,
} as const satisfies Record<string, ComponentType<WidgetProps>>;

export type PowerXTutorialWidgetName = keyof typeof POWERX_TUTORIAL_WIDGETS;

export const isPowerXTutorialWidget = (name: string): name is PowerXTutorialWidgetName =>
  Object.hasOwn(POWERX_TUTORIAL_WIDGETS, name);
