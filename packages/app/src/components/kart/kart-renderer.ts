import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { trackPose, type Race } from './kart-engine';

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}

export function createKartRenderer(canvas: HTMLCanvasElement, assetBase = '/decorative/kart') {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8ed7f5');
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 5000);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const cars: THREE.Object3D[] = [];
  const surfaces: THREE.Object3D[] = [];
  const colors = ['#e32730', '#20a349', '#2588ec', '#ffc62b'];
  let disposed = false;
  let cameraSet = false;
  const controller = new AbortController();
  const load = async (url: string) => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Asset load failed: ${response.status}`);
    const asset = await new GLTFLoader().parseAsync(await response.text(), '');
    if (disposed) {
      disposeObject(asset.scene);
      throw new Error('Closed');
    }
    return asset.scene;
  };
  const ready = (async () => {
    // Sequential loading means a failed course cannot leave an orphaned kart asset.
    const track = await load(`${assetBase}/luigi-circuit.gltf`);
    scene.add(track);
    track.traverse((node) => {
      if (
        node instanceof THREE.Mesh &&
        ['polygon8', 'polygon0', 'polygon3', 'polygon1'].includes(node.name)
      )
        surfaces.push(node);
    });
    const model = await load(`${assetBase}/mario-kart.gltf`);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = 6 / Math.max(size.x, size.z);
    model.scale.multiplyScalar(scale);
    const ground = new THREE.Box3().setFromObject(model);
    model.position.y -= ground.min.y;
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Group();
      root.add(i === 0 ? model : clone(model));
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.5, 4.1, 32),
        new THREE.MeshBasicMaterial({ color: colors[i], side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      root.add(ring);
      scene.add(root);
      cars.push(root);
    }
    scene.updateMatrixWorld(true);
  })();
  return {
    ready,
    resize(width: number, height: number) {
      if (disposed) return;
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    draw(race: Race, dt: number, reducedMotion: boolean) {
      if (disposed || cars.length === 0) return;
      [race.player, ...race.opponents].forEach((r, i) => {
        const pose = trackPose(r.distance, r.lane);
        ray.set(new THREE.Vector3(pose.position.x, 90, pose.position.z), down);
        const hit = ray.intersectObjects(surfaces, false)[0];
        pose.position.y = (hit?.point.y ?? 0) + 0.25;
        cars[i].position.copy(pose.position);
        cars[i].rotation.y =
          pose.heading + (i === 0 && race.drifting ? Math.sign(race.player.lane || 1) * 0.22 : 0);
      });
      const p = cars[0].position;
      const heading = trackPose(race.player.distance).heading;
      const behind = new THREE.Vector3(-Math.sin(heading) * 22, 13, -Math.cos(heading) * 22).add(p);
      if (!cameraSet || reducedMotion || race.phase === 'ready') camera.position.copy(behind);
      else camera.position.lerp(behind, 1 - Math.exp(-dt * 9));
      cameraSet = true;
      const ahead = trackPose(race.player.distance + 30, race.player.lane).position;
      ahead.y = p.y + 4;
      camera.lookAt(ahead);
      const fov = !reducedMotion && race.turbo > 0 ? 66 : 58;
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      disposed = true;
      controller.abort();
      disposeObject(scene);
      renderer.dispose();
      // React Strict Mode reuses the canvas after effect cleanup. Keep its
      // context reusable; dispose() and scene disposal release our GPU objects.
    },
  };
}
