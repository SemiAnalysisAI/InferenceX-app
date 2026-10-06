import { describe, expect, it } from 'vitest';
import * as T from 'three';
import {
  clonePedestrian,
  createPedestrianAnimation,
  pedestrianWeights,
  rigPedestrian,
} from './gta-pedestrian';

function character() {
  const root = new T.Group();
  const model = new T.Group();
  model.position.y = 1.004;
  root.add(model);
  const geometry = new T.BufferGeometry();
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute([-0.16, -0.92, 0, 0.16, -0.92, 0, 0, 0.75, 0], 3),
  );
  model.add(new T.Mesh(geometry, new T.MeshStandardMaterial()));
  return rigPedestrian(root);
}
function mesh(root: T.Object3D) {
  let result!: T.SkinnedMesh;
  root.traverse((node) => {
    if ((node as T.SkinnedMesh).isSkinnedMesh) result = node as T.SkinnedMesh;
  });
  return result;
}
function vertex(root: T.Object3D, i: number) {
  root.updateMatrixWorld(true);
  const m = mesh(root);
  m.skeleton.update();
  return m.getVertexPosition(i, new T.Vector3());
}

describe('GTA pedestrian locomotion', () => {
  it('normalizes skin weights throughout the source character bounds', () => {
    for (let x = -0.6; x <= 0.6; x += 0.03)
      for (let y = -1.01; y <= 0.85; y += 0.03) {
        const skin = pedestrianWeights(x, y);
        expect(skin.weights.reduce((sum, v) => sum + v, 0)).toBeCloseTo(1);
        expect(skin.weights.every((v) => v >= 0 && v <= 1)).toBe(true);
        expect(skin.indices.every((i) => i >= 0 && i < 11)).toBe(true);
      }
  });
  it('preserves the source mesh bind pose and grounds the model unchanged', () => {
    const root = character();
    expect(vertex(root, 0).y).toBeCloseTo(-0.92);
    expect(vertex(root, 2).y).toBeCloseTo(0.75);
    expect(root.children[0].position.y).toBe(1.004);
  });
  it('moves actual foot vertices in opposite directions while walking', () => {
    const root = character();
    const animator = createPedestrianAnimation(root);
    animator.update(1.65 / 4, 0.1, 3.5);
    expect(vertex(root, 0).z).toBeGreaterThan(0.05);
    expect(vertex(root, 1).z).toBeLessThan(-0.05);
    const leftArm = root.getObjectByName('gta-leftArm')!;
    const leftLeg = root.getObjectByName('gta-leftThigh')!;
    expect(leftArm.rotation.x * leftLeg.rotation.x).toBeLessThan(0);
  });
  it('gives every pedestrian independent bones while sharing geometry', () => {
    const source = character();
    const a = clonePedestrian(source);
    const b = clonePedestrian(source);
    createPedestrianAnimation(a).update(0.4, 0.1, 3.5);
    expect(mesh(a).geometry).toBe(mesh(b).geometry);
    expect(mesh(a).skeleton).not.toBe(mesh(b).skeleton);
    expect(vertex(a, 0).z).not.toBeCloseTo(vertex(b, 0).z);
    expect(vertex(b, 0).z).toBeCloseTo(0);
  });
  it('bends knees more deeply when sprinting', () => {
    const walk = character();
    const run = character();
    createPedestrianAnimation(walk).update(1.65 / 4, 0.1, 3.5);
    createPedestrianAnimation(run).update(2.9 / 4, 0.1, 8);
    expect(run.getObjectByName('gta-leftShin')!.rotation.x).toBeGreaterThan(
      walk.getObjectByName('gta-leftShin')!.rotation.x,
    );
  });
  it('reverses the stride when backing up', () => {
    const forward = character();
    const backward = character();
    createPedestrianAnimation(forward).update(0.4, 0.1, 3.5);
    createPedestrianAnimation(backward).update(-0.4, 0.1, -3.5);
    expect(forward.getObjectByName('gta-leftThigh')!.rotation.x).toBeLessThan(0);
    expect(backward.getObjectByName('gta-leftThigh')!.rotation.x).toBeGreaterThan(0);
  });
  it('freezes while paused and settles when stopped or blocked', () => {
    const root = character();
    const animator = createPedestrianAnimation(root);
    animator.update(0.4, 0.1, 3.5);
    const leg = root.getObjectByName('gta-leftThigh')!;
    const angle = leg.rotation.x;
    animator.update(0, 0, 3.5);
    expect(leg.rotation.x).toBe(angle);
    for (let i = 0; i < 60; i++) animator.update(0, 1 / 60, 0);
    expect(Math.abs(leg.rotation.x)).toBeLessThan(0.00001);
  });
});
