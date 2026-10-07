import * as T from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// The GTADevs ped exports are static A-pose meshes with no skeleton. This
// builds a human skeleton from the mesh proportions, skins every vertex to
// the nearest limb segments and drives a procedural walk / run / idle cycle.

const BONES = [
  'root',
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'armL',
  'forearmL',
  'handL',
  'armR',
  'forearmR',
  'handR',
] as const;
type BoneName = (typeof BONES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  pelvis: 'root',
  spine: 'pelvis',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  thighL: 'pelvis',
  shinL: 'thighL',
  footL: 'shinL',
  thighR: 'pelvis',
  shinR: 'thighR',
  footR: 'shinR',
  armL: 'chest',
  forearmL: 'armL',
  handL: 'forearmL',
  armR: 'chest',
  forearmR: 'armR',
  handR: 'forearmR',
};

interface Joints {
  pos: Record<BoneName, T.Vector3>;
  end: Record<BoneName, T.Vector3>;
}

function measure(meshes: T.Mesh[]): Joints {
  let minY = Infinity,
    maxY = -Infinity,
    tip = 0,
    tipY = 0,
    tipN = 0;
  const v = new T.Vector3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
      tip = Math.max(tip, Math.abs(v.x));
    }
  }
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (Math.abs(v.x) > tip - 0.04) {
        tipY += v.y;
        tipN++;
      }
    }
  }
  tipY /= Math.max(1, tipN);
  const H = maxY - minY;
  const y = (f: number) => minY + H * f;
  const shoulder = new T.Vector3(0.175 * (H / 1.84), y(0.8), -0.01);
  const handTip = new T.Vector3(tip, tipY, 0.01);
  const armDir = handTip.clone().sub(shoulder);
  const armLen = armDir.length();
  armDir.normalize();
  const elbow = shoulder.clone().addScaledVector(armDir, armLen * 0.43);
  const wrist = shoulder.clone().addScaledVector(armDir, armLen * 0.8);
  const hipX = 0.092 * (H / 1.84);
  const pos = {
    root: new T.Vector3(0, minY, 0),
    pelvis: new T.Vector3(0, y(0.545), 0),
    spine: new T.Vector3(0, y(0.63), -0.01),
    chest: new T.Vector3(0, y(0.73), -0.01),
    neck: new T.Vector3(0, y(0.85), -0.01),
    head: new T.Vector3(0, y(0.885), 0),
    thighL: new T.Vector3(hipX, y(0.525), 0),
    shinL: new T.Vector3(hipX * 1.05, y(0.285), 0.015),
    footL: new T.Vector3(hipX * 1.12, y(0.055), -0.03),
    thighR: new T.Vector3(-hipX, y(0.525), 0),
    shinR: new T.Vector3(-hipX * 1.05, y(0.285), 0.015),
    footR: new T.Vector3(-hipX * 1.12, y(0.055), -0.03),
    armL: L(shoulder),
    forearmL: L(elbow),
    handL: L(wrist),
    armR: R(shoulder),
    forearmR: R(elbow),
    handR: R(wrist),
  } as Record<BoneName, T.Vector3>;
  const end = {
    ...pos,
    root: pos.pelvis,
    pelvis: pos.spine,
    spine: pos.chest,
    chest: pos.neck,
    neck: pos.head,
    head: new T.Vector3(0, maxY, 0.02),
    thighL: pos.shinL,
    shinL: pos.footL,
    footL: new T.Vector3(hipX * 1.15, minY + 0.02, 0.14),
    thighR: pos.shinR,
    shinR: pos.footR,
    footR: new T.Vector3(-hipX * 1.15, minY + 0.02, 0.14),
    armL: pos.forearmL,
    forearmL: pos.handL,
    handL: L(handTip),
    armR: pos.forearmR,
    forearmR: pos.handR,
    handR: R(handTip),
  } as Record<BoneName, T.Vector3>;
  return { pos, end };
}

function segDist(p: T.Vector3, a: T.Vector3, b: T.Vector3) {
  const abx = b.x - a.x,
    aby = b.y - a.y,
    abz = b.z - a.z;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) /
        (abx * abx + aby * aby + abz * abz || 1),
    ),
  );
  return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
}

export interface Rig {
  root: T.Group;
  bones: Record<BoneName, T.Bone>;
  height: number;
  /** Pose the character: phase in radians, speed in m/s. */
  pose: (phase: number, speed: number, time: number, down?: boolean) => void;
}

/** Convert a static GTA ped scene into an animated skinned character. */
const L = (a: T.Vector3) => a.clone();
const R = (a: T.Vector3) => new T.Vector3(-a.x, a.y, a.z);

export function rigPed(source: T.Object3D): Rig {
  source.updateMatrixWorld(true);
  const meshes: T.Mesh[] = [];
  source.traverse((n) => {
    if ((n as T.Mesh).isMesh) meshes.push(n as T.Mesh);
  });
  const j = measure(meshes);
  const bones = {} as Record<BoneName, T.Bone>;
  for (const name of BONES) {
    const b = new T.Bone();
    b.name = name;
    bones[name] = b;
  }
  for (const name of BONES) {
    const parent = PARENT[name];
    const b = bones[name];
    if (parent) {
      bones[parent].add(b);
      b.position.copy(j.pos[name]).sub(j.pos[parent]);
    } else b.position.copy(j.pos[name]);
  }
  const root = new T.Group();
  root.add(bones.root);
  root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(BONES.map((n) => bones[n]));
  const index = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;
  const shoulderX = j.pos.armL.x,
    pelvisY = j.pos.pelvis.y,
    shoulderY = j.pos.armL.y;
  const v = new T.Vector3();
  for (const m of meshes) {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const p = g.attributes.position;
    const skinIndex = new Uint16Array(p.count * 4),
      skinWeight = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const side = v.x >= 0 ? 'L' : 'R';
      let candidates: BoneName[];
      const ax = Math.abs(v.x);
      const armZone =
        ax > shoulderX * 0.82 &&
        v.y < shoulderY + 0.06 &&
        v.y > j.pos.thighL.y - 0.45 &&
        ax > shoulderX + (shoulderY - v.y) * 0.18;
      if (armZone)
        candidates = [
          `arm${side}`,
          `forearm${side}`,
          `hand${side}`,
          ...(v.y > shoulderY - 0.12 ? (['chest'] as BoneName[]) : []),
        ] as BoneName[];
      else if (v.y < pelvisY - 0.02)
        candidates = [`thigh${side}`, `shin${side}`, `foot${side}`, 'pelvis'] as BoneName[];
      else candidates = ['pelvis', 'spine', 'chest', 'neck', 'head'];
      const scored = candidates
        .map((n) => ({ n, d: segDist(v, j.pos[n], j.end[n]) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
      let total = 0;
      const w = scored.map((c) => {
        const x = 1 / ((c.d + 0.012) ** 5 + 1e-9);
        total += x;
        return x;
      });
      scored.forEach((c, k) => {
        skinIndex[i * 4 + k] = index[c.n];
        skinWeight[i * 4 + k] = w[k] / total;
      });
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeight, 4));
    const sm = new T.SkinnedMesh(g, m.material);
    sm.castShadow = true;
    sm.receiveShadow = true;
    sm.frustumCulled = false;
    root.add(sm);
    sm.bind(skeleton, new T.Matrix4());
  }
  const height = j.end.head.y - j.pos.root.y;
  // Feet stand on y = 0 in the returned group.
  bones.root.position.y = 0;
  const pose = makePose(bones);
  pose(0, 0, 0);
  return { root, bones, height, pose };
}

function makePose(bones: Record<BoneName, T.Bone>) {
  const restPelvis = bones.pelvis.position.clone();
  return (phase: number, speed: number, time: number, down = false) => {
    const b = bones;
    for (const n of BONES) b[n].rotation.set(0, 0, 0);
    b.pelvis.position.copy(restPelvis);
    if (down) {
      b.root.rotation.x = -Math.PI / 2;
      b.root.position.y = 0.15;
      b.armL.rotation.z = 0.3;
      b.armR.rotation.z = -0.3;
      b.thighL.rotation.x = -0.25;
      b.shinL.rotation.x = 0.5;
      return;
    }
    b.root.rotation.x = 0;
    b.root.position.y = 0;
    const run = Math.min(1, Math.max(0, (speed - 2.2) / 2.5));
    const walk = Math.min(1, speed / 1.2);
    const s = Math.sin(phase),
      c = Math.cos(phase);
    // Arms hang naturally from the A-pose.
    b.armL.rotation.z = -0.5 + run * 0.12;
    b.armR.rotation.z = 0.5 - run * 0.12;
    const breathe = Math.sin(time * 1.7) * 0.012;
    b.chest.rotation.x = breathe - run * 0.06;
    if (walk < 0.02) {
      b.forearmL.rotation.x = -0.12;
      b.forearmR.rotation.x = -0.12;
      b.head.rotation.y = Math.sin(time * 0.31) * 0.25;
      return;
    }
    const hip = (0.42 + run * 0.35) * walk;
    b.thighL.rotation.x = -s * hip;
    b.thighR.rotation.x = s * hip;
    // Knee flexes during swing (leg moving forward) and lightly at heel strike.
    const kneeL = Math.max(0, Math.sin(phase + 1.4)) * (0.7 + run * 0.9) + 0.06;
    const kneeR = Math.max(0, Math.sin(phase + Math.PI + 1.4)) * (0.7 + run * 0.9) + 0.06;
    b.shinL.rotation.x = kneeL * walk;
    b.shinR.rotation.x = kneeR * walk;
    b.footL.rotation.x = (-kneeL * 0.35 + s * 0.15) * walk;
    b.footR.rotation.x = (-kneeR * 0.35 - s * 0.15) * walk;
    b.pelvis.position.y = restPelvis.y + (Math.abs(c) * 0.035 - 0.02 - run * 0.03) * walk;
    b.pelvis.rotation.y = s * 0.09 * walk;
    b.pelvis.rotation.z = c * 0.035 * walk;
    b.spine.rotation.y = -s * 0.07 * walk;
    b.chest.rotation.y = -s * 0.06 * walk;
    b.spine.rotation.x = run * 0.22;
    b.head.rotation.x = -run * 0.15;
    const swing = (0.32 + run * 0.5) * walk;
    b.armL.rotation.x = s * swing;
    b.armR.rotation.x = -s * swing;
    b.forearmL.rotation.x = -(0.25 + run * 1.1 + Math.max(0, -s) * 0.25) * walk;
    b.forearmR.rotation.x = -(0.25 + run * 1.1 + Math.max(0, s) * 0.25) * walk;
  };
}

/** Cheap copy of a rig that shares geometry and materials with the original. */
export function cloneRig(rig: Rig): Rig {
  const root = cloneSkinned(rig.root) as T.Group;
  const bones = {} as Record<BoneName, T.Bone>;
  root.traverse((n) => {
    if ((n as T.Bone).isBone) bones[n.name as BoneName] = n as T.Bone;
  });
  const pose = makePose(bones);
  pose(0, 0, 0);
  return { root, bones, height: rig.height, pose };
}
