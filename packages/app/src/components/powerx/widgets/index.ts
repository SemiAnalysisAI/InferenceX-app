import type { TutorialWidgets } from '@/components/tutorial/widget-chrome';

import { FlowWidget } from './flow-widget';
import { LadderWidget } from './ladder-widget';
import { LoadWidget } from './load-widget';
import { MeasuredVsModeledWidget } from './measured-vs-modeled-widget';
import { RunConfigWidget } from './run-config-widget';
import { ValidityWidget } from './validity-widget';
import { WorkedExampleWidget } from './worked-example-widget';

/** Widgets the tutorial mounts with `<Widget name="<key>" alt="…" />`, at the declared layout. */
export const POWERX_TUTORIAL_WIDGETS = {
  ladder: { component: LadderWidget, layout: 'bleed' },
  flow: { component: FlowWidget, layout: 'bleed' },
  'measured-vs-modeled': { component: MeasuredVsModeledWidget, layout: 'bleed' },
  load: { component: LoadWidget, layout: 'column' },
  validity: { component: ValidityWidget, layout: 'column' },
  'run-config': { component: RunConfigWidget, layout: 'column' },
  'worked-example': { component: WorkedExampleWidget, layout: 'column' },
} as const satisfies TutorialWidgets;
