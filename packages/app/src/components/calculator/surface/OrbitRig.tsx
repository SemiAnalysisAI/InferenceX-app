'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import { PerspectiveCamera, TOUCH, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { fitCameraDistance } from './surfaceScales';

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

/**
 * Default bearing. Only the *direction* of this vector is used — the distance along it
 * is computed from the container's aspect ratio by `fitCameraDistance`, so the same
 * viewpoint frames the box on a tall desktop panel and a narrow phone alike.
 */
export const DEFAULT_CAMERA: [number, number, number] = [2.45, 1.7, 2.85];
export const ORBIT_TARGET: [number, number, number] = [0, 0.05, 0];

/**
 * Move the camera to the fitted distance, keeping whatever bearing it already has.
 *
 * Exported so the double-click reset and the re-fit on resize share one definition;
 * a reset that used the raw `DEFAULT_CAMERA` distance would undo the fit.
 */
export function frameBox(camera: PerspectiveCamera, target: Vector3, bearing?: Vector3): void {
  const direction = (bearing ?? new Vector3().subVectors(camera.position, target)).clone();
  if (direction.lengthSq() === 0) direction.set(...DEFAULT_CAMERA);
  direction.normalize().multiplyScalar(fitCameraDistance(camera.aspect, camera.fov));
  camera.position.copy(target).add(direction);
}

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
  const size = useThree((state) => state.size);

  /**
   * The distance the last fit set. A reader who has zoomed deliberately should not
   * have that undone by an unrelated resize, so a re-fit only applies while the
   * camera is still sitting where the previous fit put it.
   */
  const fittedDistance = useRef<number | null>(null);

  const refit = useCallback(
    (bearing?: Vector3) => {
      const controls = controlsRef.current;
      if (!controls || !(camera instanceof PerspectiveCamera)) return;
      frameBox(camera, controls.target, bearing);
      fittedDistance.current = camera.position.distanceTo(controls.target);
      controls.update();
      invalidate();
    },
    [camera, controlsRef, invalidate],
  );

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

    /**
     * Publish the camera's spherical position on the canvas.
     *
     * The one thing about this view that no other test can see: a WebGL canvas has no
     * DOM to assert on, so "the reader's viewpoint survived" is otherwise untestable —
     * and it has already been broken once, by a rebuilt rig re-framing the camera.
     * Three rounded numbers are enough to catch it and cost one dataset write per
     * change event.
     */
    const publish = () => {
      const offset = camera.position.clone().sub(controls.target);
      domElement.dataset.orbit = [
        Math.atan2(offset.x, offset.z).toFixed(3),
        Math.acos(Math.min(1, Math.max(-1, offset.y / (offset.length() || 1)))).toFixed(3),
        offset.length().toFixed(3),
      ].join(',');
    };

    const onChange = () => {
      publish();
      invalidate();
    };
    const onStart = () => onDragChange(true);
    const onEnd = () => {
      onDragChange(false);
      invalidate();
    };
    const onDoubleClick = () => {
      controls.target.set(...ORBIT_TARGET);
      refit(new Vector3(...DEFAULT_CAMERA));
    };

    controls.addEventListener('change', onChange);
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);
    domElement.addEventListener('dblclick', onDoubleClick);
    // Frame the box on first mount only. This effect also re-runs whenever its inputs
    // change identity, and re-framing there would yank the camera back to the default
    // bearing mid-session — which is what the reader experiences as a drag snapping
    // back the moment they let go.
    if (fittedDistance.current === null) refit(new Vector3(...DEFAULT_CAMERA));
    else invalidate();
    publish();

    return () => {
      controls.removeEventListener('change', onChange);
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      domElement.removeEventListener('dblclick', onDoubleClick);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement, invalidate, reduced, onDragChange, controlsRef, refit]);

  // Re-frame when the container resizes — the fit depends on the aspect ratio, and a
  // fixed distance either pads a tall panel with dead space or crops a narrow one.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || fittedDistance.current === null) return;
    const current = camera.position.distanceTo(controls.target);
    // Left alone if the reader has zoomed since the last fit: their choice wins.
    if (Math.abs(current - fittedDistance.current) > fittedDistance.current * 0.01) return;
    refit();
  }, [size.width, size.height, camera, controlsRef, refit]);

  // Damping needs pumping, and under on-demand rendering the `change` event keeps
  // scheduling frames while momentum bleeds off.
  useFrame(() => {
    const controls = controlsRef.current;
    if (controls?.enableDamping) controls.update();
  });

  return null;
}
