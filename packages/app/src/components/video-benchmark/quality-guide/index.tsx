import {
  type TutorialWidgets,
  WidgetFrame,
  type WidgetProps,
} from '@/components/tutorial/widget-chrome';
import type { ReferencePsnrEvidence } from '@/lib/video/reference-psnr-evidence';

import { MethodDiagram } from '../QualityMethod';
import { ReferencePsnrWidget } from './reference-psnr-widget';
import { TradeoffWidget } from './tradeoff-widget';

/** The dashboard's own diagram, so the guide and "How we score quality" never disagree. */
function MethodWidget({ locale, alt }: WidgetProps) {
  return (
    <WidgetFrame scope="video" name="method" alt={alt}>
      <MethodDiagram locale={locale} />
    </WidgetFrame>
  );
}

/**
 * Widgets the quality guide mounts with `<Widget name="<key>" alt="…" />`. The reference PSNR
 * chart takes the scores the page read on the server.
 */
export function videoQualityGuideWidgets(evidence: ReferencePsnrEvidence) {
  function ReferencePsnr(props: WidgetProps) {
    return <ReferencePsnrWidget {...props} evidence={evidence} />;
  }
  return {
    'reference-psnr': { component: ReferencePsnr, layout: 'bleed' },
    method: { component: MethodWidget, layout: 'bleed' },
    tradeoff: { component: TradeoffWidget, layout: 'bleed' },
  } as const satisfies TutorialWidgets;
}
