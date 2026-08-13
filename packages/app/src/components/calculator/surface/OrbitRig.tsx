'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { TOUCH } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Camera + rotation.
 *
 * Uses three's own `OrbitControls` rather than a hand-rolled drag handler, and
 * imperatively rather than through R3F's `extend()`. Two reasons:
 *
 * - Hand-rolling the spherical maths is the easy part; what breaks is everything
 *   around it — pointer capture so a drag that leaves the canvas keeps tracking,
 *   two-finger pinch bookkeeping, and `deltaMode` normalisation (Firefox reports
 *   wheel deltas in lines, not pixels). `three` is already a dependency, so this
 *   costs no new package.
 * - `OrbitControls` extends `Controls`/`EventDispatcher`, not `Object3D`, so it is
 *   not a scene-graph node; declaring it as JSX makes R3F reconcile something that
 *   cannot be attached. Imperative also lets us hook its `change` event to
 *   `invalidate()`, which is what makes on-demand rendering work at all.
 */

export const DEFAULT_CAMERA: [number, number, number] = [2.45, 1.7, 2.85];
export const ORBIT_TARGET: [number, number, number] = [0, 0.05, 0];

/**
 * OrbitControls has no "this gesture does nothing" constant; its touch handler
 * switches on the value and falls through to no-op for anything it does not
 * recognise. So a sentinel is how a one-finger drag is left to the page.
 */
const TOUCH_NONE = -1 as unknown as (typeof TOUCH)['ROTATE'];

/**
 * Elevation limits. The upper bound stops just short of horizontal so the reader is
 * always looking slightly *down* at the surfaces — cross below it and the floor
 * flips overhead, which loses all orientation with nothing on screen to recover it.
 */
const MIN_POLAR = 0.2;
const MAX_POLAR = Math.PI / 2 - 0.06;

interface OrbitRigProps {
  /** Suppresses inertial glide after release. */
  reduced: boolean;
  onDragChange: (dragging: boolean) => void;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
}

export function OrbitRig({ reduced, onDragChange, controlsRef }: OrbitRigProps) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    controlsRef.current = controls;

    controls.target.set(...ORBIT_TARGET);
    // Panning slides the box out of frame with no way back except a reset, and the
    // reader has no use for it — rotation and distance are the whole interaction.
    controls.enablePan = false;
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.minDistance = 1.4;
    controls.maxDistance = 9;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.6;
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.12;
    // One finger scrolls the page, two fingers orbit. OrbitControls otherwise sets
    // touch-action: none and traps a phone reader inside the chart.
    controls.touches.ONE = TOUCH_NONE;
    controls.touches.TWO = TOUCH.DOLLY_ROTATE;
    domElement.style.touchAction = 'pan-y';

    const onChange = () => invalidate();
    const onStart = () => onDragChange(true);
    const onEnd = () => {
      onDragChange(false);
      invalidate();
    };
    const onDoubleClick = () => {
      camera.position.set(...DEFAULT_CAMERA);
      controls.target.set(...ORBIT_TARGET);
      controls.update();
      invalidate();
    };

    controls.addEventListener('change', onChange);
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    domElement.addEventListener('dblclick', onDoubleClick);
    invalidate();

    return () => {
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      domElement.removeEventListener('dblclick', onDoubleClick);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement, invalidate, reduced, onDragChange, controlsRef]);

  // Damping needs pumping, and under on-demand rendering the `change` event keeps
  // scheduling frames while momentum bleeds off.
  useFrame(() => {
    const controls = controlsRef.current;
    if (controls?.enableDamping) controls.update();
  });

  return null;
}
