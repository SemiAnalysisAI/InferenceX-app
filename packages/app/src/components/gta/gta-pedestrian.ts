import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const smooth = (a: number, b: number, v: number) => T.MathUtils.smoothstep(v, a, b);
const JOINTS = [
  ['pelvis', -1, 0, 0, 0],
  ['spine', 0, 0, 0.3, 0],
  ['head', 1, 0, 0.65, 0],
  ['leftThigh', 0, -0.11, -0.08, 0],
  ['leftShin', 3, -0.15, -0.52, 0],
  ['rightThigh', 0, 0.11, -0.08, 0],
  ['rightShin', 5, 0.15, -0.52, 0],
  ['leftArm', 1, -0.2, 0.48, 0],
  ['leftForearm', 7, -0.4, 0.21, 0],
  ['rightArm', 1, 0.2, 0.48, 0],
  ['rightForearm', 9, 0.4, 0.21, 0],
] as const;

// The source GLB is an unrigged A-pose. These weights fit that asset's metre
// coordinates, retaining its vertices, normals, UVs and original materials.
export function pedestrianWeights(x: number, y: number) {
  const side = x < 0 ? 0 : 1;
  const arm = smooth(0.19, 0.29, Math.abs(x)) * smooth(-0.3, -0.12, y);
  if (arm > 0) {
    const forearm = smooth(0.32, 0.46, Math.abs(x));
    return {
      indices: [1, 7 + side * 2, 8 + side * 2, 0],
      weights: [1 - arm, arm * (1 - forearm), arm * forearm, 0],
    };
  }
  if (y < -0.05) {
    const leg = 1 - smooth(-0.27, -0.05, y);
    const shin = 1 - smooth(-0.6, -0.43, y);
    return {
      indices: [0, 3 + side * 2, 4 + side * 2, 0],
      weights: [1 - leg, leg * (1 - shin), leg * shin, 0],
    };
  }
  const head = smooth(0.48, 0.65, y);
  const spine = smooth(0.02, 0.3, y);
  return {
    indices: [0, 1, 2, 0],
    weights: [(1 - head) * (1 - spine), (1 - head) * spine, head, 0],
  };
}

export function rigPedestrian(template: T.Group) {
  const model = template.children[0];
  const bones = JOINTS.map(([name, parent, x, y, z]) => {
    const bone = new T.Bone();
    bone.name = `gta-${name}`;
    const origin = parent < 0 ? [0, 0, 0] : JOINTS.at(parent)!.slice(2);
    bone.position.set(x - Number(origin[0]), y - Number(origin[1]), z - Number(origin[2]));
    return bone;
  });
  JOINTS.forEach(([, parent], i) => (parent < 0 ? model : bones[parent]).add(bones[i]));
  template.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  const meshes: T.Mesh[] = [];
  model.traverse((node) => {
    if ((node as T.Mesh).isMesh) meshes.push(node as T.Mesh);
  });
  for (const original of meshes) {
    const geometry = original.geometry.clone();
    const positions = geometry.getAttribute('position');
    const indices = new Uint16Array(positions.count * 4);
    const weights = new Float32Array(positions.count * 4);
    for (let i = 0; i < positions.count; i++) {
      const skin = pedestrianWeights(positions.getX(i), positions.getY(i));
      indices.set(skin.indices, i * 4);
      weights.set(skin.weights, i * 4);
    }
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    const mesh = new T.SkinnedMesh(geometry, original.material);
    mesh.position.copy(original.position);
    mesh.quaternion.copy(original.quaternion);
    mesh.scale.copy(original.scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Walking limbs can extend outside the source A-pose bounds.
    mesh.frustumCulled = false;
    original.parent!.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, mesh.matrixWorld);
    original.removeFromParent();
    original.geometry.dispose();
  }
  return template;
}

export function clonePedestrian(template: T.Group) {
  const root = clone(template) as T.Group;
  let skeleton: T.Skeleton | undefined;
  root.traverse((node) => {
    const mesh = node as T.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    // SkeletonUtils makes one Skeleton per mesh. All meshes in this export
    // share the same bones; upload only one bone texture per pedestrian.
    if (skeleton) {
      mesh.skeleton = skeleton;
    } else {
      skeleton = mesh.skeleton;
    }
  });
  return root;
}

export function createPedestrianAnimation(root: T.Group) {
  const bones = JOINTS.map(([name]) => root.getObjectByName(`gta-${name}`)!);
  let phase = 0;
  let blend = 0;
  return {
    update(distance: number, dt: number, speed: number) {
      if (dt <= 0) return;
      const moving = Math.abs(distance) > 0.0001;
      const run = smooth(4, 7, Math.abs(speed));
      phase += (distance / T.MathUtils.lerp(1.65, 2.9, run)) * Math.PI * 2;
      blend = T.MathUtils.damp(blend, moving ? 1 : 0, 14, dt);
      const swing = Math.sin(phase) * blend;
      bones[0].position.y = (1 - Math.cos(phase * 2)) * (0.015 + run * 0.025) * blend;
      bones[1].rotation.x = run * 0.12 * blend;
      bones[1].rotation.y = swing * 0.07;
      bones[2].rotation.y = -swing * 0.045;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? 1 : -1;
        const step = swing * sign;
        bones[3 + side * 2].rotation.x = -step * (0.55 + run * 0.35);
        bones[4 + side * 2].rotation.x = Math.max(0, step) * (0.8 + run * 0.65);
        bones[7 + side * 2].rotation.set(step * (0.4 + run * 0.4), 0, sign * 0.43);
        bones[8 + side * 2].rotation.x = -(0.1 + run * 0.8) * blend;
      }
    },
  };
}
