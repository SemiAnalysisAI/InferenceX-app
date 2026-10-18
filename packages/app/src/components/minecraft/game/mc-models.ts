import * as THREE from 'three';

/**
 * Minecraft entity models built from the vanilla box layouts.
 *
 * Boxes are authored in Minecraft model space (pixels, y down, front -Z,
 * entity right -X) with the vanilla texture-unwrapping convention, then the
 * model root is rotated 180 degrees about Z and lifted 24px so it stands on
 * the ground in world space facing -Z.
 */

export interface BoxSpec {
  /** Texture offset of the unwrapped box. */
  u: number;
  v: number;
  /** Box origin and size in model pixels (relative to the part pivot). */
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  inflate?: number;
  mirror?: boolean;
}

/** Build one textured box as raw arrays. */
function pushBox(b: BoxSpec, tw: number, th: number, pos: number[], uv: number[], index: number[]) {
  const g = b.inflate ?? 0;
  const x0 = b.x - g;
  const y0 = b.y - g;
  const z0 = b.z - g;
  const x1 = b.x + b.w + g;
  const y1 = b.y + b.h + g;
  const z1 = b.z + b.d + g;
  const { u, v, w, h, d } = b;
  // Each face: top-left corner, u axis end, v axis end, and texture rect.
  type V3 = [number, number, number];
  const faces: [V3, V3, V3, number, number, number, number][] = [
    // front (-Z): image left is entity right (-X)
    [[x0, y0, z0], [x1, y0, z0], [x0, y1, z0], u + d, v + d, w, h],
    // back (+Z)
    [[x1, y0, z1], [x0, y0, z1], [x1, y1, z1], u + d + w + d, v + d, w, h],
    // right side (-X)
    [[x0, y0, z1], [x0, y0, z0], [x0, y1, z1], u, v + d, d, h],
    // left side (+X)
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z0], u + d + w, v + d, d, h],
    // top (-Y in model space)
    [[x0, y0, z1], [x1, y0, z1], [x0, y0, z0], u + d, v, w, d],
    // bottom (+Y)
    [[x0, y1, z0], [x1, y1, z0], [x0, y1, z1], u + d + w, v, w, d],
  ];
  for (const [tl, tr, bl, ru, rv, rw, rh] of faces) {
    const n = pos.length / 3;
    const br: V3 = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1], tr[2] + bl[2] - tl[2]];
    pos.push(...tl, ...tr, ...br, ...bl);
    let ul = ru;
    let ur = ru + rw;
    if (b.mirror) [ul, ur] = [ur, ul];
    uv.push(ul / tw, rv / th, ur / tw, rv / th, ur / tw, (rv + rh) / th, ul / tw, (rv + rh) / th);
    index.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
}

export function boxGeometry(boxes: BoxSpec[], tw: number, th: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (const b of boxes) {
    if (b.mirror) {
      // Mirrored boxes render as a mirror image of the unmirrored box, like vanilla.
      pushMirrored(b, tw, th, pos, uv, index);
    } else pushBox(b, tw, th, pos, uv, index);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function pushMirrored(
  b: BoxSpec,
  tw: number,
  th: number,
  pos: number[],
  uv: number[],
  index: number[],
) {
  // Build the box mirrored around its own X center.
  const start = pos.length;
  pushBox({ ...b, mirror: false }, tw, th, pos, uv, index);
  const cx = b.x + b.w / 2;
  for (let i = start; i < pos.length; i += 3) pos[i] = 2 * cx - pos[i];
}

export interface PartSpec {
  name: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  boxes: BoxSpec[];
  /** Optional overlay boxes using a second texture (sheep fur). */
  overlay?: BoxSpec[];
  children?: PartSpec[];
}

export interface ModelSpec {
  texW: number;
  texH: number;
  parts: PartSpec[];
  overlayTexW?: number;
  overlayTexH?: number;
}

const bx = (
  u: number,
  v: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  extra: Partial<BoxSpec> = {},
): BoxSpec => ({
  u,
  v,
  x,
  y,
  z,
  w,
  h,
  d,
  ...extra,
});

const HALF_PI = Math.PI / 2;

function humanoid(wide64: boolean, slim: boolean, overlays: boolean): ModelSpec {
  const arm = slim ? 2 : 4;
  const parts: PartSpec[] = [
    {
      name: 'head',
      pivot: [0, 0, 0],
      boxes: [bx(0, 0, -4, -8, -4, 8, 8, 8), bx(32, 0, -4, -8, -4, 8, 8, 8, { inflate: 0.5 })],
    },
    {
      name: 'body',
      pivot: [0, 0, 0],
      boxes: [
        bx(16, 16, -4, 0, -2, 8, 12, 4),
        ...(overlays ? [bx(16, 32, -4, 0, -2, 8, 12, 4, { inflate: 0.25 })] : []),
      ],
    },
    {
      name: 'rightArm',
      pivot: [-5, 2, 0],
      boxes: slim
        ? [bx(40, 16, -1, -2, -1, 2, 12, 2)]
        : [
            bx(40, 16, -3, -2, -2, arm, 12, 4),
            ...(overlays ? [bx(40, 32, -3, -2, -2, 4, 12, 4, { inflate: 0.25 })] : []),
          ],
    },
    {
      name: 'leftArm',
      pivot: [5, 2, 0],
      boxes: slim
        ? [bx(40, 16, -1, -2, -1, 2, 12, 2, { mirror: true })]
        : wide64
          ? [
              bx(32, 48, -1, -2, -2, 4, 12, 4),
              ...(overlays ? [bx(48, 48, -1, -2, -2, 4, 12, 4, { inflate: 0.25 })] : []),
            ]
          : [bx(40, 16, -1, -2, -2, 4, 12, 4, { mirror: true })],
    },
    {
      name: 'rightLeg',
      pivot: [slim ? -2 : -1.9, 12, 0],
      boxes: slim
        ? [bx(0, 16, -1, 0, -1, 2, 12, 2)]
        : [
            bx(0, 16, -2, 0, -2, 4, 12, 4),
            ...(overlays ? [bx(0, 32, -2, 0, -2, 4, 12, 4, { inflate: 0.25 })] : []),
          ],
    },
    {
      name: 'leftLeg',
      pivot: [slim ? 2 : 1.9, 12, 0],
      boxes: slim
        ? [bx(0, 16, -1, 0, -1, 2, 12, 2, { mirror: true })]
        : wide64
          ? [
              bx(16, 48, -2, 0, -2, 4, 12, 4),
              ...(overlays ? [bx(0, 48, -2, 0, -2, 4, 12, 4, { inflate: 0.25 })] : []),
            ]
          : [bx(0, 16, -2, 0, -2, 4, 12, 4, { mirror: true })],
    },
  ];
  return { texW: 64, texH: wide64 ? 64 : 32, parts };
}

function quadruped(opts: {
  head: PartSpec;
  body: BoxSpec[];
  bodyPivot: [number, number, number];
  legs: BoxSpec;
  legPivots: [number, number, number][];
  bodyOverlay?: BoxSpec[];
  legOverlay?: BoxSpec;
}): ModelSpec {
  return {
    texW: 64,
    texH: 32,
    overlayTexW: 64,
    overlayTexH: 32,
    parts: [
      opts.head,
      {
        name: 'body',
        pivot: opts.bodyPivot,
        rotation: [HALF_PI, 0, 0],
        boxes: opts.body,
        overlay: opts.bodyOverlay,
      },
      ...opts.legPivots.map((pivot, i) => ({
        name: `leg${i}`,
        pivot,
        boxes: [opts.legs],
        overlay: opts.legOverlay ? [opts.legOverlay] : undefined,
      })),
    ],
  };
}

export const MODELS = {
  steve: humanoid(true, false, true),
  zombie: humanoid(true, false, true),
  skeleton: humanoid(false, true, false),
  creeper: {
    texW: 64,
    texH: 32,
    parts: [
      { name: 'head', pivot: [0, 6, 0], boxes: [bx(0, 0, -4, -8, -4, 8, 8, 8)] },
      { name: 'body', pivot: [0, 6, 0], boxes: [bx(16, 16, -4, 0, -2, 8, 12, 4)] },
      { name: 'leg0', pivot: [-2, 18, 4], boxes: [bx(0, 16, -2, 0, -2, 4, 6, 4)] },
      { name: 'leg1', pivot: [2, 18, 4], boxes: [bx(0, 16, -2, 0, -2, 4, 6, 4)] },
      { name: 'leg2', pivot: [-2, 18, -4], boxes: [bx(0, 16, -2, 0, -2, 4, 6, 4)] },
      { name: 'leg3', pivot: [2, 18, -4], boxes: [bx(0, 16, -2, 0, -2, 4, 6, 4)] },
    ],
  } satisfies ModelSpec,
  pig: quadruped({
    head: {
      name: 'head',
      pivot: [0, 12, -6],
      boxes: [bx(0, 0, -4, -4, -8, 8, 8, 8), bx(16, 16, -2, 0, -9, 4, 3, 1)],
    },
    body: [bx(28, 8, -5, -10, -7, 10, 16, 8)],
    bodyPivot: [0, 11, 2],
    legs: bx(0, 16, -2, 0, -2, 4, 6, 4),
    legPivots: [
      [-3, 18, 7],
      [3, 18, 7],
      [-3, 18, -5],
      [3, 18, -5],
    ],
  }),
  cow: quadruped({
    head: {
      name: 'head',
      pivot: [0, 4, -8],
      boxes: [
        bx(0, 0, -4, -4, -6, 8, 8, 6),
        bx(22, 0, -5, -5, -4, 1, 3, 1),
        bx(22, 0, 4, -5, -4, 1, 3, 1),
      ],
    },
    body: [bx(18, 4, -6, -10, -7, 12, 18, 10), bx(52, 0, -2, 2, -8, 4, 6, 1)],
    bodyPivot: [0, 5, 2],
    legs: bx(0, 16, -2, 0, -2, 4, 12, 4),
    legPivots: [
      [-4, 12, 7],
      [4, 12, 7],
      [-4, 12, -6],
      [4, 12, -6],
    ],
  }),
  sheep: quadruped({
    head: {
      name: 'head',
      pivot: [0, 6, -8],
      boxes: [bx(0, 0, -3, -4, -6, 6, 6, 8)],
      overlay: [bx(0, 0, -3, -4, -4, 6, 6, 6, { inflate: 0.6 })],
    },
    body: [bx(28, 8, -4, -10, -7, 8, 16, 6)],
    bodyOverlay: [bx(28, 8, -4, -10, -7, 8, 16, 6, { inflate: 1.75 })],
    bodyPivot: [0, 5, 2],
    legs: bx(0, 16, -2, 0, -2, 4, 12, 4),
    legOverlay: bx(0, 16, -2, 0, -2, 4, 6, 4, { inflate: 0.5 }),
    legPivots: [
      [-3, 12, 7],
      [3, 12, 7],
      [-3, 12, -5],
      [3, 12, -5],
    ],
  }),
  chicken: {
    texW: 64,
    texH: 32,
    parts: [
      {
        name: 'head',
        pivot: [0, 15, -4],
        boxes: [
          bx(0, 0, -2, -6, -2, 4, 6, 3),
          bx(14, 0, -2, -4, -4, 4, 2, 2),
          bx(14, 4, -1, -2, -3, 2, 2, 2),
        ],
      },
      {
        name: 'body',
        pivot: [0, 16, 0],
        rotation: [HALF_PI, 0, 0],
        boxes: [bx(0, 9, -3, -4, -3, 6, 8, 6)],
      },
      { name: 'leg0', pivot: [-2, 19, 1], boxes: [bx(26, 0, -1, 0, -3, 3, 5, 3)] },
      { name: 'leg1', pivot: [1, 19, 1], boxes: [bx(26, 0, -1, 0, -3, 3, 5, 3)] },
      { name: 'wing0', pivot: [-4, 13, 0], boxes: [bx(24, 13, 0, 0, -3, 1, 4, 6)] },
      { name: 'wing1', pivot: [4, 13, 0], boxes: [bx(24, 13, -1, 0, -3, 1, 4, 6)] },
    ],
  } satisfies ModelSpec,
} as const;
export type ModelName = keyof typeof MODELS;

export interface ModelInstance {
  root: THREE.Group;
  parts: Record<string, THREE.Group>;
  materials: THREE.MeshBasicMaterial[];
  overlay?: THREE.Group[];
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, boxes: BoxSpec[], tw: number, th: number) {
  let g = geometryCache.get(key);
  if (!g) {
    g = boxGeometry(boxes, tw, th);
    geometryCache.set(key, g);
  }
  return g;
}

export function disposeModelGeometry() {
  for (const g of geometryCache.values()) g.dispose();
  geometryCache.clear();
}

/** Instantiate a model with the given skin texture (and optional overlay texture). */
export function buildModel(
  name: ModelName,
  texture: THREE.Texture,
  overlayTexture?: THREE.Texture,
): ModelInstance {
  const spec: ModelSpec = MODELS[name];
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    alphaTest: 0.1,
    side: THREE.DoubleSide,
  });
  const materials = [material];
  let overlayMaterial: THREE.MeshBasicMaterial | undefined;
  if (overlayTexture) {
    overlayMaterial = new THREE.MeshBasicMaterial({
      map: overlayTexture,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });
    materials.push(overlayMaterial);
  }
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.rotation.z = Math.PI;
  inner.position.y = 24 / 16;
  inner.scale.setScalar(1 / 16);
  root.add(inner);
  const parts: Record<string, THREE.Group> = {};
  const overlay: THREE.Group[] = [];
  const build = (part: PartSpec, parent: THREE.Object3D) => {
    const g = new THREE.Group();
    g.position.set(...part.pivot);
    g.rotation.order = 'ZYX';
    if (part.rotation) g.rotation.set(...part.rotation);
    g.userData.base = part.rotation ?? [0, 0, 0];
    g.add(
      new THREE.Mesh(
        cachedGeometry(`${name}:${part.name}`, part.boxes, spec.texW, spec.texH),
        material,
      ),
    );
    if (part.overlay && overlayMaterial) {
      const o = new THREE.Group();
      o.add(
        new THREE.Mesh(
          cachedGeometry(
            `${name}:${part.name}:overlay`,
            part.overlay,
            spec.overlayTexW ?? 64,
            spec.overlayTexH ?? 32,
          ),
          overlayMaterial,
        ),
      );
      g.add(o);
      overlay.push(o);
    }
    parent.add(g);
    parts[part.name] = g;
    for (const c of part.children ?? []) build(c, g);
  };
  for (const part of spec.parts) build(part, inner);
  return { root, parts, materials, overlay };
}

export interface Pose {
  limbSwing: number;
  limbAmount: number;
  /** Head yaw relative to the body, radians. */
  headYaw: number;
  headPitch: number;
  /** Arm swing progress 0..1 for attacks. */
  attack: number;
  age: number;
  sneaking?: boolean;
}

/** Apply vanilla-style walk animation to a model. */
export function poseModel(name: ModelName, m: ModelInstance, pose: Pose) {
  const { parts } = m;
  const swing = pose.limbSwing * 0.6662;
  const amount = Math.min(1, pose.limbAmount);
  const head = parts.head;
  if (head) {
    head.rotation.y = -pose.headYaw;
    head.rotation.x = -pose.headPitch;
  }
  if (name === 'steve' || name === 'zombie' || name === 'skeleton') {
    parts.rightLeg.rotation.x = Math.cos(swing) * 1.4 * amount;
    parts.leftLeg.rotation.x = Math.cos(swing + Math.PI) * 1.4 * amount;
    if (name === 'steve') {
      parts.rightArm.rotation.x = Math.cos(swing + Math.PI) * amount;
      parts.leftArm.rotation.x = Math.cos(swing) * amount;
    } else {
      // Zombies and skeletons hold their arms out.
      const bob = Math.sin(pose.age * 0.067) * 0.05;
      parts.rightArm.rotation.x = -HALF_PI + bob;
      parts.leftArm.rotation.x = -HALF_PI - bob;
      parts.rightArm.rotation.z = Math.cos(pose.age * 0.09) * 0.05 + 0.05;
      parts.leftArm.rotation.z = -(Math.cos(pose.age * 0.09) * 0.05 + 0.05);
    }
    if (pose.attack > 0) {
      const a = Math.sin(Math.sqrt(pose.attack) * Math.PI);
      parts.rightArm.rotation.x -= a * 1.2;
      parts.rightArm.rotation.y = Math.sin(pose.attack * Math.PI) * -0.4;
    } else parts.rightArm.rotation.y = 0;
    const sneak = pose.sneaking ? 0.5 : 0;
    parts.body.rotation.x = sneak;
    if (sneak) {
      parts.rightLeg.position.z = 4;
      parts.leftLeg.position.z = 4;
      parts.rightLeg.position.y = 12.2;
      parts.leftLeg.position.y = 12.2;
      head.position.y = 4.2;
      parts.rightArm.position.y = 5.2;
      parts.leftArm.position.y = 5.2;
      parts.rightArm.rotation.x += 0.4;
      parts.leftArm.rotation.x += 0.4;
    } else {
      parts.rightLeg.position.z = 0;
      parts.leftLeg.position.z = 0;
      parts.rightLeg.position.y = 12;
      parts.leftLeg.position.y = 12;
      head.position.y = 0;
      parts.rightArm.position.y = 2;
      parts.leftArm.position.y = 2;
    }
    return;
  }
  for (let i = 0; i < 4; i++) {
    const leg = parts[`leg${i}`];
    if (!leg) continue;
    leg.rotation.x = Math.cos(swing + (i === 1 || i === 2 ? Math.PI : 0)) * 1.4 * amount;
  }
  if (name === 'chicken') {
    const flap = Math.sin(pose.age * 0.9) * (pose.limbAmount > 0.5 ? 1 : 0.1);
    parts.wing0.rotation.z = flap;
    parts.wing1.rotation.z = -flap;
  }
}

export function setModelTint(m: ModelInstance, color: THREE.Color) {
  for (const mat of m.materials) mat.color.copy(color);
}

export function disposeModel(m: ModelInstance) {
  for (const mat of m.materials) mat.dispose();
}
