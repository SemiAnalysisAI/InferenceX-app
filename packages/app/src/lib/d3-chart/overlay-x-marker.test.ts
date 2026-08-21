// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { overlayMarkerPosition } from './overlay-x-marker';

describe('overlayMarkerPosition', () => {
  it.each([
    ['translate(12.5,34)', { x: 12.5, y: 34 }],
    ['translate(-8 9.25)', { x: -8, y: 9.25 }],
  ])('reads the marker position from %s', (transform, expected) => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    marker.setAttribute('transform', transform);

    expect(overlayMarkerPosition(marker)).toEqual(expected);
  });

  it('returns null for missing or non-numeric translations', () => {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    expect(overlayMarkerPosition(marker)).toBeNull();
    marker.setAttribute('transform', 'translate(nope,10)');
    expect(overlayMarkerPosition(marker)).toBeNull();
  });
});
