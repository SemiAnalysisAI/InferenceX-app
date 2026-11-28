/**
 * Brick Studio drawing: one WebGL canvas with a studded baseplate, the pieces, the piece in
 * hand, the booklet's outline of the next piece, an orbit camera and picking. Rules live in
 * `lego-studio-model.ts`. Everything made here is released again in `dispose()`.
 */
import * as THREE from 'three';

import {
  BOARD,
  COLOURS,
  PARTS,
  footprint,
  type Part,
  type Piece,
  type PieceSpec,
  type Turn,
} from './lego-studio-model';

/** World height of one plate; a stud is one unit wide. */
const PLATE_H = 0.4;
const STUD_R = 0.3;
const STUD_H = 0.18;
/** Hairline left between neighbours so the joints read as joints. */
const GAP = 0.03;
const HALF = BOARD / 2;
const THUMB_W = 112;
const THUMB_H = 84;

export interface Pick {
  x: number;
  z: number;
  /** Piece under the pointer, if it is on one. */
  piece?: number;
  /** The pointer is on the booklet's outline of the next piece. */
  onTarget?: boolean;
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const flat = part.index ? part.toNonIndexed() : part;
    for (const value of flat.getAttribute('position').array) positions.push(value);
    for (const value of flat.getAttribute('normal').array) normals.push(value);
    if (flat !== part) flat.dispose();
    part.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

/** One part, centred on its footprint, standing on y = 0, with the slope falling towards +z. */
function partGeometry(index: number): THREE.BufferGeometry {
  const part = PARTS[index];
  const height = part.h * PLATE_H - GAP / 2;
  const shapes: THREE.BufferGeometry[] = [];
  const stud = (i: number, j: number) => {
    const geometry = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
    geometry.translate(i + 0.5 - part.w / 2, height + STUD_H / 2, j + 0.5 - part.d / 2);
    shapes.push(geometry);
  };
  if (part.kind === 'round' || part.kind === 'cone') {
    const body = new THREE.CylinderGeometry(part.kind === 'cone' ? 0.3 : 0.47, 0.47, height, 28);
    body.translate(0, height / 2, 0);
    shapes.push(body);
    stud(0, 0);
  } else if (part.kind === 'slope') {
    // Side view, drawn with x pointing to the back of the part, then pushed out sideways.
    const half = part.d / 2 - GAP / 2;
    const outline = new THREE.Shape();
    outline.moveTo(half, 0);
    outline.lineTo(-half, 0);
    outline.lineTo(-half, 0.3);
    outline.lineTo(half - 1, height);
    outline.lineTo(half, height);
    outline.closePath();
    const depth = part.w - GAP;
    const body = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false });
    body.rotateY(Math.PI / 2);
    body.translate(-depth / 2, 0, 0);
    body.deleteAttribute('uv');
    shapes.push(body);
    for (let i = 0; i < part.w; i++) stud(i, 0);
  } else {
    const body = new THREE.BoxGeometry(part.w - GAP, height, part.d - GAP);
    body.translate(0, height / 2, 0);
    body.deleteAttribute('uv');
    shapes.push(body);
    if (part.kind !== 'tile')
      for (let i = 0; i < part.w; i++) for (let j = 0; j < part.d; j++) stud(i, j);
  }
  for (const shape of shapes) shape.deleteAttribute('uv');
  return mergeGeometries(shapes);
}

/** The printed top of a GPU tile: a board, a die, pins. Plain shapes, drawn here. */
function gpuTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0c5a2a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#d6b24a';
    for (let pin = 0; pin < 9; pin++) {
      ctx.fillRect(14 + pin * 12, 6, 6, 12);
      ctx.fillRect(14 + pin * 12, 110, 6, 12);
      ctx.fillRect(6, 14 + pin * 12, 12, 6);
      ctx.fillRect(110, 14 + pin * 12, 12, 6);
    }
    ctx.fillStyle = '#c8ccd0';
    ctx.fillRect(28, 28, 72, 72);
    ctx.fillStyle = '#23262b';
    ctx.fillRect(40, 40, 48, 48);
    ctx.fillStyle = '#76b900';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GPU', 64, 65);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Falling {
  object: THREE.Object3D;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
}

/** Emissive strength of the clear pieces once a build is powered on. */
const POWER_GLOW = 1.6;
/** Seconds the lights take to come up. */
const POWER_SHOW = 1.8;
/** Radians a second of the lap the camera takes round a build that has just powered on. */
const LAP_SPEED = 1.6;

/** A frame slower than this, this many times in a row, drops the view to low detail. */
const SLOW_FRAME_MS = 100;
const SLOW_FRAMES = 6;
const HIDDEN_GAP_MS = 2000;
const LOW_SCALE = 0.5;
/** Set once a view has dropped to low detail: the next one on this page starts there. */
let slowDevice = false;

export class StudioRenderer {
  private readonly canvas: HTMLCanvasElement;
  /** Reduced motion: nothing drops, pulses or flies. */
  private readonly still: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.5, 200);
  private readonly raycaster = new THREE.Raycaster();
  private readonly geometries = new Map<number, THREE.BufferGeometry>();
  private readonly outlines = new Map<number, THREE.BufferGeometry>();
  private readonly ink: THREE.LineBasicMaterial;
  private readonly materials = new Map<number, THREE.MeshStandardMaterial>();
  private readonly objects = new Map<number, THREE.Mesh>();
  private readonly pickables: THREE.Object3D[] = [];
  private readonly owned: { dispose: () => void }[] = [];
  private readonly ground: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly ghostMaterial: THREE.MeshStandardMaterial;
  private readonly target: THREE.Mesh;
  private readonly targetMaterial: THREE.MeshStandardMaterial;
  private readonly targetEdges: THREE.LineSegments;
  private readonly marked: THREE.Mesh;
  private readonly print: THREE.CanvasTexture;
  private readonly printMaterial: THREE.MeshStandardMaterial;
  private readonly printGeometry: THREE.PlaneGeometry;
  private readonly drops = new Map<THREE.Object3D, { from: number; to: number; age: number }>();
  private targetSpec: PieceSpec | null = null;
  private falling: Falling[] = [];
  private fallingAge = 0;
  private afterFall: (() => void) | undefined;
  private azimuth = 0.7;
  /** A heading the camera is on its way to. */
  private turnTo: number | undefined;
  /** Radians of the power-on lap still to turn. */
  private lap = 0;
  private powered = false;
  /** Seconds since the lights came on; past `POWER_SHOW` they hold steady. */
  private poweredFor = POWER_SHOW;
  private polar = 1.02;
  private distance = 29;
  private readonly focus = new THREE.Vector3(0, 2, 0);
  private readonly sun: THREE.DirectionalLight;
  /** Drawn frames in a row that took longer than SLOW_FRAME_MS to come round. */
  private slowFrames = 0;
  private drew = false;
  private low = false;
  private lowListener: (() => void) | undefined;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, still: boolean) {
    this.canvas = canvas;
    this.still = still;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color('#bfe3f7');

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7f8fa0', 1.05));
    const sun = new THREE.DirectionalLight('#ffffff', 2.3);
    this.sun = sun;
    sun.position.set(9, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    // Pieces are inked along their edges, the way an instruction page draws them.
    this.ink = this.own(
      new THREE.LineBasicMaterial({ color: '#14161a', transparent: true, opacity: 0.42 }),
    );

    // Table, baseplate, and its studs.
    const table = new THREE.Mesh(
      this.own(new THREE.CircleGeometry(14.5, 64)),
      this.own(new THREE.MeshStandardMaterial({ color: '#f4f8fb', roughness: 0.9 })),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.25;
    table.receiveShadow = true;
    this.scene.add(table);
    const plateMaterial = this.own(
      new THREE.MeshStandardMaterial({ color: '#00852b', roughness: 0.4 }),
    );
    this.ground = new THREE.Mesh(
      this.own(new THREE.BoxGeometry(BOARD, 0.24, BOARD)),
      plateMaterial,
    );
    this.ground.position.y = -0.12;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.pickables.push(this.ground);
    const studs = new THREE.InstancedMesh(
      this.own(new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 16)),
      plateMaterial,
      BOARD * BOARD,
    );
    const place = new THREE.Matrix4();
    for (let i = 0; i < BOARD; i++)
      for (let j = 0; j < BOARD; j++) {
        place.makeTranslation(i + 0.5 - HALF, STUD_H / 2, j + 0.5 - HALF);
        studs.setMatrixAt(i * BOARD + j, place);
      }
    studs.receiveShadow = true;
    this.scene.add(studs);
    this.owned.push(studs);

    // The piece in hand.
    this.ghostMaterial = this.own(
      new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.6, depthWrite: false }),
    );
    this.ghost = new THREE.Mesh(this.geometry(0), this.ghostMaterial);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    // Where the booklet wants the next piece.
    this.targetMaterial = this.own(
      new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        emissive: '#ffffff',
        emissiveIntensity: 0.35,
      }),
    );
    this.target = new THREE.Mesh(this.geometry(0), this.targetMaterial);
    this.target.visible = false;
    this.scene.add(this.target);
    this.targetEdges = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      this.own(new THREE.LineBasicMaterial({ color: '#181716' })),
    );
    this.targetEdges.visible = false;
    this.scene.add(this.targetEdges);

    // The piece the separator is about to lift.
    this.marked = new THREE.Mesh(
      this.geometry(0),
      this.own(
        new THREE.MeshBasicMaterial({
          color: '#ff7a00',
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      ),
    );
    this.marked.visible = false;
    this.marked.scale.setScalar(1.04);
    this.scene.add(this.marked);

    this.print = gpuTexture();
    this.printMaterial = this.own(new THREE.MeshStandardMaterial({ map: this.print }));
    this.printGeometry = this.own(new THREE.PlaneGeometry(1.8, 1.8));
    this.printGeometry.rotateX(-Math.PI / 2);

    this.placeCamera();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ pieces

  addPiece(piece: Piece, animate: boolean): void {
    const mesh = this.build(piece);
    mesh.userData.piece = piece.id;
    mesh.userData.top = (piece.y + PARTS[piece.part].h) * PLATE_H;
    this.objects.set(piece.id, mesh);
    this.pickables.push(mesh);
    this.scene.add(mesh);
    if (animate && !this.still) {
      const to = mesh.position.y;
      mesh.position.y = to + 1.4;
      this.drops.set(mesh, { from: to + 1.4, to, age: 0 });
    }
    this.dirty = true;
  }

  removePiece(id: number): void {
    const mesh = this.objects.get(id);
    if (!mesh) return;
    this.objects.delete(id);
    this.drops.delete(mesh);
    const at = this.pickables.indexOf(mesh);
    if (at !== -1) this.pickables.splice(at, 1);
    this.scene.remove(mesh);
    if (this.marked.userData.piece === id) this.marked.visible = false;
    this.dirty = true;
  }

  clearPieces(): void {
    for (const id of this.objects.keys()) this.removePiece(id);
  }

  /** Everything flies apart and falls off the table, then `done` runs. */
  crumble(done: () => void): void {
    this.marked.visible = false;
    if (this.still || this.objects.size === 0) {
      this.clearPieces();
      done();
      return;
    }
    this.falling = [...this.objects.values()].map((object) => ({
      object,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 9 + object.position.x * 0.6,
        3 + Math.random() * 7,
        (Math.random() - 0.5) * 9 + object.position.z * 0.6,
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 9,
      ),
    }));
    this.objects.clear();
    this.drops.clear();
    this.pickables.length = 0;
    this.pickables.push(this.ground);
    this.fallingAge = 0;
    this.afterFall = done;
  }

  // ------------------------------------------------------------------ helpers shown

  /** The piece in hand, tinted red where it cannot go. Pass null to hide it. */
  setGhost(spec: PieceSpec | null, fits = true): void {
    this.ghost.visible = spec !== null;
    if (spec) {
      this.pose(this.ghost, spec);
      this.ghostMaterial.color.set(fits ? COLOURS[spec.colour].hex : '#ff2a2a');
      this.ghostMaterial.opacity = fits ? 0.62 : 0.45;
    }
    this.dirty = true;
  }

  /** The booklet's outline of where the next piece goes. Pass null to hide it. */
  setTarget(spec: PieceSpec | null): void {
    this.targetSpec = spec;
    this.target.visible = spec !== null;
    this.targetEdges.visible = spec !== null;
    if (spec) {
      this.pose(this.target, spec);
      this.targetMaterial.color.set(COLOURS[spec.colour].hex);
      const [fw, fd] = footprint(spec.part, spec.turn);
      const height = PARTS[spec.part].h * PLATE_H;
      const box = new THREE.BoxGeometry(fw + 0.06, height + 0.06, fd + 0.06);
      this.targetEdges.geometry.dispose();
      this.targetEdges.geometry = new THREE.EdgesGeometry(box);
      box.dispose();
      this.targetEdges.position.set(
        spec.x + fw / 2 - HALF,
        spec.y * PLATE_H + height / 2,
        spec.z + fd / 2 - HALF,
      );
    }
    this.dirty = true;
  }

  /** Marks the piece the separator would lift. Pass null to clear. */
  mark(piece: Piece | null): void {
    this.marked.visible = piece !== null;
    this.marked.userData.piece = piece?.id;
    if (piece) this.pose(this.marked, piece);
    this.dirty = true;
  }

  // ------------------------------------------------------------------ picking

  /** The stud column under a point of the page, and the piece there if any. */
  pick(clientX: number, clientY: number): Pick | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const point = new THREE.Vector2(
      ((clientX - box.left) / box.width) * 2 - 1,
      -((clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(point, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (this.targetSpec) {
      // The outline floats in front of what it will sit on, so it is tested on its own.
      const outline = this.raycaster.intersectObject(this.target, false)[0];
      if (outline && (!hit || outline.distance < hit.distance))
        return { x: this.targetSpec.x, z: this.targetSpec.z, onTarget: true };
    }
    if (!hit?.face) return null;
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    const piece = hit.object.userData.piece as number | undefined;
    const top = (hit.object.userData.top as number | undefined) ?? 0;
    // A hit on a wall means the column beside it; a hit on top, or on a stud, means this one.
    const onTop = normal.y > 0.5 || hit.point.y > top - 0.02;
    const reach = onTop ? 0 : 0.5;
    const x = Math.floor(hit.point.x + normal.x * reach + HALF);
    const z = Math.floor(hit.point.z + normal.z * reach + HALF);
    if (x < 0 || z < 0 || x >= BOARD || z >= BOARD) return null;
    return { x, z, piece };
  }

  /** Where a piece is on the page, for the studs that fly out of it. */
  screenOf(spec: PieceSpec): { x: number; y: number } {
    const [fw, fd] = footprint(spec.part, spec.turn);
    const point = new THREE.Vector3(
      spec.x + fw / 2 - HALF,
      (spec.y + PARTS[spec.part].h) * PLATE_H,
      spec.z + fd / 2 - HALF,
    ).project(this.camera);
    const box = this.canvas.getBoundingClientRect();
    return {
      x: box.left + ((point.x + 1) / 2) * box.width,
      y: box.top + ((1 - point.y) / 2) * box.height,
    };
  }

  // ------------------------------------------------------------------ camera

  orbit(turn: number, tilt: number): void {
    this.turnTo = undefined;
    this.lap = 0;
    this.azimuth += turn;
    this.polar = Math.min(1.5, Math.max(0.18, this.polar + tilt));
    this.placeCamera();
  }

  zoom(factor: number): void {
    this.distance = Math.min(56, Math.max(11, this.distance * factor));
    this.placeCamera();
  }

  /**
   * Lights the clear pieces of a finished build, or puts them out. With `show` they flicker up
   * while the camera takes one slow lap; with reduced motion they are simply lit. Returns how
   * many seconds the show runs for.
   */
  power(on: boolean, show = false): number {
    this.powered = on;
    this.lap = 0;
    this.poweredFor = POWER_SHOW;
    this.glow(on ? POWER_GLOW : 0);
    if (!on || !show || this.still) return 0;
    this.poweredFor = 0;
    this.turnTo = undefined;
    this.lap = Math.PI * 2;
    return this.lap / LAP_SPEED;
  }

  /** Walks the camera round to a heading, the short way. With reduced motion it is just there. */
  face(azimuth: number): void {
    this.lap = 0;
    const turn = Math.atan2(Math.sin(azimuth - this.azimuth), Math.cos(azimuth - this.azimuth));
    if (this.still || Math.abs(turn) < 0.02) {
      this.turnTo = undefined;
      this.azimuth += turn;
      this.placeCamera();
    } else {
      this.turnTo = this.azimuth + turn;
    }
  }

  resetView(): void {
    this.turnTo = undefined;
    this.lap = 0;
    this.azimuth = 0.7;
    this.polar = 1.02;
    this.distance = 29;
    this.placeCamera();
  }

  /** Which way the camera faces, in quarter turns, so arrow keys can follow the view. */
  quarter(): number {
    return ((Math.round(this.azimuth / (Math.PI / 2)) % 4) + 4) % 4;
  }

  private pixelRatio(): number {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    return this.low ? Math.max(0.5, ratio * LOW_SCALE) : ratio;
  }

  /** Told once, when the view drops to low detail because frames stay slow. */
  onLowDetail(listener: () => void): void {
    this.lowListener = listener;
    if (slowDevice) this.lowDetail();
    else if (this.low) listener();
  }

  /** Slow device: no shadows and a coarser picture, so the build stays playable. */
  private lowDetail(): void {
    if (this.low) return;
    this.low = true;
    slowDevice = true;
    this.sun.castShadow = false;
    this.renderer.shadowMap.enabled = false;
    this.scene.traverse((object) => {
      const { material } = object as THREE.Mesh;
      for (const entry of Array.isArray(material) ? material : [material]) {
        if (entry) entry.needsUpdate = true;
      }
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.dirty = true;
    this.lowListener?.();
  }

  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Keep the whole baseplate in view on tall, narrow screens.
    this.camera.fov = width < height ? 34 + Math.min(22, (height / width - 1) * 26) : 34;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  // ------------------------------------------------------------------ part pictures

  /**
   * Small pictures of the listed parts in one colour, at their part index, with an empty
   * string for the parts not asked for. Empty if the canvas cannot be read.
   */
  thumbnails(colour: number, only: readonly number[]): string[] {
    const target = new THREE.WebGLRenderTarget(THUMB_W * 2, THUMB_H * 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#7f8fa0', 1.05));
    const light = new THREE.DirectionalLight('#ffffff', 2.3);
    light.position.set(-3, 8, 5);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, THUMB_W / THUMB_H, 0.1, 60);
    const mesh = new THREE.Mesh(this.geometry(0), this.material(colour));
    const inked = new THREE.LineSegments(this.outline(0), this.ink);
    mesh.add(inked);
    scene.add(mesh);
    const stamp = new THREE.Mesh(this.printGeometry, this.printMaterial);
    stamp.position.y = PLATE_H + 0.004;
    const pixels = new Uint8Array(THUMB_W * 2 * THUMB_H * 2 * 4);
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W * 2;
    canvas.height = THUMB_H * 2;
    const ctx = canvas.getContext('2d');
    const out: string[] = [];
    // The target holds linear light; the picture wants display values.
    const curve = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value++) curve[value] = (value / 255) ** (1 / 2.2) * 255;
    const background = this.renderer.getClearColor(new THREE.Color());
    const alpha = this.renderer.getClearAlpha();
    if (!ctx) {
      target.dispose();
      return [];
    }
    try {
      this.renderer.setClearColor('#000000', 0);
      this.renderer.setRenderTarget(target);
      for (let index = 0; index < PARTS.length; index++) {
        if (!only.includes(index)) {
          out.push('');
          continue;
        }
        const part: Part = PARTS[index];
        mesh.geometry = this.geometry(index);
        inked.geometry = this.outline(index);
        if (part.print) mesh.add(stamp);
        else mesh.remove(stamp);
        const size = Math.max(part.w, part.d, part.h * PLATE_H);
        const reach = 1.7 + size * 1.4;
        camera.position.set(reach * 0.62, reach * 0.55, reach * 0.74);
        camera.lookAt(0, (part.h * PLATE_H) / 2, 0);
        this.renderer.clear();
        this.renderer.render(scene, camera);
        this.renderer.readRenderTargetPixels(target, 0, 0, THUMB_W * 2, THUMB_H * 2, pixels);
        const image = ctx.createImageData(THUMB_W * 2, THUMB_H * 2);
        const row = THUMB_W * 2 * 4;
        for (let y = 0; y < THUMB_H * 2; y++) {
          const from = (THUMB_H * 2 - 1 - y) * row;
          for (let x = 0; x < row; x += 4) {
            const a = pixels[from + x + 3];
            // Undo the blend with the clear colour so edges stay clean on any background.
            const scale = a > 0 ? 255 / a : 0;
            image.data[y * row + x] = curve[Math.min(255, Math.round(pixels[from + x] * scale))];
            image.data[y * row + x + 1] =
              curve[Math.min(255, Math.round(pixels[from + x + 1] * scale))];
            image.data[y * row + x + 2] =
              curve[Math.min(255, Math.round(pixels[from + x + 2] * scale))];
            image.data[y * row + x + 3] = a;
          }
        }
        ctx.putImageData(image, 0, 0);
        out.push(canvas.toDataURL('image/png'));
      }
    } catch {
      out.length = 0;
    } finally {
      this.renderer.setRenderTarget(null);
      this.renderer.setClearColor(background, alpha);
      mesh.remove(stamp);
      target.dispose();
      this.dirty = true;
    }
    return out.length === PARTS.length ? out : [];
  }

  // ------------------------------------------------------------------ build picture

  /**
   * The baseplate and the build up to layer `top`, as seen now, cropped to what they cover and
   * with a caption strip underneath. The helpers (piece in hand, outlines) are left out. Null
   * if the canvas cannot be read.
   */
  picture(top: number, caption: string): HTMLCanvasElement | null {
    const helpers = [this.ghost, this.target, this.targetEdges, this.marked];
    const shown = helpers.map((helper) => helper.visible);
    for (const helper of helpers) helper.visible = false;
    // Pieces still dropping are drawn where they will land.
    for (const [object, drop] of this.drops) object.position.y = drop.to;
    try {
      this.camera.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      const { width, height } = this.canvas;
      let left = width;
      let right = 0;
      let up = height;
      let down = 0;
      const corner = new THREE.Vector3();
      for (const x of [-HALF, HALF])
        for (const y of [-0.24, top * PLATE_H + STUD_H])
          for (const z of [-HALF, HALF]) {
            corner.set(x, y, z).project(this.camera);
            left = Math.min(left, ((corner.x + 1) / 2) * width);
            right = Math.max(right, ((corner.x + 1) / 2) * width);
            up = Math.min(up, ((1 - corner.y) / 2) * height);
            down = Math.max(down, ((1 - corner.y) / 2) * height);
          }
      const pad = Math.round(width * 0.03);
      left = Math.max(0, Math.floor(left) - pad);
      up = Math.max(0, Math.floor(up) - pad);
      right = Math.min(width, Math.ceil(right) + pad);
      down = Math.min(height, Math.ceil(down) + pad);
      if (right - left < 16 || down - up < 16) return null;
      const strip = Math.max(28, Math.round((right - left) * 0.07));
      const out = document.createElement('canvas');
      out.width = right - left;
      out.height = down - up + strip;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      // Read in the same task as the render, before the browser clears the drawing buffer.
      ctx.drawImage(this.canvas, left, up, out.width, down - up, 0, 0, out.width, down - up);
      ctx.fillStyle = '#ffed00';
      ctx.fillRect(0, down - up, out.width, strip);
      ctx.fillStyle = '#181716';
      ctx.fillRect(0, down - up, out.width, Math.max(2, Math.round(strip * 0.08)));
      ctx.font = `${Math.round(strip * 0.46)}px LegoBrick, LegoBody, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(caption, out.width / 2, down - up + strip * 0.56, out.width - strip);
      return out;
    } catch {
      return null;
    } finally {
      for (let index = 0; index < helpers.length; index++) helpers[index].visible = shown[index];
      this.dirty = true;
    }
  }

  // ------------------------------------------------------------------ lifecycle

  /** Runs when the browser takes the 3D context away. */
  onLost(listener: () => void): () => void {
    const handler = (event: Event) => {
      event.preventDefault();
      listener();
    };
    this.canvas.addEventListener('webglcontextlost', handler);
    return () => this.canvas.removeEventListener('webglcontextlost', handler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.afterFall = undefined;
    this.scene.clear();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const outline of this.outlines.values()) outline.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const item of this.owned) item.dispose();
    this.targetEdges.geometry.dispose();
    this.print.dispose();
    this.geometries.clear();
    this.outlines.clear();
    this.materials.clear();
    this.objects.clear();
    this.pickables.length = 0;
    this.falling = [];
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  // ------------------------------------------------------------------ internals

  private own<T extends { dispose: () => void }>(item: T): T {
    this.owned.push(item);
    return item;
  }

  private geometry(part: number): THREE.BufferGeometry {
    let geometry = this.geometries.get(part);
    if (!geometry) {
      geometry = partGeometry(part);
      this.geometries.set(part, geometry);
    }
    return geometry;
  }

  private outline(part: number): THREE.BufferGeometry {
    let outline = this.outlines.get(part);
    if (!outline) {
      outline = new THREE.EdgesGeometry(this.geometry(part), 35);
      this.outlines.set(part, outline);
    }
    return outline;
  }

  private material(colour: number): THREE.MeshStandardMaterial {
    let material = this.materials.get(colour);
    if (!material) {
      const spec = COLOURS[colour];
      material = new THREE.MeshStandardMaterial({
        color: spec.hex,
        roughness: 0.3,
        metalness: 0.02,
        transparent: spec.clear,
        opacity: spec.clear ? 0.74 : 1,
        emissive: spec.clear ? spec.hex : '#000000',
        emissiveIntensity: spec.clear && this.powered ? POWER_GLOW : 0,
      });
      this.materials.set(colour, material);
    }
    return material;
  }

  /** How brightly the clear pieces shine from inside. */
  private glow(level: number): void {
    for (const [colour, material] of this.materials) {
      if (COLOURS[colour].clear) material.emissiveIntensity = level;
    }
    this.dirty = true;
  }

  private pose(mesh: THREE.Mesh, spec: PieceSpec): void {
    const [fw, fd] = footprint(spec.part, spec.turn);
    mesh.geometry = this.geometry(spec.part);
    mesh.position.set(spec.x + fw / 2 - HALF, spec.y * PLATE_H, spec.z + fd / 2 - HALF);
    mesh.rotation.y = (spec.turn as Turn) * (Math.PI / 2);
  }

  private build(piece: Piece): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(piece.part), this.material(piece.colour));
    this.pose(mesh, piece);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(this.outline(piece.part), this.ink));
    const part: Part = PARTS[piece.part];
    if (part.print) {
      const stamp = new THREE.Mesh(this.printGeometry, this.printMaterial);
      stamp.position.y = PARTS[piece.part].h * PLATE_H + 0.004;
      stamp.receiveShadow = true;
      mesh.add(stamp);
    }
    return mesh;
  }

  private placeCamera(): void {
    const flat = Math.sin(this.polar) * this.distance;
    this.camera.position.set(
      this.focus.x + flat * Math.sin(this.azimuth),
      this.focus.y + Math.cos(this.polar) * this.distance,
      this.focus.z + flat * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.focus);
    this.dirty = true;
  }

  private readonly frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    // Motion steps are capped so a slow frame cannot fling a piece; the clock for how long the
    // crumble lasts is not, so a slow device is not left waiting.
    if (!this.low && this.last > 0) {
      // Only frames that follow a draw count: an idle view is not a slow one, and it does not
      // clear the count either, since most moves here last only a few frames. A gap of seconds
      // is a hidden tab, not a slow draw.
      const gap = now - this.last;
      if (this.drew && gap < HIDDEN_GAP_MS) {
        this.slowFrames = gap > SLOW_FRAME_MS ? this.slowFrames + 1 : 0;
      }
      if (this.slowFrames >= SLOW_FRAMES) this.lowDetail();
    }
    const elapsed = Math.min(0.5, (now - this.last) / 1000);
    const dt = Math.min(0.05, elapsed);
    this.last = now;
    if (document.hidden) return;
    let busy = false;

    for (const [object, drop] of this.drops) {
      drop.age += dt;
      const t = Math.min(1, drop.age / 0.16);
      object.position.y = drop.from + (drop.to - drop.from) * t * t;
      if (t >= 1) this.drops.delete(object);
      busy = true;
    }

    if (this.falling.length > 0) {
      this.fallingAge += elapsed;
      for (const piece of this.falling) {
        piece.velocity.y -= 30 * dt;
        piece.object.position.addScaledVector(piece.velocity, dt);
        piece.object.rotation.x += piece.spin.x * dt;
        piece.object.rotation.y += piece.spin.y * dt;
        piece.object.rotation.z += piece.spin.z * dt;
      }
      busy = true;
      if (this.fallingAge > 1.25) {
        for (const piece of this.falling) this.scene.remove(piece.object);
        this.falling = [];
        const done = this.afterFall;
        this.afterFall = undefined;
        done?.();
      }
    }

    if (this.turnTo !== undefined) {
      const left = this.turnTo - this.azimuth;
      if (Math.abs(left) < 0.004) {
        this.azimuth = this.turnTo;
        this.turnTo = undefined;
      } else {
        this.azimuth += left * Math.min(1, dt * 5);
        busy = true;
      }
      this.placeCamera();
    }

    if (this.lap > 0) {
      const step = Math.min(this.lap, dt * LAP_SPEED);
      this.lap -= step;
      this.azimuth += step;
      this.placeCamera();
      busy = true;
    }

    if (this.powered && this.poweredFor < POWER_SHOW) {
      // Three flickers, each brighter, then the lights hold.
      this.poweredFor = Math.min(POWER_SHOW, this.poweredFor + elapsed);
      const t = this.poweredFor / POWER_SHOW;
      this.glow(t >= 1 ? POWER_GLOW : POWER_GLOW * t * (0.55 + 0.45 * Math.sin(t * Math.PI * 7)));
      busy = true;
    }

    if (this.target.visible && !this.still) {
      this.targetMaterial.opacity = 0.42 + Math.sin(now / 260) * 0.16;
      busy = true;
    }

    this.drew = this.dirty || busy;
    if (this.drew) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
    }
  };
}
