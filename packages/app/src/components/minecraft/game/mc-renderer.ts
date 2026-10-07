import * as THREE from 'three';

import { ATLAS_COLUMNS, ATLAS_ROWS, TILE, type TileName } from './mc-atlas';
import { B, BLOCKS } from './mc-blocks';
import { daylight, DAY, HOSTILE, type Entity, type Game, type MobKind } from './mc-game';
import { ITEMS } from './mc-items';
import { meshChunk, tileFor, type MeshData } from './mc-mesher';
import {
  boxGeometry,
  buildModel,
  disposeModel,
  disposeModelGeometry,
  MODELS,
  poseModel,
  type ModelInstance,
  type ModelName,
} from './mc-models';
import { raycast, selectionBox } from './mc-physics';
import { CHUNK, chunkKey, HEIGHT, type Chunk } from './mc-world';

export const ASSET_BASE = '/decorative/minecraft/game/';
const ATLAS_W = ATLAS_COLUMNS * 16;
const ATLAS_H = ATLAS_ROWS * 16;
const SKINS = [
  'steve',
  'zombie',
  'skeleton',
  'creeper',
  'pig',
  'cow',
  'sheep',
  'sheep-fur',
  'chicken',
] as const;
type SkinName = (typeof SKINS)[number];

export interface Assets {
  atlas: THREE.Texture;
  atlasPixels: Uint8ClampedArray;
  skins: Record<SkinName, THREE.Texture>;
  sun: THREE.Texture;
  moon: THREE.Texture;
  clouds: THREE.Texture;
}

function pixelTexture(image: HTMLImageElement | HTMLCanvasElement) {
  const t = new THREE.Texture(image);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    img.src = src;
  });
}

export async function loadAssets(base = ASSET_BASE): Promise<Assets> {
  const names = ['terrain', ...SKINS, 'sun', 'moon', 'clouds'];
  const images = await Promise.all(names.map((n) => loadImage(`${base}${n}.png`)));
  const byName = Object.fromEntries(names.map((n, i) => [n, images[i]])) as Record<
    string,
    HTMLImageElement
  >;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(byName.terrain, 0, 0);
  const atlasPixels = ctx.getImageData(0, 0, ATLAS_W, ATLAS_H).data;
  const skins = Object.fromEntries(SKINS.map((s) => [s, pixelTexture(byName[s])])) as Record<
    SkinName,
    THREE.Texture
  >;
  const clouds = pixelTexture(byName.clouds);
  clouds.wrapS = THREE.RepeatWrapping;
  clouds.wrapT = THREE.RepeatWrapping;
  return {
    atlas: pixelTexture(byName.terrain),
    atlasPixels,
    skins,
    sun: pixelTexture(byName.sun),
    moon: pixelTexture(byName.moon),
    clouds,
  };
}

/** Colour stored without colour-space conversion (the whole pipeline works in display space). */
const rgb = (r: number, g: number, b: number) =>
  new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lightCurve = (f: number) => f / (4 - 3 * f);

const tileOrigin = (tile: number): [number, number] => [
  (tile % ATLAS_COLUMNS) * 16,
  Math.floor(tile / ATLAS_COLUMNS) * 16,
];

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const TERRAIN_VERTEX = /* glsl */ `
attribute vec2 auv;
attribute vec4 alight;
uniform float uTime;
uniform vec2 uWaterOffset;
uniform vec2 uLavaOffset;
uniform vec2 uAtlasSize;
varying vec2 vUv;
varying vec3 vLight;
varying float vDist;
void main() {
  vec3 p = position / 16.0;
  vec2 uv = auv;
  float flags = alight.w;
  vec4 world = modelMatrix * vec4(p, 1.0);
  if (abs(flags - 1.0) < 0.5) uv += uWaterOffset;
  else if (abs(flags - 2.0) < 0.5) uv += uLavaOffset;
  else if (abs(flags - 3.0) < 0.5) {
    world.x += sin(uTime * 1.3 + world.y * 0.9 + world.z * 0.6) * 0.015;
    world.z += cos(uTime * 1.1 + world.x * 0.7 + world.y * 0.4) * 0.015;
  } else if (abs(flags - 4.0) < 0.5) {
    world.x += sin(uTime * 1.8 + world.x * 0.6 + world.z * 0.9) * 0.05;
    world.z += cos(uTime * 1.5 + world.x * 0.8 + world.z * 0.5) * 0.05;
  }
  vUv = uv / uAtlasSize;
  vLight = alight.xyz / 255.0;
  vec4 mv = viewMatrix * world;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const TERRAIN_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uDaylight;
uniform float uGamma;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying vec3 vLight;
varying float vDist;
float curve(float f) { return f / (4.0 - 3.0 * f); }
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
#ifdef CUTOUT
  if (tex.a < 0.5) discard;
  tex.a = 1.0;
#endif
  float sky = curve(vLight.x) * uDaylight;
  float blk = curve(vLight.y);
  vec3 light = max(vec3(sky * 0.95, sky * 0.97, sky), vec3(blk, blk * 0.93, blk * 0.82));
  light = light * 0.95 + 0.05;
  light = mix(light, 1.0 - pow(1.0 - light, vec3(3.0)), uGamma);
  vec3 col = tex.rgb * light * vLight.z;
  float fog = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(col, uFogColor, fog), tex.a);
}
`;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uGlow;
uniform float uGlowAmount;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.45, h));
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.3, h));
  float g = max(0.0, dot(normalize(vec3(vDir.x, 0.0, vDir.z) + vec3(0.0, 0.0001, 0.0)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(0.0, 0.0001, 0.0))));
  float band = (1.0 - smoothstep(0.0, 0.5, abs(h - 0.05))) * pow(g, 3.0) * uGlowAmount;
  col = mix(col, uGlow, band);
  gl_FragColor = vec4(col, 1.0);
}
`;

const PARTICLE_VERTEX = /* glsl */ `
attribute vec2 aTile;
attribute vec3 aInfo;
uniform float uScale;
varying vec2 vTile;
varying vec3 vInfo;
void main() {
  vTile = aTile;
  vInfo = aInfo;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aInfo.x * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const PARTICLE_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec2 uAtlasSize;
varying vec2 vTile;
varying vec3 vInfo;
void main() {
  vec4 c;
  if (vTile.x < 0.0) {
    c = vec4(vec3(vInfo.y), vInfo.z);
  } else {
    vec2 uv = (vTile + floor(vec2(gl_PointCoord.x, gl_PointCoord.y) * 4.0)) / uAtlasSize;
    c = texture2D(uAtlas, uv);
    if (c.a < 0.5) discard;
    c.rgb *= vInfo.y;
  }
  gl_FragColor = c;
}
`;

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
function chunkGeometry(m: MeshData) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('auv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('alight', new THREE.BufferAttribute(m.light, 4));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.boundingBox = new THREE.Box3(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(CHUNK, HEIGHT, CHUNK),
  );
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(CHUNK / 2, HEIGHT / 2, CHUNK / 2),
    Math.hypot(CHUNK / 2, HEIGHT / 2, CHUNK / 2),
  );
  return g;
}

const SHADE = [0.6, 0.6, 1, 0.5, 0.8, 0.8];

/** A unit cube textured like a block, centred on the origin. */
function blockCube(id: number, meta: number) {
  const def = BLOCKS[id];
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const colors: number[] = [];
  for (let face = 0; face < 6; face++) {
    const [tx, ty] = tileOrigin(tileFor(def, face, meta));
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      uv.setXY(i, (tx + uv.getX(i) * 16) / ATLAS_W, (ty + (1 - uv.getY(i)) * 16) / ATLAS_H);
      colors.push(SHADE[face], SHADE[face], SHADE[face]);
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

/** Flat item sprite extruded one pixel deep, like vanilla held and dropped items. */
function extrudedTile(tile: number, pixels: Uint8ClampedArray) {
  const [tx, ty] = tileOrigin(tile);
  const opaque = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < 16 && y < 16 && pixels[((ty + y) * ATLAS_W + tx + x) * 4 + 3] > 127;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  const t = 1 / 16;
  const quad = (
    a: number[],
    b: number[],
    c: number[],
    d: number[],
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    shade: number,
  ) => {
    const n = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let i = 0; i < 4; i++) col.push(shade, shade, shade);
    index.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  const U = (px: number) => (tx + px) / ATLAS_W;
  const V = (py: number) => (ty + py) / ATLAS_H;
  // Front and back faces cover the whole tile (alpha tested).
  quad(
    [-0.5, 0.5, t / 2],
    [0.5, 0.5, t / 2],
    [0.5, -0.5, t / 2],
    [-0.5, -0.5, t / 2],
    U(0),
    V(0),
    U(16),
    V(16),
    1,
  );
  quad(
    [0.5, 0.5, -t / 2],
    [-0.5, 0.5, -t / 2],
    [-0.5, -0.5, -t / 2],
    [0.5, -0.5, -t / 2],
    U(16),
    V(0),
    U(0),
    V(16),
    0.8,
  );
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!opaque(x, y)) continue;
      const x0 = x / 16 - 0.5;
      const x1 = x0 + t;
      const y0 = 0.5 - y / 16;
      const y1 = y0 - t;
      const cu0 = U(x + 0.25);
      const cu1 = U(x + 0.75);
      const cv0 = V(y + 0.25);
      const cv1 = V(y + 0.75);
      const z0 = -t / 2;
      const z1 = t / 2;
      if (!opaque(x, y - 1))
        quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], cu0, cv0, cu1, cv1, 0.95);
      if (!opaque(x, y + 1))
        quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], cu0, cv0, cu1, cv1, 0.6);
      if (!opaque(x - 1, y))
        quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], cu0, cv0, cu1, cv1, 0.7);
      if (!opaque(x + 1, y))
        quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], cu0, cv0, cu1, cv1, 0.7);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

/** Which tile an item renders with when it is not a full cube. */
function itemTile(id: string): number | null {
  const named = TILE[`item_${id}` as TileName];
  if (named !== undefined) return named;
  const def = ITEMS[id];
  if (def?.block !== undefined) return tileFor(BLOCKS[def.block], 4, 0);
  return null;
}

/** Items held or dropped as small cubes (full blocks) rather than flat sprites. */
function isCubeItem(id: string) {
  const def = ITEMS[id];
  if (def?.block === undefined) return false;
  const render = BLOCKS[def.block].render;
  return render === 'cube' || (render === 'box' && def.block !== B.cactus);
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  /** Atlas pixel origin of a 4x4 texture fragment, or -1 for smoke. */
  tu: number;
  tv: number;
  gravity: number;
  brightness: number;
}
const MAX_PARTICLES = 3000;

export interface RenderOptions {
  fov: number;
  thirdPerson: 0 | 1 | 2;
  viewBobbing: boolean;
  gamma: number;
  hideHand: boolean;
  clouds: boolean;
}

interface ChunkMeshes {
  solid: THREE.Mesh | null;
  water: THREE.Mesh | null;
}

interface EntityView {
  object: THREE.Object3D;
  model?: ModelInstance;
  modelName?: ModelName;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  kind: Entity['kind'];
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly game: Game;
  private readonly assets: Assets;
  private readonly scene = new THREE.Scene();
  private readonly skyScene = new THREE.Scene();
  private readonly handScene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1000);
  private readonly skyCamera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  private readonly handCamera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  private readonly solidMaterial: THREE.ShaderMaterial;
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly terrainUniforms;
  private readonly chunkMeshes = new Map<number, ChunkMeshes>();
  private readonly entityViews = new Map<number, EntityView>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly skyUniforms;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly clouds: THREE.Mesh;
  private readonly outline: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private readonly fog = new THREE.Fog('#ffffff', 40, 96);
  private readonly particles: Particle[] = [];
  private readonly particlePoints: THREE.Points;
  private readonly particleGeometry: THREE.BufferGeometry;
  private readonly particleMaterial: THREE.ShaderMaterial;
  private readonly playerModel: ModelInstance;
  private readonly handRoot = new THREE.Group();
  private handObject: THREE.Object3D | null = null;
  private handKey: string | null = null;
  private handMaterial: THREE.MeshBasicMaterial;
  private handArmMaterial: THREE.MeshBasicMaterial;
  private readonly entityCubeMaterial: THREE.MeshBasicMaterial;
  private fovCurrent = 70;
  private equip = 0;
  private lastSelected = -1;
  private lastHeldId = '';
  private width = 1;
  private height = 1;
  private elapsed = 0;
  /** Distance-sorted chunk keys waiting for geometry. */
  meshQueue = 0;
  chunksRendered = 0;

  constructor(canvas: HTMLCanvasElement, game: Game, assets: Assets) {
    this.game = game;
    this.assets = assets;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.camera.rotation.order = 'YXZ';
    this.skyCamera.rotation.order = 'YXZ';
    this.scene.fog = this.fog;

    this.terrainUniforms = {
      uAtlas: { value: assets.atlas },
      uAtlasSize: { value: new THREE.Vector2(ATLAS_W, ATLAS_H) },
      uTime: { value: 0 },
      uWaterOffset: { value: new THREE.Vector2() },
      uLavaOffset: { value: new THREE.Vector2() },
      uDaylight: { value: 1 },
      uGamma: { value: 0.5 },
      uFogColor: { value: rgb(0.75, 0.85, 1) },
      uFogNear: { value: 50 },
      uFogFar: { value: 90 },
    };
    this.solidMaterial = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: TERRAIN_FRAGMENT,
      uniforms: this.terrainUniforms,
      defines: { CUTOUT: 1 },
    });
    this.waterMaterial = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VERTEX,
      fragmentShader: TERRAIN_FRAGMENT,
      uniforms: this.terrainUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Sky dome, sun, moon and stars live in their own scene rendered first.
    this.skyUniforms = {
      uTop: { value: rgb(0.47, 0.65, 1) },
      uHorizon: { value: rgb(0.75, 0.85, 1) },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uGlow: { value: rgb(0.95, 0.55, 0.3) },
      uGlowAmount: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(500, 24, 12),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    this.skyScene.add(dome);
    this.sun = celestial(assets.sun, 60);
    this.moon = celestial(assets.moon, 40);
    this.skyScene.add(this.sun, this.moon);
    const starPositions: number[] = [];
    let seed = 10842;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
      v.normalize().multiplyScalar(400);
      starPositions.push(v.x, v.y, v.z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: '#ffffff',
        size: 1.6,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    this.skyScene.add(this.stars);

    // Clouds.
    const cloudTex = assets.clouds;
    this.clouds = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.8,
        alphaTest: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = 2;
    this.scene.add(this.clouds);

    // Block selection outline and crack overlay.
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.45,
        fog: false,
      }),
    );
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.004, 1.004, 1.004),
      new THREE.MeshBasicMaterial({
        map: assets.atlas,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        fog: false,
      }),
    );
    this.crack.visible = false;
    this.scene.add(this.crack);

    // Particles.
    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3),
    );
    this.particleGeometry.setAttribute(
      'aTile',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 2), 2),
    );
    this.particleGeometry.setAttribute(
      'aInfo',
      new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3),
    );
    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: {
        uAtlas: { value: assets.atlas },
        uAtlasSize: { value: new THREE.Vector2(ATLAS_W, ATLAS_H) },
        uScale: { value: 500 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.particlePoints = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particlePoints.frustumCulled = false;
    this.particlePoints.renderOrder = 3;
    this.scene.add(this.particlePoints);

    this.entityCubeMaterial = new THREE.MeshBasicMaterial({
      map: assets.atlas,
      alphaTest: 0.5,
      vertexColors: true,
    });

    // Player model for third person.
    this.playerModel = buildModel('steve', assets.skins.steve);
    this.playerModel.root.visible = false;
    this.scene.add(this.playerModel.root);

    // First-person hand.
    this.handMaterial = new THREE.MeshBasicMaterial({
      map: assets.atlas,
      alphaTest: 0.5,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.handArmMaterial = new THREE.MeshBasicMaterial({
      map: assets.skins.steve,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    this.handScene.add(this.handRoot);
  }

  setSize(width: number, height: number, dpr: number) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(width, height, false);
    for (const cam of [this.camera, this.skyCamera, this.handCamera]) {
      cam.aspect = width / Math.max(1, height);
      cam.updateProjectionMatrix();
    }
  }

  // -------------------------------------------------------------------------
  // Chunks
  // -------------------------------------------------------------------------
  private neighborsLit(cx: number, cz: number) {
    const chunks = this.game.world.chunks;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = chunks.get(chunkKey(cx + dx, cz + dz));
        if (!c || !c.lit) return false;
      }
    return true;
  }

  /** Rebuild dirty chunk meshes near the player within a time budget (ms). */
  updateChunks(budgetMs: number) {
    const start = performance.now();
    const world = this.game.world;
    const p = this.game.player;
    const pcx = Math.floor(p.x / CHUNK);
    const pcz = Math.floor(p.z / CHUNK);
    const rd = this.game.renderDistance;
    const pending: [number, Chunk][] = [];
    for (const c of world.chunks.values()) {
      if (!c.dirty || !c.lit) continue;
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      const d2 = dx * dx + dz * dz;
      if (d2 > rd * rd + 1) continue;
      if (!this.neighborsLit(c.cx, c.cz)) continue;
      pending.push([d2, c]);
    }
    pending.sort((a, b) => a[0] - b[0]);
    let built = 0;
    for (const [, c] of pending) {
      if (built > 0 && performance.now() - start > budgetMs) break;
      this.buildChunk(c);
      built++;
    }
    this.meshQueue = pending.length - built;
    // Drop meshes for unloaded chunks and hide distant ones.
    let rendered = 0;
    for (const [key, m] of this.chunkMeshes) {
      const c = world.chunks.get(key);
      if (!c) {
        this.disposeChunk(m);
        this.chunkMeshes.delete(key);
        continue;
      }
      const dx = c.cx - pcx;
      const dz = c.cz - pcz;
      const visible = dx * dx + dz * dz <= rd * rd + 1;
      if (m.solid) m.solid.visible = visible;
      if (m.water) m.water.visible = visible;
      if (visible) rendered++;
    }
    this.chunksRendered = rendered;
  }

  private buildChunk(c: Chunk) {
    const key = chunkKey(c.cx, c.cz);
    const data = meshChunk(this.game.world, c.cx, c.cz);
    c.dirty = false;
    const existing = this.chunkMeshes.get(key);
    if (existing) this.disposeChunk(existing);
    const make = (m: MeshData, material: THREE.Material, order: number) => {
      if (!m.vertices) return null;
      const mesh = new THREE.Mesh(chunkGeometry(m), material);
      mesh.position.set(c.cx * CHUNK, 0, c.cz * CHUNK);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.renderOrder = order;
      this.scene.add(mesh);
      return mesh;
    };
    this.chunkMeshes.set(key, {
      solid: make(data.solid, this.solidMaterial, 0),
      water: make(data.water, this.waterMaterial, 1),
    });
  }

  private disposeChunk(m: ChunkMeshes) {
    for (const mesh of [m.solid, m.water]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
  }

  /** Number of chunks with geometry (for the loading screen). */
  get meshedChunks() {
    return this.chunkMeshes.size;
  }

  // -------------------------------------------------------------------------
  // Particles
  // -------------------------------------------------------------------------
  addBreakParticles(x: number, y: number, z: number, id: number) {
    const def = BLOCKS[id];
    if (!def || def.render === 'none') return;
    const [tx, ty] = tileOrigin(tileFor(def, 4, 0));
    const light = this.brightnessAt(x + 0.5, y + 0.5, z + 0.5);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        for (let k = 0; k < 4; k++) {
          if (this.particles.length >= MAX_PARTICLES) return;
          const px = x + (i + 0.5) / 4;
          const py = y + (j + 0.5) / 4;
          const pz = z + (k + 0.5) / 4;
          this.particles.push({
            x: px,
            y: py,
            z: pz,
            vx: (px - x - 0.5) * 3 + (Math.random() - 0.5) * 0.6,
            vy: (py - y - 0.5) * 3 + Math.random() * 1.5,
            vz: (pz - z - 0.5) * 3 + (Math.random() - 0.5) * 0.6,
            life: 0,
            maxLife: 0.4 + Math.random() * 0.6,
            size: 0.1 + Math.random() * 0.06,
            tu: tx + Math.floor(Math.random() * 12),
            tv: ty + Math.floor(Math.random() * 12),
            gravity: 20,
            brightness: light,
          });
        }
  }

  /** Small crumbs while mining. */
  addHitParticle(x: number, y: number, z: number, face: number, id: number) {
    const def = BLOCKS[id];
    if (!def || this.particles.length >= MAX_PARTICLES) return;
    const [tx, ty] = tileOrigin(tileFor(def, face, 0));
    const n = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ][face];
    const r = Math.random;
    const px = x + (n[0] ? (n[0] > 0 ? 1.05 : -0.05) : r());
    const py = y + (n[1] ? (n[1] > 0 ? 1.05 : -0.05) : r());
    const pz = z + (n[2] ? (n[2] > 0 ? 1.05 : -0.05) : r());
    this.particles.push({
      x: px,
      y: py,
      z: pz,
      vx: n[0] * 1.5 + (r() - 0.5),
      vy: n[1] * 1.5 + r(),
      vz: n[2] * 1.5 + (r() - 0.5),
      life: 0,
      maxLife: 0.3 + r() * 0.4,
      size: 0.08,
      tu: tx + Math.floor(r() * 12),
      tv: ty + Math.floor(r() * 12),
      gravity: 20,
      brightness: this.brightnessAt(px, py, pz),
    });
  }

  addExplosionParticles(x: number, y: number, z: number, power: number) {
    const count = Math.round(40 * power);
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      const r = Math.random() * power;
      this.particles.push({
        x: x + dir.x * r,
        y: y + dir.y * r,
        z: z + dir.z * r,
        vx: dir.x * 2,
        vy: dir.y * 2 + 0.5,
        vz: dir.z * 2,
        life: 0,
        maxLife: 0.6 + Math.random() * 1.2,
        size: 0.5 + Math.random() * 1.4,
        tu: -1,
        tv: -1,
        gravity: -0.6,
        brightness: 0.6 + Math.random() * 0.35,
      });
    }
  }

  private updateParticles(dt: number) {
    const world = this.game.world;
    const list = this.particles;
    let w = 0;
    for (const p of list) {
      p.life += dt;
      if (p.life >= p.maxLife) continue;
      p.vy -= p.gravity * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      if (
        p.tu >= 0 &&
        BLOCKS[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))].solid
      ) {
        p.vx *= 0.3;
        p.vz *= 0.3;
        p.vy = 0;
      } else {
        p.x = nx;
        p.y = ny;
        p.z = nz;
      }
      p.vx *= 0.98;
      p.vz *= 0.98;
      list[w++] = p;
    }
    list.length = w;
    const pos = this.particleGeometry.getAttribute('position') as THREE.BufferAttribute;
    const tile = this.particleGeometry.getAttribute('aTile') as THREE.BufferAttribute;
    const info = this.particleGeometry.getAttribute('aInfo') as THREE.BufferAttribute;
    for (let i = 0; i < w; i++) {
      const p = list[i];
      pos.setXYZ(i, p.x, p.y, p.z);
      tile.setXY(i, p.tu, p.tv);
      const fade = p.tu < 0 ? (1 - p.life / p.maxLife) * 0.8 : 1;
      info.setXYZ(i, p.size, p.brightness, fade);
    }
    pos.needsUpdate = true;
    tile.needsUpdate = true;
    info.needsUpdate = true;
    this.particleGeometry.setDrawRange(0, w);
  }

  // -------------------------------------------------------------------------
  // Lighting helpers
  // -------------------------------------------------------------------------
  brightnessAt(x: number, y: number, z: number) {
    const l = this.game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    const sky = lightCurve((l >> 4) / 15) * daylight(this.game.time);
    const blk = lightCurve((l & 15) / 15);
    const b = Math.max(sky, blk) * 0.95 + 0.05;
    const g = this.terrainUniforms.uGamma.value;
    return lerp(b, 1 - (1 - b) ** 3, g);
  }

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------
  private cachedGeometry(key: string, build: () => THREE.BufferGeometry) {
    let g = this.geometryCache.get(key);
    if (!g) {
      g = build();
      this.geometryCache.set(key, g);
    }
    return g;
  }

  private itemObject(id: string, material: THREE.MeshBasicMaterial): THREE.Object3D {
    if (isCubeItem(id)) {
      const block = ITEMS[id].block!;
      const mesh = new THREE.Mesh(
        this.cachedGeometry(`cube:${block}`, () => blockCube(block, 0)),
        material,
      );
      mesh.scale.setScalar(0.25);
      return mesh;
    }
    const tile = itemTile(id);
    const mesh = new THREE.Mesh(
      this.cachedGeometry(`item:${tile}`, () =>
        extrudedTile(tile ?? TILE.item_stick, this.assets.atlasPixels),
      ),
      material,
    );
    mesh.scale.setScalar(0.5);
    return mesh;
  }

  private createEntityView(e: Entity): EntityView {
    if (e.kind === 'item') {
      const material = new THREE.MeshBasicMaterial({
        map: this.assets.atlas,
        alphaTest: 0.5,
        vertexColors: true,
        side: THREE.DoubleSide,
      });
      const group = new THREE.Group();
      const count = e.stack!.count;
      const copies = count > 32 ? 4 : count > 16 ? 3 : count > 1 ? 2 : 1;
      const cube = isCubeItem(e.stack!.id);
      for (let i = 0; i < copies; i++) {
        const o = this.itemObject(e.stack!.id, material);
        o.position.set(i * 0.06 * (cube ? 1 : 0.6), i * 0.05, i * (cube ? -0.05 : 0.03));
        group.add(o);
      }
      const holder = new THREE.Group();
      holder.add(group);
      return { object: holder, materials: [material], geometries: [], kind: e.kind };
    }
    if (e.kind === 'tnt' || e.kind === 'falling') {
      const id = e.kind === 'tnt' ? B.tnt : e.block!;
      const material = new THREE.MeshBasicMaterial({
        map: this.assets.atlas,
        alphaTest: 0.5,
        vertexColors: true,
      });
      const mesh = new THREE.Mesh(
        this.cachedGeometry(`cube:${id}:${e.blockMeta ?? 0}`, () =>
          blockCube(id, e.blockMeta ?? 0),
        ),
        material,
      );
      mesh.position.y = 0.5;
      const group = new THREE.Group();
      group.add(mesh);
      return { object: group, materials: [material], geometries: [], kind: e.kind };
    }
    if (e.kind === 'arrow') {
      const material = new THREE.MeshBasicMaterial({ color: '#8b6b3d' });
      const shaft = new THREE.Mesh(
        this.cachedGeometry('arrow', () => new THREE.BoxGeometry(0.04, 0.04, 0.5)),
        material,
      );
      const tip = new THREE.Mesh(
        this.cachedGeometry('arrow-tip', () => new THREE.BoxGeometry(0.07, 0.07, 0.08)),
        new THREE.MeshBasicMaterial({ color: '#9a9a9a' }),
      );
      tip.position.z = -0.27;
      const fletch = new THREE.Mesh(
        this.cachedGeometry('arrow-fletch', () => new THREE.BoxGeometry(0.14, 0.02, 0.1)),
        new THREE.MeshBasicMaterial({ color: '#eeeeee' }),
      );
      fletch.position.z = 0.22;
      const group = new THREE.Group();
      group.add(shaft, tip, fletch);
      return {
        object: group,
        materials: [material, tip.material, fletch.material],
        geometries: [],
        kind: e.kind,
      };
    }
    const kind = e.kind as MobKind;
    const name: ModelName = kind;
    const skin = this.assets.skins[kind as SkinName];
    const model = buildModel(
      name,
      skin,
      kind === 'sheep' ? this.assets.skins['sheep-fur'] : undefined,
    );
    return {
      object: model.root,
      model,
      modelName: name,
      materials: model.materials,
      geometries: [],
      kind: e.kind,
    };
  }

  private disposeEntityView(v: EntityView) {
    this.scene.remove(v.object);
    if (v.model) disposeModel(v.model);
    else for (const m of v.materials) m.dispose();
  }

  private updateEntities(alpha: number) {
    const game = this.game;
    const seen = new Set<number>();
    const camPos = this.camera.position;
    const maxDist = (game.renderDistance * CHUNK) ** 2;
    for (const e of game.entities) {
      if (e.removed) continue;
      const x = lerp(e.px, e.x, alpha);
      const y = lerp(e.py, e.y, alpha);
      const z = lerp(e.pz, e.z, alpha);
      if ((x - camPos.x) ** 2 + (z - camPos.z) ** 2 > maxDist) continue;
      seen.add(e.id);
      let view = this.entityViews.get(e.id);
      if (!view) {
        view = this.createEntityView(e);
        this.entityViews.set(e.id, view);
        this.scene.add(view.object);
      }
      const o = view.object;
      o.position.set(x, y, z);
      const light = this.brightnessAt(x, y + Math.min(e.h, 1) * 0.6, z);
      const hurt = e.hurtTime > 0 || e.deathTime > 0;
      const tint = hurt ? rgb(light, light * 0.45, light * 0.45) : rgb(light, light, light);
      if (view.kind === 'item') {
        const t = e.age + alpha;
        const inner = o.children[0];
        inner.position.y = Math.sin(t / 10 + e.id) * 0.1 + 0.25;
        inner.rotation.y = t / 20 + e.id;
        for (const m of view.materials) (m as THREE.MeshBasicMaterial).color.copy(tint);
      } else if (view.kind === 'tnt') {
        const fuse = e.fuse ?? 80;
        const flash = Math.floor(fuse / 5) % 2 === 0;
        const swell = fuse < 10 ? 1 + (1 - fuse / 10) * 0.3 : 1;
        o.scale.setScalar(swell);
        (view.materials[0] as THREE.MeshBasicMaterial).color.copy(
          flash ? rgb(2.2, 2.2, 2.2) : tint,
        );
      } else if (view.kind === 'falling') {
        (view.materials[0] as THREE.MeshBasicMaterial).color.copy(tint);
      } else if (view.kind === 'arrow') {
        const speed = Math.hypot(e.vx, e.vz);
        if (speed > 0.01 || Math.abs(e.vy) > 0.01) {
          o.rotation.order = 'YXZ';
          o.rotation.y = Math.atan2(-e.vx, -e.vz);
          o.rotation.x = Math.atan2(e.vy, speed);
        }
      } else if (view.model && view.modelName) {
        const yaw = lerpAngle(e.pyaw, e.yaw, alpha);
        o.rotation.set(0, yaw, 0);
        let headYaw = e.headYaw - yaw;
        headYaw = Math.atan2(Math.sin(headYaw), Math.cos(headYaw));
        const dx = game.player.x - e.x;
        const dz = game.player.z - e.z;
        const dy = game.player.y + 1.5 - (e.y + e.h * 0.85);
        const pitch = HOSTILE.has(e.kind) ? Math.atan2(dy, Math.hypot(dx, dz)) * 0.8 : 0;
        poseModel(view.modelName, view.model, {
          limbSwing: e.limbSwing,
          limbAmount: e.limbAmount,
          headYaw: Math.max(-1.2, Math.min(1.2, headYaw)),
          headPitch: Math.max(-0.8, Math.min(0.8, pitch)),
          attack: 0,
          age: e.age + alpha,
        });
        if (e.deathTime > 0) {
          const t = Math.min(1, Math.sqrt((e.deathTime + alpha) / 20) * 1.6);
          o.rotation.z = (t * Math.PI) / 2;
        }
        let scale = 1;
        let color = tint;
        if (e.kind === 'creeper' && e.fuse) {
          const f = Math.min(1, e.fuse / 30);
          scale = 1 + Math.sin(f * 100) * f * 0.01 + f * 0.15;
          if (Math.floor(e.fuse / 2) % 2 === 0) color = rgb(light * 2, light * 2, light * 2);
        }
        o.scale.setScalar(scale);
        if (e.kind === 'chicken') o.scale.multiplyScalar(1);
        for (const m of view.materials) (m as THREE.MeshBasicMaterial).color.copy(color);
        if (view.model.overlay) for (const g of view.model.overlay) g.visible = !e.sheared;
      }
    }
    for (const [id, view] of this.entityViews) {
      if (!seen.has(id)) {
        this.disposeEntityView(view);
        this.entityViews.delete(id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // First-person hand
  // -------------------------------------------------------------------------
  private updateHand(alpha: number, dt: number) {
    const game = this.game;
    const held = game.held;
    const key = held ? held.id : '';
    if (game.selected !== this.lastSelected || key !== this.lastHeldId) {
      // Lower and raise the hand when switching items.
      if (this.lastSelected !== -1) this.equip = 1;
      this.lastSelected = game.selected;
      this.lastHeldId = key;
    }
    this.equip = Math.max(0, this.equip - dt * 6);
    if (key !== this.handKey) {
      if (this.handObject) this.handRoot.remove(this.handObject);
      this.handKey = key;
      if (held) {
        this.handObject = this.itemObject(held.id, this.handMaterial);
      } else {
        const arm = new THREE.Mesh(
          this.cachedGeometry('hand-arm', () =>
            boxGeometry([{ u: 40, v: 16, x: -2, y: -2, z: -2, w: 4, h: 12, d: 4 }], 64, 64),
          ),
          this.handArmMaterial,
        );
        arm.scale.setScalar(1 / 16);
        const g = new THREE.Group();
        arm.rotation.z = Math.PI;
        g.add(arm);
        this.handObject = g;
      }
      this.handRoot.add(this.handObject);
    }
    const p = game.player;
    const light = this.brightnessAt(p.x, p.y + 1.6, p.z);
    this.handMaterial.color.copy(rgb(light, light, light));
    this.handArmMaterial.color.copy(rgb(light, light, light));
    const swing = p.swing > 0 ? Math.min(1, (6 - p.swing + alpha) / 6) : 0;
    const sq = Math.sin(Math.sqrt(swing) * Math.PI);
    const s1 = Math.sin(swing * Math.PI);
    const eat = p.eating > 0 ? p.eating + alpha : 0;
    const o = this.handObject!;
    const root = this.handRoot;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.setScalar(1);
    const equipDrop = -this.equip * 0.6;
    if (!held) {
      // Bare arm, vanilla-like placement in the lower right.
      root.position.set(
        0.62 - sq * 0.3,
        -0.55 + equipDrop + Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2,
        -0.85 - s1 * 0.3,
      );
      root.rotation.set(-1.15 + sq * 0.5, 0.35 - sq * 0.3, -0.2);
      (o.children[0] as THREE.Mesh).position.set(0, -0.3, 0);
      o.scale.setScalar(1.6);
      return;
    }
    const cube = isCubeItem(held.id);
    const tool = Boolean(ITEMS[held.id]?.tool);
    root.position.set(
      0.56 - sq * 0.4,
      -0.52 + equipDrop + Math.sin(Math.sqrt(swing) * Math.PI * 2) * 0.2,
      -0.72 - s1 * 0.2,
    );
    if (eat) {
      const bob = Math.abs(Math.cos((eat / 4) * Math.PI) * 0.1);
      root.position.set(0.25, -0.35 + bob, -0.6);
      root.rotation.set(0.3, 0.6, 0);
    } else root.rotation.set(-sq * 1.2, -sq * 0.3, 0);
    if (cube) {
      o.scale.setScalar(0.4);
      o.rotation.set(0, Math.PI / 4, 0);
      o.position.set(0, 0.1, 0);
    } else {
      o.scale.setScalar(tool ? 0.85 : 0.7);
      o.rotation.set(0, -Math.PI / 2 + 0.3, tool ? 0.45 : 0.2);
      o.position.set(0.05, 0.15, 0);
    }
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------
  render(alpha: number, dt: number, options: RenderOptions) {
    const game = this.game;
    const p = game.player;
    this.elapsed += dt;
    const time = game.time + alpha;
    const day = daylight(time);
    const dayF = Math.max(0, Math.min(1, (day - 0.2) / 0.8));

    // Camera.
    const ex = lerp(p.px, p.x, alpha);
    const ey = lerp(p.py, p.y, alpha) + game.eyeHeight;
    const ez = lerp(p.pz, p.z, alpha);
    const cam = this.camera;
    cam.position.set(ex, ey, ez);
    cam.rotation.set(p.pitch, p.yaw, 0);
    const speed = Math.hypot(p.x - p.px, p.z - p.pz);
    if (options.viewBobbing && options.thirdPerson === 0 && p.onGround && !p.flying) {
      const walk = p.walkDist * Math.PI;
      const bob = Math.min(1, speed * 5);
      cam.translateX(Math.sin(walk) * bob * 0.05);
      cam.position.y -= Math.abs(Math.cos(walk) * bob) * 0.06;
      cam.rotation.z = Math.sin(walk) * bob * 0.02;
    }
    if (p.hurtTime > 0) {
      const t = (p.hurtTime - alpha) / 10;
      cam.rotation.z += -Math.sin(t * t * t * t * Math.PI) * 0.2;
    }
    if (p.dead) cam.rotation.z = 0.6;
    // FOV: sprint and flight widen the view.
    let targetFov = options.fov;
    if (p.sprinting) targetFov *= 1.15;
    if (p.flying) targetFov *= 1.05;
    if (p.eyesInWater) targetFov *= 0.9;
    this.fovCurrent = lerp(this.fovCurrent, targetFov, 1 - Math.exp(-dt * 10));
    cam.fov = this.fovCurrent;
    cam.updateProjectionMatrix();
    this.playerModel.root.visible = options.thirdPerson !== 0;
    if (options.thirdPerson !== 0) {
      const back = options.thirdPerson === 1 ? 1 : -1;
      const [lx, ly, lz] = game.lookVector();
      // Pull the camera back but stop at blocks.
      const hit = raycast(game.world, ex, ey, ez, -lx * back, -ly * back, -lz * back, 4);
      const dist = hit ? Math.max(0.3, hit.distance - 0.3) : 4;
      cam.position.set(ex - lx * back * dist, ey - ly * back * dist, ez - lz * back * dist);
      if (back < 0) cam.rotation.set(-p.pitch, p.yaw + Math.PI, 0);
      const m = this.playerModel;
      m.root.position.set(ex, ey - game.eyeHeight, ez);
      m.root.rotation.set(0, p.yaw, 0);
      poseModel('steve', m, {
        limbSwing: p.walkDist * 2.5,
        limbAmount: Math.min(1, speed * 4),
        headYaw: 0,
        headPitch: p.pitch,
        attack: p.swing > 0 ? (6 - p.swing + alpha) / 6 : 0,
        age: game.ticks + alpha,
        sneaking: p.sneaking && !p.flying,
      });
      const light = this.brightnessAt(ex, ey, ez);
      const c = p.hurtTime > 0 ? rgb(light, light * 0.45, light * 0.45) : rgb(light, light, light);
      for (const mat of m.materials) mat.color.copy(c);
    }

    // Sky colours.
    const sunAngle = ((time % DAY) / DAY) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(sunAngle), Math.sin(sunAngle), 0.15).normalize();
    const top = rgb(lerp(0.01, 0.47, dayF), lerp(0.015, 0.65, dayF), lerp(0.04, 1, dayF));
    const horizon = rgb(lerp(0.03, 0.75, dayF), lerp(0.04, 0.85, dayF), lerp(0.08, 1, dayF));
    const glow = Math.max(0, 1 - Math.abs(sunDir.y) * 3.2) * (sunDir.y > -0.3 ? 1 : 0);
    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(horizon);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uGlowAmount.value = glow * 0.8;
    let fogColor = horizon.clone();
    // Looking toward a sunset tints the fog.
    const [lx, , lz] = game.lookVector();
    const facing = Math.max(0, lx * sunDir.x + lz * sunDir.z);
    fogColor.lerp(rgb(0.95, 0.55, 0.3), glow * facing * 0.5);
    const rd = game.renderDistance * CHUNK;
    let fogNear = rd * 0.55;
    let fogFar = rd - 4;
    if (p.eyesInWater) {
      const b = Math.max(0.15, this.brightnessAt(ex, ey, ez));
      fogColor = rgb(0.05 * b, 0.18 * b, 0.55 * b);
      fogNear = 0;
      fogFar = 18;
    } else if (game.world.getBlock(Math.floor(ex), Math.floor(ey), Math.floor(ez)) === B.lava) {
      fogColor = rgb(0.6, 0.1, 0);
      fogNear = 0;
      fogFar = 1.5;
    }
    // Rain-free caves: fade the horizon when deep underground.
    if (ey < 50 && !p.eyesInWater) {
      const under = Math.min(1, (50 - ey) / 20);
      fogColor.lerp(rgb(0.02, 0.02, 0.03), under);
    }
    const u = this.terrainUniforms;
    u.uTime.value = this.elapsed;
    u.uDaylight.value = day;
    u.uGamma.value = options.gamma;
    u.uFogColor.value.copy(fogColor);
    u.uFogNear.value = fogNear;
    u.uFogFar.value = fogFar;
    this.fog.color.copy(fogColor);
    this.fog.near = fogNear;
    this.fog.far = fogFar;
    // Texture animation: water every 2 ticks, lava every 3.
    const waterFrame = Math.floor(game.ticks / 2) % 8;
    const lavaFrame = Math.floor(game.ticks / 3) % 8;
    const [w0x, w0y] = tileOrigin(TILE.water_frame0);
    const [wx, wy] = tileOrigin(TILE.water_frame0 + waterFrame);
    u.uWaterOffset.value.set(wx - w0x, wy - w0y);
    const [l0x, l0y] = tileOrigin(TILE.lava_frame0);
    const [lxx, lyy] = tileOrigin(TILE.lava_frame0 + lavaFrame);
    u.uLavaOffset.value.set(lxx - l0x, lyy - l0y);

    // Sun, moon, stars follow the sky camera.
    this.skyCamera.rotation.copy(cam.rotation);
    this.skyCamera.fov = cam.fov;
    this.skyCamera.updateProjectionMatrix();
    this.sun.position.copy(sunDir).multiplyScalar(300);
    this.sun.lookAt(0, 0, 0);
    this.moon.position.copy(sunDir).multiplyScalar(-300);
    this.moon.lookAt(0, 0, 0);
    const underground = ey < 50 ? Math.min(1, (50 - ey) / 20) : 0;
    (this.sun.material as THREE.MeshBasicMaterial).opacity = 1 - underground;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = 1 - underground;
    (this.stars.material as THREE.PointsMaterial).opacity =
      Math.max(0, 1 - dayF * 1.6) * 0.9 * (1 - underground);
    this.stars.rotation.z = sunAngle;
    if (underground > 0) {
      this.skyUniforms.uTop.value.lerp(rgb(0.02, 0.02, 0.03), underground);
      this.skyUniforms.uHorizon.value.lerp(rgb(0.02, 0.02, 0.03), underground);
    }

    // Clouds drift slowly to the west.
    const cloudSize = Math.max(256, rd * 4);
    const cm = this.clouds;
    cm.visible = options.clouds && !p.eyesInWater;
    cm.position.set(ex, 108.33, ez);
    cm.scale.set(cloudSize, cloudSize, 1);
    const texWorld = 256 * 12;
    const drift = (game.ticks + alpha) * 0.03;
    const tex = this.assets.clouds;
    tex.repeat.set(cloudSize / texWorld, cloudSize / texWorld);
    tex.offset.set((ex + drift) / texWorld - tex.repeat.x / 2, ez / texWorld - tex.repeat.y / 2);
    (cm.material as THREE.MeshBasicMaterial).color.copy(
      rgb(lerp(0.12, 1, dayF), lerp(0.12, 1, dayF), lerp(0.15, 1, dayF)),
    );

    // Selection outline and crack overlay.
    const target = game.target;
    if (target && !p.dead) {
      const box = selectionBox(target.id, game.world.getMeta(target.x, target.y, target.z));
      const sx = (box[3] - box[0]) / 16;
      const sy = (box[4] - box[1]) / 16;
      const sz = (box[5] - box[2]) / 16;
      this.outline.visible = true;
      this.outline.position.set(
        target.x + (box[0] + box[3]) / 32,
        target.y + (box[1] + box[4]) / 32,
        target.z + (box[2] + box[5]) / 32,
      );
      this.outline.scale.set(sx + 0.004, sy + 0.004, sz + 0.004);
      const stage = Math.floor(game.breakProgress * 10);
      if (game.breakProgress > 0 && stage < 10) {
        this.crack.visible = true;
        this.crack.position.copy(this.outline.position);
        this.crack.scale.set(sx, sy, sz);
        const uv = (this.crack.geometry as THREE.BufferGeometry).getAttribute(
          'uv',
        ) as THREE.BufferAttribute;
        const [tx, ty] = tileOrigin(TILE.destroy_stage_0 + stage);
        if (this.crack.userData.stage !== stage) {
          this.crack.userData.stage = stage;
          const base = new THREE.BoxGeometry(1, 1, 1).getAttribute('uv') as THREE.BufferAttribute;
          for (let i = 0; i < uv.count; i++)
            uv.setXY(
              i,
              (tx + base.getX(i) * 16) / ATLAS_W,
              (ty + (1 - base.getY(i)) * 16) / ATLAS_H,
            );
          uv.needsUpdate = true;
        }
      } else this.crack.visible = false;
    } else {
      this.outline.visible = false;
      this.crack.visible = false;
    }

    this.updateEntities(alpha);
    this.updateParticles(dt);
    this.particleMaterial.uniforms.uScale.value =
      (this.height / (2 * Math.tan((cam.fov * Math.PI) / 360))) * this.renderer.getPixelRatio();

    // Draw: sky, world, hand.
    const r = this.renderer;
    r.setClearColor(fogColor, 1);
    r.clear(true, true, true);
    if (!p.eyesInWater && ey >= 30) r.render(this.skyScene, this.skyCamera);
    r.clearDepth();
    r.render(this.scene, cam);
    if (options.thirdPerson === 0 && !options.hideHand && !p.dead) {
      this.updateHand(alpha, dt);
      r.clearDepth();
      this.handCamera.fov = 70;
      this.handCamera.updateProjectionMatrix();
      r.render(this.handScene, this.handCamera);
    }
  }

  dispose() {
    for (const m of this.chunkMeshes.values()) this.disposeChunk(m);
    this.chunkMeshes.clear();
    for (const v of this.entityViews.values()) this.disposeEntityView(v);
    this.entityViews.clear();
    for (const g of this.geometryCache.values()) g.dispose();
    this.geometryCache.clear();
    disposeModel(this.playerModel);
    disposeModelGeometry();
    disposeScene(this.scene);
    disposeScene(this.skyScene);
    disposeScene(this.handScene);
    this.solidMaterial.dispose();
    this.waterMaterial.dispose();
    this.particleMaterial.dispose();
    this.handMaterial.dispose();
    this.handArmMaterial.dispose();
    this.entityCubeMaterial.dispose();
    this.assets.atlas.dispose();
    for (const t of Object.values(this.assets.skins)) t.dispose();
    this.assets.sun.dispose();
    this.assets.moon.dispose();
    this.assets.clouds.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

function celestial(map: THREE.Texture, size: number) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
}

function disposeScene(s: THREE.Object3D) {
  s.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) for (const m of mat) m.dispose();
    else mat?.dispose();
  });
}

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Quick check used by the UI: whether a world cell blocks the view (for third-person). */
export function isOpaqueAt(game: Game, x: number, y: number, z: number) {
  return BLOCKS[game.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].opaque;
}

export { MODELS };
