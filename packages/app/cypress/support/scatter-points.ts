import type { InferenceData } from '@/components/inference/types';
import {
  CANVAS_POINT_LAYER_SELECTOR,
  POINT_HIT_AREA_CLASS,
  POINT_LABEL_ANCHOR_CLASS,
  POINTS_JOINED_ATTRIBUTE,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import type {
  CanvasPointLayerElement,
  ScatterPointSnapshot,
} from '@/lib/d3-chart/layers/canvas-points';

export const SCATTER_GRAPH = '[data-testid="scatter-graph"]';
export const JOINED_POINT_LAYER = `${CANVAS_POINT_LAYER_SELECTOR}:not([${POINTS_JOINED_ATTRIBUTE}="0"])`;
export const POINT_LABELS = `.${POINT_LABEL_ANCHOR_CLASS} .point-label`;

export interface ScatterPoint extends ScatterPointSnapshot<InferenceData> {
  hitArea: Element;
}

declare global {
  namespace Cypress {
    interface Chainable {
      scatterPoints: (scope?: string) => Chainable<ScatterPoint[]>;
    }
  }
}

export function pointsIn(scope: JQuery | Element): ScatterPoint[] {
  return Cypress.$(scope)
    .find(CANVAS_POINT_LAYER_SELECTOR)
    .toArray()
    .flatMap((element) => {
      const layer = element as unknown as CanvasPointLayerElement;
      const hitArea = layer.querySelector(`.${POINT_HIT_AREA_CLASS}`)!;
      return (layer.scatterPoints?.() ?? []).map((point) => ({
        ...(point as ScatterPointSnapshot<InferenceData>),
        hitArea,
      }));
    });
}

export function registerScatterPointsQuery(): void {
  if ('scatterPoints' in cy) return;
  Cypress.Commands.addQuery(
    'scatterPoints',
    (scope: string = SCATTER_GRAPH) =>
      () =>
        pointsIn(Cypress.$(scope)),
  );
}

export const visiblePoints = (points: ScatterPoint[]): ScatterPoint[] =>
  points.filter((point) => point.opacity !== 0);

export function expectHwKeyPoints(prefix: string, exist: boolean, scope = SCATTER_GRAPH): void {
  cy.scatterPoints(scope).should((points) => {
    const found = points.some((point) => String(point.datum.hwKey).startsWith(prefix));
    expect(found, `${prefix}* points`).to.equal(exist);
  });
}

export function expectHwKeyOpacity(hwKey: string, opacity: number): void {
  cy.scatterPoints().should((points) => {
    const point = points.find((candidate) => candidate.datum.hwKey === hwKey);
    expect(point?.opacity, `${hwKey} opacity`).to.equal(opacity);
  });
}

export function triggerAtPoint(point: ScatterPoint, event: 'mousemove' | 'click'): void {
  cy.wrap(point.hitArea).trigger(event, {
    clientX: point.clientX,
    clientY: point.clientY,
    force: true,
    scrollBehavior: false,
  });
}

export function clickScatterPoint(point: ScatterPoint): void {
  triggerAtPoint(point, 'mousemove');
  triggerAtPoint(point, 'click');
}
