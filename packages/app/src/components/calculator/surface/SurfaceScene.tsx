'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { SurfaceChip, SurfaceGrid } from '../interactivity-surface';
import { isBreakEvenAnchored } from '../lifecycle';

import { buildIsolineArrays } from './buildIsoline';
import { buildSurfaceArrays, cellFromFace } from './buildSurfaceGeometry';
import { OrbitRig } from './OrbitRig';
import { pickAxisEdges, xTickPosition, yTickPosition, zTickPosition } from './pickAxisEdges';
import { darken, lighten } from './surfaceColors';
import { BOX, type SurfaceScales } from './surfaceScales';

/** Where the value-axis title rides on the vertical corner. */
const BOX_TOP = BOX.h * 0.42;

/** One label the DOM overlay draws, positioned per frame by projecting world → screen. */
export interface LabelSpec {
  id: string;
  text: string;
  axis: 'x' | 'y' | 'z';
  /** Data coordinate this label belongs to; world position is derived per frame. */
  world: number;
  /** Axis titles sit at the midpoint of their edge and are pushed further out. */
  title?: boolean;
}

export interface HoverRead {
  chipKey: string;
  ms: number;
  interactivity: number;
  value: number;
  /** The grid cell under the pointer, so the readout can say what was measured. */
  cell: { zi: number; ti: number } | null;
}

export interface ChromePalette {
  axis: string;
  grid: string;
  breakEven: string;
}

interface SurfaceSceneProps {
  grid: SurfaceGrid;
  scales: SurfaceScales;
  chips: SurfaceChip[];
  /** Dims every chip but this one. Null shows all equally. */
  focusedKey: string | null;
  chrome: ChromePalette;
  labels: LabelSpec[];
  labelRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  onHover: (read: HoverRead | null) => void;
  reduced: boolean;
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  draggingRef: React.MutableRefObject<boolean>;
}

/** One chip's shaded surface plus its grid wireframe. */
function ChipSurface({
  chip,
  scales,
  grid,
  dimmed,
}: {
  chip: SurfaceChip;
  scales: SurfaceScales;
  grid: SurfaceGrid;
  dimmed: boolean;
}) {
  const arrays = useMemo(
    () => buildSurfaceArrays(chip.cells, scales, grid.times, grid.zs),
    [chip.cells, scales, grid.times, grid.zs],
  );

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(arrays.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(arrays.index, 1));
    geo.computeBoundingSphere();
    geo.userData.faceToCell = arrays.faceToCell;
    geo.userData.chipKey = chip.key;
    return geo;
  }, [arrays, chip.key]);

  const wireGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(arrays.wireIndex, 1));
    return geo;
  }, [arrays]);

  // Owned here rather than left to R3F: it disposes geometry passed by prop on
  // unmount, and a memo that outlives a remount would then be silently empty.
  useEffect(
    () => () => {
      geometry.dispose();
      wireGeometry.dispose();
    },
    [geometry, wireGeometry],
  );

  if (arrays.index.length === 0) return null;

  return (
    <group>
      <mesh geometry={geometry} dispose={null} userData={{ chipKey: chip.key }}>
        {/*
          Opaque on purpose. Transparent surfaces sort per object by distance to
          their bounding-sphere centre, and five surfaces spanning one volume have
          near-identical centres — so the order flips mid-rotation and they visibly
          pop in front of each other. Per-fragment depth is honest instead. The one
          transparency here is the dimming of unfocused chips, which is a single
          group and so sorts correctly.
        */}
        <meshStandardMaterial
          color={chip.color}
          roughness={0.62}
          metalness={0}
          side={THREE.DoubleSide}
          transparent={dimmed}
          opacity={dimmed ? 0.16 : 1}
          depthWrite={!dimmed}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      {/*
        Explicit grid edges, never `material.wireframe` — that draws triangulation
        diagonals too. The grid is what tells the reader the surface is sampled,
        and it makes each hole's boundary legible as terminating lines.
      */}
      <lineSegments geometry={wireGeometry} dispose={null}>
        <lineBasicMaterial
          color={darken(chip.color, 0.45)}
          transparent
          opacity={dimmed ? 0.1 : 0.5}
        />
      </lineSegments>
    </group>
  );
}

/** The bright cord at the slider's interactivity. */
function Isoline({
  chip,
  grid,
  scales,
  dimmed,
}: {
  chip: SurfaceChip;
  grid: SurfaceGrid;
  scales: SurfaceScales;
  dimmed: boolean;
}) {
  const geometry = useMemo(() => {
    const positions = buildIsolineArrays({
      cells: chip.cells,
      times: grid.times,
      zs: grid.zs,
      currentZ: grid.currentZ,
      scales,
    });
    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.computeBoundingSphere();
    return geo;
  }, [chip.cells, grid.times, grid.zs, grid.currentZ, scales]);

  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry || dimmed) return null;

  return (
    <mesh geometry={geometry} renderOrder={10} dispose={null}>
      {/*
        Drawn through the surfaces (`depthTest: false`) deliberately: it is an
        annotation of where the 2D chart is looking, not another piece of terrain.
      */}
      <meshBasicMaterial
        color={lighten(chip.color, 0.45)}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** Box frame, break-even plane, and the outline of the current-interactivity slice. */
function Chrome({
  grid,
  scales,
  chrome,
}: {
  grid: SurfaceGrid;
  scales: SurfaceScales;
  chrome: ChromePalette;
}) {
  const frame = useMemo(() => {
    const { w, h, d } = BOX;
    const [x0, x1] = [-w / 2, w / 2];
    const [y0, y1] = [-h / 2, h / 2];
    const [z0, z1] = [-d / 2, d / 2];
    const corners: [number, number, number][] = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1],
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ];
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    const positions = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => {
      positions.set(corners[a]!, i * 6);
      positions.set(corners[b]!, i * 6 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  const sliceOutline = useMemo(() => {
    const z = scales.zOf(Math.max(grid.zs[0]!, Math.min(grid.zs.at(-1)!, grid.currentZ)));
    const { w, h } = BOX;
    const ring: [number, number, number][] = [
      [-w / 2, -h / 2, z],
      [w / 2, -h / 2, z],
      [w / 2, h / 2, z],
      [-w / 2, h / 2, z],
    ];
    const positions = new Float32Array(ring.length * 6);
    ring.forEach((point, i) => {
      positions.set(point, i * 6);
      positions.set(ring[(i + 1) % ring.length]!, i * 6 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [grid.currentZ, grid.zs, scales]);

  useEffect(
    () => () => {
      frame.dispose();
      sliceOutline.dispose();
    },
    [frame, sliceOutline],
  );

  return (
    <group>
      <lineSegments geometry={frame} dispose={null}>
        <lineBasicMaterial color={chrome.grid} transparent opacity={0.35} />
      </lineSegments>
      <lineSegments geometry={sliceOutline} dispose={null}>
        <lineBasicMaterial color={chrome.axis} transparent opacity={0.5} />
      </lineSegments>
      {/*
        Break-even, positioned wherever value 0 falls in the box — which is *not*
        world y 0 unless the margin range happens to straddle zero symmetrically.
        depthWrite:false means it tints what is behind it without ever occluding a
        surface.

        Margin only. On a revenue grid nothing is subtracted, so zero is the floor
        of the axis rather than a threshold anything crosses; a plane there would
        read as a break-even line the reader could compare against, which is
        exactly the wrong inference to invite.
      */}
      {isBreakEvenAnchored(grid.metric) && (
        <mesh position={[0, scales.yOf(0), 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <planeGeometry args={[BOX.w, BOX.d]} />
          <meshBasicMaterial
            color={chrome.breakEven}
            transparent
            opacity={0.13}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

/** Projects each label's world position to screen space and writes it to the DOM. */
function AxisLabels({
  labels,
  labelRefs,
  scales,
}: {
  labels: LabelSpec[];
  labelRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  scales: SurfaceScales;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const scratch = useRef(new THREE.Vector3());

  useFrame(() => {
    const edges = pickAxisEdges(Math.atan2(camera.position.x, camera.position.z));
    for (const [i, label] of labels.entries()) {
      const element = labelRefs.current[i];
      if (!element) continue;

      // Titles sit at the midpoint of their edge but much further out, which is
      // what separates them from the ticks sharing that edge in screen space.
      let position: { x: number; y: number; z: number };
      const offset = label.title ? 0.42 : 0.09;
      if (label.axis === 'x') {
        position = xTickPosition(label.title ? 0 : scales.xOf(label.world), edges, offset);
      } else if (label.axis === 'z') {
        position = zTickPosition(label.title ? 0 : scales.zOf(label.world), edges, offset);
      } else {
        // The value title goes near the top of the vertical corner; at mid-height it
        // lands among the interactivity ticks near the floor.
        position = yTickPosition(
          label.title ? BOX_TOP : scales.yOf(label.world),
          edges,
          label.title ? 0.3 : offset,
        );
      }

      const projected = scratch.current.set(position.x, position.y, position.z).project(camera);
      if (projected.z > 1) {
        element.style.visibility = 'hidden';
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      element.style.visibility = 'visible';
      element.style.transform = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  });

  return null;
}

/** Pointer → surface intersection, coalesced to one raycast per frame. */
function HoverProbe({
  scales,
  onHover,
  draggingRef,
}: {
  scales: SurfaceScales;
  onHover: (read: HoverRead | null) => void;
  draggingRef: React.MutableRefObject<boolean>;
}) {
  const { camera, gl, scene, raycaster } = useThree();

  useEffect(() => {
    const element = gl.domElement;
    const pointer = new THREE.Vector2();
    let queued = 0;
    let clientX = 0;
    let clientY = 0;

    const probe = () => {
      queued = 0;
      if (draggingRef.current) return;
      const rect = element.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const meshes: THREE.Mesh[] = [];
      scene.traverse((node) => {
        if ((node as THREE.Mesh).isMesh && node.userData.chipKey) meshes.push(node as THREE.Mesh);
      });
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (!hit) {
        onHover(null);
        return;
      }
      const geometry = (hit.object as THREE.Mesh).geometry as THREE.BufferGeometry;
      const faceToCell = geometry.userData.faceToCell as Uint32Array | undefined;
      onHover({
        chipKey: String(hit.object.userData.chipKey),
        ms: scales.msOf(hit.point.x),
        interactivity: scales.interactivityOf(hit.point.z),
        value: scales.valueOf(hit.point.y),
        cell:
          hit.faceIndex === undefined || hit.faceIndex === null || !faceToCell
            ? null
            : cellFromFace(faceToCell, hit.faceIndex),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      // Three independent guards, because any one alone leaks a tooltip mid-drag:
      // the controls' own start/end flag, a held button (covers drags that began
      // off-canvas), and pointerleave below.
      if (event.buttons !== 0 || draggingRef.current) {
        onHover(null);
        return;
      }
      clientX = event.clientX;
      clientY = event.clientY;
      if (!queued) queued = requestAnimationFrame(probe);
    };
    const onPointerLeave = () => onHover(null);

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    return () => {
      if (queued) cancelAnimationFrame(queued);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [camera, gl, scene, raycaster, scales, onHover, draggingRef]);

  return null;
}

export function SurfaceScene({
  grid,
  scales,
  chips,
  focusedKey,
  chrome,
  labels,
  labelRefs,
  onHover,
  reduced,
  controlsRef,
  draggingRef,
}: SurfaceSceneProps) {
  const invalidate = useThree((state) => state.invalidate);
  // Stable, because `OrbitRig` rebuilds its controls when this identity changes and a
  // rebuilt rig re-frames the camera. An inline closure here would throw away the
  // reader's viewpoint on any re-render — the hover readout alone causes several.
  const onDragChange = useCallback(
    (dragging: boolean) => {
      draggingRef.current = dragging;
    },
    [draggingRef],
  );

  // On-demand rendering: repaint when the data or the palette changes, not on a loop.
  useEffect(() => invalidate(), [invalidate, grid, chips, chrome, focusedKey]);

  return (
    <>
      {/*
        Fixed, neutral lighting. Driving the hemisphere from the page background
        made every surface muddy in dark mode — the theme belongs on the chrome
        (axes, ticks, the break-even plane), not on the illumination, or a chip's
        colour stops meaning the same thing in the two themes.
      */}
      <hemisphereLight args={['#ffffff', '#606060', 0.85]} />
      <directionalLight position={[4, 6, 3]} intensity={0.9} />
      <directionalLight position={[-4, -1, -3]} intensity={0.35} />

      <OrbitRig reduced={reduced} onDragChange={onDragChange} controlsRef={controlsRef} />
      <Chrome grid={grid} scales={scales} chrome={chrome} />

      {chips.map((chip) => (
        <ChipSurface
          key={chip.key}
          chip={chip}
          scales={scales}
          grid={grid}
          dimmed={focusedKey !== null && focusedKey !== chip.key}
        />
      ))}
      {chips.map((chip) => (
        <Isoline
          key={`iso-${chip.key}`}
          chip={chip}
          grid={grid}
          scales={scales}
          dimmed={focusedKey !== null && focusedKey !== chip.key}
        />
      ))}

      <AxisLabels labels={labels} labelRefs={labelRefs} scales={scales} />
      <HoverProbe scales={scales} onHover={onHover} draggingRef={draggingRef} />
    </>
  );
}
