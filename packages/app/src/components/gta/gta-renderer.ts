import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { BUILDINGS, GARAGE, JOBS, STREETS, type Point } from './gta-world';
import type { CityState } from './gta-engine';

export const MODEL_NAMES = [
  'adder',
  'buffalo',
  'blista',
  'taxi',
  'police',
  'michael',
  'palm',
  'lamp',
  'signal',
  'bin',
  'bench',
  'hydrant',
  'cone',
  'dumpster',
] as const;
type ModelName = (typeof MODEL_NAMES)[number];
const BASE = '/decorative/gta/models/';
const mat = (color: string, extra: Partial<T.MeshStandardMaterialParameters> = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

export function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  scene.traverse((n) => {
    const m = n as T.Mesh;
    if (m.geometry) geometries.add(m.geometry);
    if (m.material)
      for (const material of Array.isArray(m.material) ? m.material : [m.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof T.Texture) textures.add(value);
      }
  });
  textures.forEach((t) => {
    const image = t.source.data;
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
    t.dispose();
  });
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}
export async function createCityRenderer(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  onProgress: (done: number) => void,
) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(),
    city = new T.Group(),
    atlas = new T.Group();
  scene.add(city, atlas);
  atlas.visible = false;
  const camera = new T.PerspectiveCamera(62, 1, 0.2, 18000);
  const sky = new T.Color('#b5d7e4');
  scene.background = sky;
  scene.fog = new T.Fog('#b5d7e4', 250, 1100);
  const ambient = new T.HemisphereLight('#d9e9ff', '#c2b1a0', 2.5);
  scene.add(ambient);
  const sun = new T.DirectionalLight('#fff0cd', 3);
  sun.position.set(-200, 500, 180);
  scene.add(sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -110,
    right: 110,
    top: 110,
    bottom: -110,
    near: 1,
    far: 900,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.001;
  scene.add(sun.target);
  const models = {} as Record<ModelName, T.Group>;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let disposed = false,
    atlasLoaded = false;
  let helicopter: T.Group | null = null;
  const load = async (name: string) => {
    const response = await fetch(`${BASE}${name}.glb`, { signal });
    if (!response.ok) throw new Error(`Unable to load ${name}: ${response.status}`);
    const result = await loader.parseAsync(await response.arrayBuffer(), BASE);
    if (signal.aborted || disposed) {
      disposeScene(result.scene);
      throw new DOMException('Aborted', 'AbortError');
    }
    return result.scene;
  };
  try {
    // Limit simultaneous decoding and texture allocations on mobile.
    let done = 0;
    const loadModel = async (name: ModelName) => {
      const model = await load(name);
      // Fragment exports omit the original attachment transforms. Reassemble
      // streetlight heads instead of leaving their detached pieces on the road.
      if (name === 'lamp' || name === 'signal')
        model.children.forEach((part, i) => {
          if (i < 2) return;
          part.position.y = name === 'lamp' ? 8.6 : 8;
          if (name === 'signal' && ![6, 7, 11].includes(i)) part.position.x = -4.2;
        });
      model.traverse((n) => {
        const mesh = n as T.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          const m = material as T.MeshStandardMaterial;
          // Some exported shared GTA texture dictionaries are absent. Tint those
          // materials explicitly; do not pretend they are original textures.
          if (name === 'palm') {
            m.color.set(m.alphaTest > 0 ? '#3e6b35' : '#78604b');
          } else if (name === 'lamp' || name === 'signal') {
            m.color.set('#8b9292');
            m.roughness = 0.65;
          }
          if (['adder', 'buffalo', 'blista'].includes(name) && !m.transparent) {
            m.color.set(name === 'adder' ? '#7796a2' : name === 'buffalo' ? '#a45440' : '#5e7278');
          }
        }
      });
      const bounds = new T.Box3().setFromObject(model);
      model.position.y = -bounds.min.y;
      const wrapped = new T.Group();
      wrapped.add(model);
      models[name] = wrapped;
      onProgress(++done);
    };
    for (let i = 0; i < MODEL_NAMES.length; i += 3) {
      await Promise.all(MODEL_NAMES.slice(i, i + 3).map(loadModel));
    }
  } catch (error) {
    disposed = true;
    Object.values(models).forEach(disposeScene);
    renderer.dispose();
    throw error;
  }
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const box = (
    root: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: T.Material,
  ) => {
    const mesh = new T.Mesh(boxGeo, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = h > 1;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const asphalt = mat('#42464b'),
    sidewalk = mat('#adaba1'),
    grass = mat('#64845b'),
    sand = mat('#d9c99e');
  const white = mat('#eeead5'),
    yellow = mat('#d5b566'),
    metal = mat('#565e61'),
    wood = mat('#9c7954');
  box(city, 200, -0.55, 200, 680, 1, 680, grass);
  box(city, -175, -0.6, 200, 110, 0.7, 680, sand);
  const water = new T.Mesh(
    new T.PlaneGeometry(16000, 16000),
    new T.MeshStandardMaterial({ color: '#23868c', metalness: 0.55, roughness: 0.25 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-1000, -1.1, 0);
  scene.add(water);
  for (const v of STREETS) {
    box(city, 200, -0.04, v, 654, 0.12, 26, asphalt);
    box(city, v, -0.03, 200, 26, 0.12, 654, asphalt);
    for (const side of [-1, 1]) {
      box(city, 200, 0.12, v + side * 16, 654, 0.24, 6, sidewalk);
      box(city, v + side * 16, 0.12, 200, 6, 0.24, 654, sidewalk);
    }
    for (let p = -120; p < 520; p += 12) {
      if (STREETS.some((s) => Math.abs(s - p) < 20)) continue;
      box(city, p, 0.04, v, 5, 0.03, 0.18, yellow);
      box(city, v, 0.05, p, 0.18, 0.03, 5, yellow);
    }
  }
  // Crosswalks and paved junctions remain flush with driveable ground.
  for (const x of STREETS)
    for (const z of STREETS) {
      box(city, x, 0.27, z, 37, 0.01, 37, asphalt);
      for (let stripe = -10; stripe <= 10; stripe += 4)
        for (const s of [-1, 1]) {
          box(city, x + stripe, 0.29, z + s * 12, 2, 0.02, 4, white);
          box(city, x + s * 12, 0.29, z + stripe, 4, 0.02, 2, white);
        }
    }
  function facade(color: string, glass: string) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 256; y += 24)
      for (let x = 8; x < 128; x += 24) {
        ctx.fillStyle = glass;
        ctx.fillRect(x, y, 15, 16);
        ctx.fillStyle = '#d5d5cb';
        ctx.fillRect(x, y + 16, 16, 2);
      }
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    return mat('#ffffff', { map: texture });
  }
  const facades = [
    facade('#a6a5a0', '#546c78'),
    facade('#b9a393', '#6c777d'),
    facade('#6e818c', '#bdd1d6'),
    facade('#c6beaa', '#536568'),
  ];
  const roof = mat('#686a69');
  for (const b of BUILDINGS) {
    box(city, b.x, b.h / 2, b.z, b.w, b.h, b.d, facades[b.style]);
    box(city, b.x, b.h + 0.4, b.z, b.w + 1, 0.8, b.d + 1, roof);
    box(city, b.x, b.h + 1.6, b.z, 5, 2, 4, metal);
    box(city, b.x, 1.6, b.z - b.d / 2 - 0.1, 7, 3, 0.25, metal);
  }
  // Roof lettering and street signs use local canvas textures, not additional fonts.
  function sign(text: string, x: number, y: number, z: number, w: number, color = '#255f4c') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64, 480);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(
      new T.PlaneGeometry(w, w / 4),
      new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
    );
    m.position.set(x, y, z);
    city.add(m);
  }
  sign('LOS SANTOS', 0, 8, -16, 20);
  sign('CUSTOMS', GARAGE.x, 6, GARAGE.z - 18, 16, '#956b27');
  sign('VINEWOOD', 350, 136, 330, 65, '#394646');
  sign('VESPUCCI BEACH', -108, 6, -100, 18);
  sign('INFERENCEX', 250, 78, 218, 35, '#252c36');
  const instanceModels = (name: ModelName, points: (Point & { angle?: number })[]) => {
    const source = models[name];
    source.updateMatrixWorld(true);
    source.traverse((n) => {
      const m = n as T.Mesh;
      if (!m.isMesh) return;
      const im = new T.InstancedMesh(m.geometry, m.material, points.length);
      const transform = new T.Matrix4(),
        q = new T.Quaternion(),
        s = new T.Vector3(1, 1, 1);
      points.forEach((p, i) => {
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), p.angle || 0);
        transform.compose(new T.Vector3(p.x, 0.3, p.z), q, s).multiply(m.matrixWorld);
        im.setMatrixAt(i, transform);
      });
      im.computeBoundingSphere();
      city.add(im);
    });
  };
  const palms: Point[] = [],
    lamps: Point[] = [],
    bins: Point[] = [],
    benches: Point[] = [];
  for (let z = -110; z < 520; z += 32) {
    palms.push({ x: -119, z });
    benches.push({ x: -118, z: z + 10 });
  }
  for (const x of STREETS)
    for (let z = -70; z < 500; z += 50) {
      lamps.push({ x: x + 16, z });
      if (x >= 0) palms.push({ x: x - 17, z: z + 9 });
    }
  for (let x = 20; x < 500; x += 100)
    for (let z = 10; z < 500; z += 100) bins.push({ x, z: z + 8 });
  instanceModels('palm', palms);
  instanceModels('lamp', lamps);
  instanceModels('bin', bins);
  instanceModels('bench', benches);
  instanceModels(
    'hydrant',
    bins.map((p) => ({ x: p.x - 4, z: p.z + 2 })),
  );
  instanceModels(
    'dumpster',
    BUILDINGS.filter((_, i) => i % 8 === 0).map((b) => ({ x: b.x + 17, z: b.z })),
  );
  instanceModels(
    'signal',
    STREETS.flatMap((x) => STREETS.map((z) => ({ x: x + 16, z: z + 16 }))),
  );
  instanceModels('cone', [
    { x: -108, z: 88 },
    { x: -105, z: 88 },
    { x: -102, z: 88 },
  ]);
  // Park, waterfront boardwalk and amusement pier.
  box(city, 50, 0.03, 150, 65, 0.15, 65, grass);
  box(city, -198, 0, 300, 150, 0.6, 22, wood);
  const wheel = new T.Group();
  wheel.position.set(-239, 19, 300);
  city.add(wheel);
  const rim = new T.Mesh(new T.TorusGeometry(16, 0.35, 6, 64), metal);
  wheel.add(rim);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6,
      x = Math.sin(a) * 16,
      y = Math.cos(a) * 16;
    const spoke = box(wheel, 0, 0, 0, 0.12, 32, 0.12, white);
    spoke.rotation.z = a;
    box(wheel, x, y, 0, 3, 2.6, 2.4, mat(i % 2 ? '#d55944' : '#e3be64'));
  }
  box(city, -239, 10, 300, 1, 20, 1, metal);
  const markerMat = new T.MeshBasicMaterial({
    color: '#f1db74',
    transparent: true,
    opacity: 0.8,
    side: T.DoubleSide,
  });
  const markers = JOBS.map((p) => {
    const m = new T.Mesh(new T.TorusGeometry(8, 0.18, 6, 48), markerMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.5, p.z);
    city.add(m);
    return m;
  });
  // Thousands of road markings and building pieces share a few draw calls.
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const child of city.children) {
    if (child instanceof T.Mesh && child.geometry === boxGeo && !Array.isArray(child.material)) {
      const list = batches.get(child.material) || [];
      list.push(child);
      batches.set(child.material, list);
    }
  }
  for (const [material, meshes] of batches) {
    const instances = new T.InstancedMesh(boxGeo, material, meshes.length);
    meshes.forEach((mesh, i) => {
      mesh.updateMatrix();
      instances.setMatrixAt(i, mesh.matrix);
      city.remove(mesh);
    });
    instances.castShadow = meshes.some((m) => m.castShadow);
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    city.add(instances);
  }
  const carGroup = new T.Group();
  city.add(carGroup);
  let carName = '';
  const traffic: T.Group[] = [],
    police: T.Group[] = [];
  const person = models.michael.clone(true);
  city.add(person);
  const headlights = new T.SpotLight('#fff1c7', 0, 70, 0.42, 0.8, 1);
  const headTarget = new T.Object3D();
  scene.add(headlights, headTarget);
  headlights.target = headTarget;
  const peds = Array.from({ length: 14 }, (_, i) => {
    const p = models.michael.clone(true);
    p.scale.setScalar(0.97 + (i % 3) * 0.03);
    city.add(p);
    return p;
  });
  const tmp = new T.Vector3();
  let snap = true;
  function render(s: CityState, overview = false) {
    if (disposed) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    city.visible = !s.explorer;
    atlas.visible = s.explorer;
    const night = s.night;
    sky.set(night ? '#101d31' : '#b5d7e4');
    (scene.fog as T.Fog).color.copy(sky);
    (scene.fog as T.Fog).near = s.explorer ? 6000 : 250;
    (scene.fog as T.Fog).far = s.explorer ? 17000 : 1100;
    ambient.intensity = night ? 0.65 : s.explorer ? 2.2 : 1.4;
    sun.intensity = night ? 0.25 : 2;
    sun.color.set(night ? '#a4c7ff' : '#fff0cd');
    if (carName !== s.vehicle) {
      carGroup.clear();
      carGroup.add(models[s.vehicle].clone(true));
      carName = s.vehicle;
    }
    carGroup.position.set(s.car.x, 0.3, s.car.z);
    carGroup.rotation.y = s.car.angle + Math.PI;
    person.visible = s.onFoot;
    person.position.set(
      s.player.x,
      0.3 + (s.onFoot ? Math.abs(Math.sin(s.elapsed * 10)) * 0.06 : 0),
      s.player.z,
    );
    person.rotation.y = s.player.angle;
    s.traffic.forEach((t, i) => {
      if (!traffic[i]) {
        traffic[i] = models[t.model].clone(true);
        city.add(traffic[i]);
      }
      traffic[i].position.set(t.x, 0.3, t.z);
      traffic[i].rotation.y = t.angle + Math.PI;
    });
    for (let i = 0; i < Math.max(police.length, s.police.length); i++) {
      const p = s.police[i];
      if (!police[i] && p) {
        police[i] = models.police.clone(true);
        city.add(police[i]);
        const lamp = new T.PointLight('#ff2222', 3, 16);
        lamp.position.y = 2.5;
        police[i].add(lamp);
      }
      if (!police[i]) continue;
      police[i].visible = Boolean(p);
      if (p) {
        police[i].position.set(p.x, 0.3, p.z);
        police[i].rotation.y = p.angle + Math.PI;
        const light = police[i].children.at(-1) as T.PointLight;
        light.color.set(Math.sin(s.elapsed * 12) > 0 ? '#ff2233' : '#2288ff');
      }
    }
    peds.forEach((p, i) => {
      p.position.set(17 + (i % 5) * 100, 0.3, ((i * 63 + s.elapsed * 1.2) % 520) - 100);
      p.rotation.y = 0;
    });
    markers.forEach((m, i) => {
      m.visible = i === Math.min(s.job, 4);
      m.position.y = 0.5 + Math.sin(s.elapsed * 2) * 0.2;
    });
    wheel.rotation.z = s.elapsed * 0.08;
    const a = s.player.angle;
    if (s.explorer) {
      tmp.set(s.player.x - Math.sin(a) * 22, s.altitude + 8, s.player.z - Math.cos(a) * 22);
      camera.position.copy(tmp);
      camera.lookAt(s.player.x + Math.sin(a) * 25, s.altitude - 12, s.player.z + Math.cos(a) * 25);
      if (helicopter) {
        helicopter.position.set(s.player.x, s.altitude, s.player.z);
        helicopter.rotation.y = a + Math.PI;
      }
    } else if (overview) {
      camera.position.set(180, 830, 201);
      camera.lookAt(180, 0, 200);
    } else {
      const dist = s.onFoot ? 5 : s.camera === 1 ? 0.2 : 10 + Math.abs(s.car.speed) * 0.05;
      const height = s.onFoot ? 3.1 : s.camera === 1 ? 1.6 : 5.2;
      tmp.set(s.player.x - Math.sin(a) * dist, height, s.player.z - Math.cos(a) * dist);
      if (snap) camera.position.copy(tmp);
      else camera.position.lerp(tmp, 0.14);
      camera.lookAt(
        s.player.x + Math.sin(a) * 9,
        s.onFoot ? 1.3 : 1.5,
        s.player.z + Math.cos(a) * 9,
      );
    }
    snap = false;
    sun.position.set(s.player.x - 120, 220, s.player.z + 140);
    sun.target.position.set(s.player.x, 0, s.player.z);
    sun.castShadow = !s.explorer;
    headlights.intensity = night && !s.explorer ? 70 : 0;
    headlights.position.set(s.player.x, 1.3, s.player.z);
    headTarget.position.set(s.player.x + Math.sin(a) * 25, 0, s.player.z + Math.cos(a) * 25);
    water.position.y = s.explorer ? -2 : -1.1;
    renderer.render(scene, camera);
  }
  return {
    render,
    async loadAtlas() {
      if (atlasLoaded) return;
      const map = await load('los-santos');
      map.rotation.x = Math.PI;
      map.traverse((n) => {
        if (n.name === 'Box002_gray_0') n.visible = false;
        const mesh = n as T.Mesh;
        if (mesh.isMesh)
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            const m = material as T.MeshStandardMaterial;
            m.metalness = 0;
            m.roughness = 1;
          }
      });
      // Attach each successful load before the next await so unmount can dispose it.
      atlas.add(map);
      try {
        helicopter = await load('frogger');
        atlas.add(helicopter);
      } catch (error) {
        atlas.remove(map);
        disposeScene(map);
        throw error;
      }
      atlasLoaded = true;
    },
    resetCamera() {
      snap = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const model of Object.values(models)) scene.add(model);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
export type CityRenderer = Awaited<ReturnType<typeof createCityRenderer>>;
