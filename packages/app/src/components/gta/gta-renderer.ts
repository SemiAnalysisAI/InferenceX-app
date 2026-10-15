import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { InstancedSet, instantiateCar, prepareCar, type CarTemplate } from './gta-actors';
import { buildBuildings, buildRoads, buildTerrain } from './gta-city-mesh';
import { target, type CityState } from './gta-engine';
import { buildLandmarks } from './gta-landmarks';
import {
  SHARED,
  buildingMaterial,
  loadTextures,
  roadMaterial,
  sidewalkMaterial,
  terrainMaterial,
  waterMaterial,
} from './gta-materials';
import { cloneRig, rigPed, type Rig } from './gta-rig';
import { TREE_SPECS, makePalm, makeTree } from './gta-trees';
import { GROUND, VEHICLES, loadWorld, type TrafficModel } from './gta-world';

const CAR_MODELS = [
  'buffalo',
  'adder',
  'blista',
  'taxi',
  'dilettante',
  'raiden',
  'baller',
  'stanier',
  'asea',
  'speedo',
  'washington',
  'bus',
  'police',
] as const;
type CarName = (typeof CAR_MODELS)[number];
const LOD_MODELS = [
  'asea',
  'stanier',
  'dilettante',
  'raiden',
  'baller',
  'washington',
  'blista',
  'speedo',
  'taxi',
] as const;
const PARKED_MODELS = [
  'asea',
  'stanier',
  'dilettante',
  'raiden',
  'baller',
  'washington',
  'blista',
  'speedo',
] as const;
export const PED_MODELS = [
  'ped-business-m',
  'ped-business-f',
  'ped-tourist-m',
  'ped-tourist-f',
  'ped-downtown',
  'ped-genhot',
  'ped-stbla',
  'ped-hipster',
] as const;
const PROP_MODELS = [
  'lamp-b',
  'signal-b',
  'hydrant-b',
  'bin',
  'bench',
  'meter',
  'newsbox',
  'busstop',
] as const;
const TREE_MODELS = ['tree-cypress'] as const;

export const MODEL_NAMES = [
  ...CAR_MODELS,
  ...LOD_MODELS.map((n) => `${n}-lod` as const),
  ...PED_MODELS,
  ...PROP_MODELS,
  ...TREE_MODELS,
  'michael',
] as const;
export const LOAD_STEPS = MODEL_NAMES.length + 2;

/** Realistic factory paint colours (sRGB). */
export const PAINTS = [
  '#f1f1ef',
  '#1c1d20',
  '#a7abb0',
  '#5d6166',
  '#1f2f4a',
  '#7c1a1a',
  '#c8bfa8',
  '#2f4a3a',
  '#e8e6e0',
  '#2a2c30',
  '#8d9196',
  '#3d5878',
];

export function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const skeletons = new Set<T.Skeleton>();
  scene.traverse((n) => {
    const m = n as T.Mesh;
    if ((m as T.SkinnedMesh).isSkinnedMesh) skeletons.add((m as T.SkinnedMesh).skeleton);
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
  skeletons.forEach((s) => s.dispose());
}

function hash(i: number) {
  const x = Math.sin(i * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
}

export interface RendererOptions {
  base?: string;
  quality?: 'high' | 'low';
  post?: boolean;
}

const scaleTo = (root: T.Object3D, height: number) => {
  const b = new T.Box3().setFromObject(root);
  const k = height / Math.max(0.1, b.max.y - b.min.y);
  const g = new T.Group();
  root.position.set(-((b.min.x + b.max.x) / 2) * k, -b.min.y * k, -((b.min.z + b.max.z) / 2) * k);
  root.scale.setScalar(k);
  g.add(root);
  return g;
};

export async function createCityRenderer(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  onProgress: (done: number) => void,
  options: RendererOptions = {},
) {
  const base = options.base ?? '/decorative/gta/';
  const mobile =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 700);
  const quality = options.quality ?? (mobile ? 'low' : 'high');
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : 1.25));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  let done = 0;
  const step = () => onProgress(++done);

  const scene = new T.Scene();
  const city = new T.Group();
  const atlas = new T.Scene();
  scene.add(city);
  const camera = new T.PerspectiveCamera(55, 1, 0.4, 24000);

  // Sky, sun and image-based lighting.
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const su = sky.material.uniforms;
  su.turbidity.value = 3.2;
  su.rayleigh.value = 1.1;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  su.cloudCoverage.value = 0.25;
  su.cloudDensity.value = 0.35;
  scene.add(sky);
  const skyScene = new T.Scene();
  const skyEnv = new Sky();
  skyEnv.scale.setScalar(1000);
  skyEnv.material.uniforms.turbidity.value = 3.2;
  skyEnv.material.uniforms.rayleigh.value = 1.1;
  skyEnv.material.uniforms.showSunDisc.value = 0;
  skyEnv.material.uniforms.cloudCoverage.value = 0.25;
  skyScene.add(skyEnv);
  const envGround = new T.Mesh(
    new T.CircleGeometry(900, 32),
    new T.MeshBasicMaterial({ color: '#4a4844', side: T.DoubleSide }),
  );
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -20;
  skyScene.add(envGround);
  const pmrem = new T.PMREMGenerator(renderer);
  let envRT: T.WebGLRenderTarget | null = null;
  let envSun = -99;
  const sunDir = new T.Vector3();

  const sun = new T.DirectionalLight('#fff4e0', 3.2);
  sun.castShadow = true;
  const shadowSize = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const S = quality === 'high' ? 150 : 110;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 2400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight('#c4d8ec', '#5a554c', 0.35);
  scene.add(hemi);
  const headlights = new T.SpotLight('#fff1d6', 0, 70, 0.5, 0.5, 1.4);
  const headTarget = new T.Object3D();
  scene.add(headlights, headTarget);
  headlights.target = headTarget;
  const sirens = [new T.PointLight('#ff2233', 0, 30, 1.6), new T.PointLight('#2266ff', 0, 30, 1.6)];
  sirens.forEach((l) => scene.add(l));
  scene.fog = new T.FogExp2('#c9d6df', 0.00022);

  // Post-processing: MSAA scene target, ambient occlusion, bloom, tone mapping.
  const rt = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    samples: quality === 'high' ? 4 : 2,
  });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = quality === 'high' ? new GTAOPass(scene, camera, 1, 1) : null;
  if (gtao) {
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({
      radius: 1.6,
      distanceExponent: 1.4,
      thickness: 1.2,
      scale: 1,
      samples: 12,
    });
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.12, 0.3, 3.5);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const models = {} as Record<(typeof MODEL_NAMES)[number], T.Group>;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [world, tex] = await Promise.all([
    loadWorld(`${base}sf/`, signal).then((w) => {
      step();
      return w;
    }),
    loadTextures(`${base}sf/`, signal, anisotropy).then((t) => {
      step();
      return t;
    }),
    ...MODEL_NAMES.map(async (name) => {
      const gltf = await loader.loadAsync(`${base}models/${name}.glb`);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      models[name] = gltf.scene;
      step();
    }),
  ]);
  let disposed = false;

  // ---------- static city
  const groundTex = new T.DataTexture(
    world.groundMap.data as Uint8Array,
    world.groundMap.width,
    world.groundMap.height,
    T.RedFormat,
    T.UnsignedByteType,
  );
  groundTex.minFilter = T.NearestFilter;
  groundTex.magFilter = groundTex.minFilter;
  groundTex.needsUpdate = true;
  const terrain = buildTerrain(
    world,
    terrainMaterial(tex, groundTex, {
      x0: world.x0,
      z0: world.z0,
      res: world.data.grid.ground,
      width: world.groundMap.width,
      height: world.groundMap.height,
    }),
  );
  city.add(terrain);
  const water = new T.Mesh(new T.PlaneGeometry(60000, 60000), waterMaterial(tex));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-1400, 0.12, 1000);
  water.receiveShadow = true;
  city.add(water);
  const deckMat = new T.MeshStandardMaterial({
    color: '#9a9690',
    roughness: 0.9,
    side: T.DoubleSide,
  });
  const walkMat = sidewalkMaterial(tex);
  walkMat.side = T.DoubleSide;
  const roads = buildRoads(world, roadMaterial(tex), walkMat, deckMat);
  city.add(roads.roads, roads.sidewalks, roads.decks);
  const landmarks = await buildLandmarks(world, { tex, base, signal });
  const facade = buildingMaterial(tex);
  const buildings = buildBuildings(world, facade, landmarks.skip);
  city.add(buildings.group, landmarks.group);
  if (buildings.units.length > 0) {
    const units = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshStandardMaterial({ color: '#a4a6a6', roughness: 0.6, metalness: 0.4 }),
      buildings.units.length,
    );
    buildings.units.forEach((m, i) => units.setMatrixAt(i, m));
    units.receiveShadow = true;
    units.castShadow = units.receiveShadow;
    units.computeBoundingSphere();
    city.add(units);
  }

  // ---------- trees, props, parked cars (instanced around the camera)
  const leafTex = tex.leaf;
  const treeSets = [
    new InstancedSet(makeTree(TREE_SPECS[0], leafTex), 1800),
    new InstancedSet(makeTree(TREE_SPECS[1], leafTex), 1800),
    new InstancedSet(makeTree(TREE_SPECS[2], leafTex), 1200),
    new InstancedSet(makePalm(), 900),
    new InstancedSet(scaleTo(models['tree-cypress'], 16), 900),
  ];
  const propSets = PROP_MODELS.map((n) => new InstancedSet(models[n], 1400));
  const carTemplates = {} as Record<CarName, CarTemplate>;
  for (const n of CAR_MODELS) carTemplates[n] = prepareCar(models[n]);
  const parkedNear = PARKED_MODELS.map(
    (n) =>
      new InstancedSet(carTemplates[n].root, 90, carTemplates[n].paint, carTemplates[n].wheels),
  );
  const parkedFar = PARKED_MODELS.map((n) => {
    const t = prepareCar(models[`${n}-lod`], carTemplates[n]);
    return new InstancedSet(t.root, 500, t.paint, carTemplates[n].wheels, false);
  });
  for (const set of [...treeSets, ...propSets, ...parkedNear, ...parkedFar])
    for (const m of set.meshes) city.add(m);
  const mtx = new T.Matrix4(),
    q = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0),
    pos = new T.Vector3(),
    scl = new T.Vector3(1, 1, 1),
    col = new T.Color();
  let lastFill = new T.Vector2(1e9, 1e9);
  function fillInstances(cx: number, cz: number) {
    lastFill = new T.Vector2(cx, cz);
    for (const s of treeSets) s.begin();
    const tr = world.trees;
    for (let i = 0; i < tr.length; i += 3) {
      const x = tr[i],
        z = tr[i + 1];
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 > 520 * 520) continue;
      const kind = tr[i + 2];
      const h = hash(i);
      const park = world.ground(x, z) === GROUND.grass || world.ground(x, z) === GROUND.forest;
      const set =
        kind === 1
          ? treeSets[3]
          : kind === 2
            ? treeSets[4]
            : park && h > 0.4
              ? treeSets[2]
              : treeSets[h > 0.55 ? 1 : 0];
      const k = 0.75 + hash(i + 7) * 0.5;
      pos.set(x, world.surface(x, z) - 0.1, z);
      q.setFromAxisAngle(up, h * 6.283);
      scl.setScalar(k);
      set.add(mtx.compose(pos, q, scl));
    }
    for (const s of treeSets) s.end();
    for (const s of propSets) s.begin();
    const pr = world.props;
    scl.setScalar(1);
    for (let i = 0; i < pr.length; i += 4) {
      const x = pr[i + 1],
        z = pr[i + 2];
      if ((x - cx) ** 2 + (z - cz) ** 2 > 260 * 260) continue;
      const set = propSets[pr[i]];
      if (!set) continue;
      const lift = world.ground(x, z) === GROUND.sidewalk ? 0.2 : 0.02;
      pos.set(x, world.surface(x, z) + lift, z);
      q.setFromAxisAngle(up, pr[i + 3]);
      set.add(mtx.compose(pos, q, scl));
    }
    for (const s of propSets) s.end();
    for (const s of [...parkedNear, ...parkedFar]) s.begin();
    const pk = world.parked;
    for (let i = 0; i < pk.length; i += 3) {
      const x = pk[i],
        z = pk[i + 1];
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 > 300 * 300) continue;
      const m = Math.floor(hash(i * 3) * PARKED_MODELS.length);
      col.setStyle(PAINTS[Math.floor(hash(i * 5) * PAINTS.length)], T.SRGBColorSpace);
      pos.set(x, world.surface(x, z) + 0.06, z);
      q.setFromAxisAngle(up, pk[i + 2] + Math.PI);
      (d2 < 75 * 75 ? parkedNear : parkedFar)[m].add(mtx.compose(pos, q, scl), col);
    }
    for (const s of [...parkedNear, ...parkedFar]) s.end();
  }

  // ---------- dynamic actors
  const playerCar = { name: '', obj: null as ReturnType<typeof instantiateCar> | null, paint: -1 };
  const traffic: { key: string; car: ReturnType<typeof instantiateCar> }[] = [];
  const police: ReturnType<typeof instantiateCar>[] = [];
  const pedRigs = PED_MODELS.map((n) => rigPed(models[n]));
  const peds: { model: number; rig: Rig }[] = [];
  const michael = rigPed(models.michael);
  city.add(michael.root);
  const marker = new T.Group();
  const beam = new T.Mesh(
    new T.CylinderGeometry(1.6, 1.6, 6, 32, 1, true),
    new T.MeshBasicMaterial({
      color: '#ffd23f',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
    }),
  );
  beam.position.y = 3;
  const ring = new T.Mesh(
    new T.RingGeometry(1.2, 1.7, 40),
    new T.MeshBasicMaterial({
      color: '#ffd23f',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.3;
  marker.add(beam, ring);
  city.add(marker);

  const carObj = (model0: TrafficModel | CarName, paint: number) => {
    // The Primo export has a broken body transform; the Asea shares its role.
    const model = (model0 === 'primo' ? 'asea' : model0) as CarName;
    const colour =
      model === 'taxi'
        ? new T.Color().setStyle('#e9b824', T.SRGBColorSpace)
        : model === 'bus' || model === 'police'
          ? undefined
          : new T.Color().setStyle(PAINTS[paint % PAINTS.length], T.SRGBColorSpace);
    const c = instantiateCar(carTemplates[model], colour);
    city.add(c.root);
    return c;
  };

  // ---------- atlas (Los Santos flight explorer)
  let atlasLoaded = false;
  let helicopter: T.Object3D | null = null;
  atlas.add(new T.HemisphereLight('#dfefff', '#6b5a48', 2.2));
  const atlasSun = new T.DirectionalLight('#fff0cd', 2);
  atlasSun.position.set(-3000, 6000, 2000);
  atlas.add(atlasSun);
  atlas.background = new T.Color('#b5d7e4');
  atlas.fog = new T.Fog('#b5d7e4', 6000, 17000);

  // ---------- camera rig
  const tmp = new T.Vector3();
  const look = new T.Vector3();
  const camPos = new T.Vector3();
  const camLook = new T.Vector3();
  let snap = true;
  let fillClock = 0;

  function sunFor(clock: number, night: boolean) {
    const hour = night ? 22.5 : clock;
    const t = ((hour - 6) / 12) * Math.PI;
    const el = Math.sin(t) * 1.15;
    const h = ((hour - 12) / 12) * Math.PI;
    sunDir
      .set(-Math.sin(h) * Math.cos(el), Math.sin(el), Math.cos(h) * Math.cos(el) * 0.55)
      .normalize();
    return el;
  }

  function collide(from: T.Vector3, to: T.Vector3) {
    // Pull the camera in front of any building wall between the target and the camera.
    const d = from.distanceTo(to);
    const steps = Math.ceil(d / 0.8);
    for (let i = 1; i <= steps; i++) {
      tmp.lerpVectors(from, to, i / steps);
      const b = world.buildingAt(tmp.x, tmp.z, 0.6);
      if (b >= 0) {
        const bd = world.buildings[b];
        if (tmp.y < bd.base + bd.height + 1 && tmp.y > bd.base + bd.minHeight - 1) {
          to.lerpVectors(from, to, Math.max(0, (i - 1.5) / steps));
          break;
        }
      }
    }
    to.y = Math.max(to.y, world.surface(to.x, to.z) + 0.7);
  }

  function updateEnv(el: number) {
    if (Math.abs(el - envSun) < 0.03) return;
    envSun = el;
    (envGround.material as T.MeshBasicMaterial).color.setScalar(0.06 + Math.max(0, el) * 0.25);
    skyEnv.material.uniforms.sunPosition.value.copy(sunDir);
    envRT?.dispose();
    envRT = pmrem.fromScene(skyScene, 0, 0.1, 2000);
    scene.environment = envRT.texture;
  }

  function render(s: CityState, overview = false) {
    landmarks.update(s.elapsed);
    if (disposed) return;
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * ratio) || canvas.height !== Math.floor(h * ratio)) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      composer.setPixelRatio(ratio);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    if (s.explorer) {
      renderAtlas(s);
      return;
    }
    SHARED.uTime.value = s.elapsed + performance.now() / 1000;
    su.time.value = SHARED.uTime.value;
    const el = sunFor(s.clock, s.night);
    const day = T.MathUtils.smoothstep(el, -0.08, 0.2);
    SHARED.uNight.value = 1 - T.MathUtils.smoothstep(el, -0.12, 0.12);
    su.sunPosition.value.copy(sunDir);
    updateEnv(el);
    scene.environmentIntensity = 0.06 + day * 0.42;
    sun.intensity = day * 3.2 + (1 - day) * 0.12;
    sun.color.set(el < 0.25 ? '#ffc58f' : '#fff4e2');
    if (day < 0.05) sun.color.set('#9fb7ff');
    hemi.intensity = 0.08 + day * 0.3;
    const fog = scene.fog as T.FogExp2;
    fog.density = s.fog ? 0.0042 : 0.00022;
    fog.color.set(s.fog ? '#b9c0c4' : day > 0.5 ? '#ccd3d7' : day > 0.05 ? '#d9b49a' : '#1a2233');
    renderer.toneMappingExposure = s.fog ? 0.75 : 0.62 + day * 0.2 + (1 - day) * 0.4;
    // Player vehicle.
    if (playerCar.name !== s.vehicle || playerCar.paint !== s.paint) {
      if (playerCar.obj) city.remove(playerCar.obj.root);
      playerCar.obj = carObj(s.vehicle, s.paint);
      playerCar.name = s.vehicle;
      playerCar.paint = s.paint;
    }
    const pc = playerCar.obj!;
    pc.root.position.set(s.car.x, s.car.y, s.car.z);
    pc.root.rotation.set(0, s.car.angle + Math.PI, 0);
    // Body roll from sliding and pitch from acceleration.
    pc.root.rotateZ(T.MathUtils.clamp(-s.car.slip * 0.012, -0.06, 0.06));
    pc.update(s.car.spin, -s.car.steer * 0.55);
    michael.root.visible = s.onFoot;
    if (s.onFoot) {
      const p = s.player;
      const lift = world.ground(p.x, p.z) === GROUND.sidewalk ? 0.2 : 0.06;
      michael.root.position.set(p.x, p.y + lift, p.z);
      michael.root.rotation.y = p.angle;
      michael.pose(p.stride, Math.abs(p.speed), s.elapsed);
    }
    // Traffic.
    s.traffic.forEach((t, i) => {
      const key = `${t.model}:${t.paint}`;
      if (!traffic[i] || traffic[i].key !== key) {
        if (traffic[i]) city.remove(traffic[i].car.root);
        traffic[i] = { key, car: carObj(t.model, t.paint) };
      }
      const c = traffic[i].car;
      c.root.visible = true;
      c.root.position.set(t.x, t.y, t.z);
      c.root.rotation.set(0, t.angle + Math.PI, 0);
      c.update(t.spin, 0);
    });
    for (let i = s.traffic.length; i < traffic.length; i++) traffic[i].car.root.visible = false;
    let siren = 0;
    s.police.forEach((p, i) => {
      if (!police[i]) police[i] = carObj('police', 0);
      const c = police[i];
      c.root.visible = true;
      c.root.position.set(p.x, p.y, p.z);
      c.root.rotation.set(0, p.angle + Math.PI, 0);
      c.update(p.spin, 0);
      if (siren < 2) {
        const flash = Math.sin(performance.now() / 70 + i) > 0;
        sirens[siren].position.set(p.x, p.y + 2, p.z);
        sirens[siren].intensity = flash === (siren === 0) ? 40 : 4;
        siren++;
      }
    });
    for (let i = s.police.length; i < police.length; i++) police[i].root.visible = false;
    for (let i = siren; i < 2; i++) sirens[i].intensity = 0;
    // Pedestrians.
    s.peds.forEach((p, i) => {
      const model = p.model % PED_MODELS.length;
      if (!peds[i] || peds[i].model !== model) {
        if (peds[i]) city.remove(peds[i].rig.root);
        const rig = cloneRig(pedRigs[model]);
        city.add(rig.root);
        peds[i] = { model, rig };
      }
      const r = peds[i].rig;
      r.root.visible = true;
      const lift = world.ground(p.x, p.z) === GROUND.sidewalk ? 0.2 : 0.06;
      r.root.position.set(p.x, p.y + lift, p.z);
      r.root.rotation.y = p.angle;
      r.pose(p.stride, Math.abs(p.speed), s.elapsed + i, p.down > 0);
    });
    for (let i = s.peds.length; i < peds.length; i++) peds[i].rig.root.visible = false;
    // Mission marker.
    const goal = target(world, s);
    marker.visible = Boolean(goal) && s.phase === 'driving';
    if (goal) {
      marker.position.set(goal.x, world.surface(goal.x, goal.z), goal.z);
      beam.material.opacity = 0.28 + Math.sin(s.elapsed * 3) * 0.08;
    }
    // Camera.
    const focus = s.onFoot ? s.player : s.car;
    const fy = s.onFoot ? s.player.y : s.car.y;
    const a = focus.angle;
    if (overview) {
      const o = world.landmarks.ferry;
      camPos.set(o.x + 520, 140, o.z + 380);
      camLook.set(o.x - 520, 40, o.z + 120);
      snap = true;
    } else if (s.camera === 2) {
      const destination = target(world, s);
      const center = world.landmarks[destination.id];
      const groundHeight = world.surface(center.x, center.z);
      const index = world.buildingAt(center.x, center.z);
      const height = Math.max(
        destination.id === 'salesforce' ? 326 : destination.id === 'coit' ? 64 : 30,
        index >= 0 ? world.buildings[index].height : 0,
      );
      const dist = Math.max(70, height * 1.2);
      camPos.set(
        center.x - Math.sin(a) * dist,
        groundHeight + height + 45,
        center.z - Math.cos(a) * dist,
      );
      const under = world.buildingAt(camPos.x, camPos.z, 2);
      if (under >= 0)
        camPos.y = Math.max(
          camPos.y,
          world.buildings[under].base + world.buildings[under].height + 15,
        );
      camLook.set(center.x, groundHeight + height * 0.45, center.z);
    } else if (s.onFoot) {
      look.set(focus.x, fy + 1.55, focus.z);
      tmp.set(
        focus.x - Math.sin(a) * 3.4 + Math.cos(a) * 0.55,
        fy + 2,
        focus.z - Math.cos(a) * 3.4 - Math.sin(a) * 0.55,
      );
      camLook.copy(look).add(new T.Vector3(Math.sin(a) * 2, 0, Math.cos(a) * 2));
      camPos.copy(tmp);
      collide(look, camPos);
    } else if (s.camera === 1) {
      camPos.set(focus.x + Math.sin(a) * 0.3, fy + 1.25, focus.z + Math.cos(a) * 0.3);
      camLook.set(focus.x + Math.sin(a) * 20, fy + 1, focus.z + Math.cos(a) * 20);
    } else {
      const dist = 6.8 + Math.min(4, Math.abs(s.car.speed) * 0.06);
      look.set(focus.x, fy + 1.4, focus.z);
      camPos.set(focus.x - Math.sin(a) * dist, fy + 2.5, focus.z - Math.cos(a) * dist);
      camLook.set(focus.x + Math.sin(a) * 5, fy + 1.1, focus.z + Math.cos(a) * 5);
      collide(look, camPos);
    }
    if (snap) camera.position.copy(camPos);
    else camera.position.lerp(camPos, s.onFoot ? 0.25 : 0.18);
    camera.lookAt(camLook);
    snap = false;
    // Instanced clutter follows the camera.
    fillClock++;
    if (
      lastFill.distanceTo(new T.Vector2(camera.position.x, camera.position.z)) > 18 ||
      fillClock > 600
    ) {
      fillClock = 0;
      fillInstances(camera.position.x, camera.position.z);
    }
    // Shadow frustum centred on the focus, snapped to texels to avoid shimmering.
    const texel = (S * 2) / shadowSize;
    const sx = Math.round(focus.x / texel) * texel,
      sz = Math.round(focus.z / texel) * texel;
    const light = sunDir.y > 0.02 ? sunDir : new T.Vector3(0.3, 0.8, 0.2).normalize();
    sun.target.position.set(sx, fy, sz);
    sun.position.set(sx + light.x * 1200, fy + light.y * 1200, sz + light.z * 1200);
    sun.target.updateMatrixWorld();
    // Headlights at night.
    headlights.intensity = !s.onFoot && day < 0.4 ? 120 : 0;
    headlights.position.set(s.car.x + Math.sin(a) * 2, s.car.y + 0.9, s.car.z + Math.cos(a) * 2);
    headTarget.position.set(s.car.x + Math.sin(a) * 30, s.car.y, s.car.z + Math.cos(a) * 30);
    // Keep the sky dome centred on the viewer, even 6 km south in San Jovano.
    sky.position.set(camera.position.x, 0, camera.position.z);
    sky.updateMatrixWorld();
    if (options.post === false) renderer.render(scene, camera);
    else composer.render();
  }

  function renderAtlas(s: CityState) {
    const a = s.player.angle;
    tmp.set(s.player.x - Math.sin(a) * 22, s.altitude + 8, s.player.z - Math.cos(a) * 22);
    camera.position.copy(tmp);
    camera.lookAt(s.player.x + Math.sin(a) * 25, s.altitude - 12, s.player.z + Math.cos(a) * 25);
    if (helicopter) {
      helicopter.position.set(s.player.x, s.altitude, s.player.z);
      helicopter.rotation.y = a + Math.PI;
    }
    renderer.toneMappingExposure = 1;
    renderer.render(atlas, camera);
  }

  fillInstances(0, 0);
  return {
    world,
    render,
    debug: { scene, renderer, camera, sun },
    vehicles: VEHICLES,
    async loadAtlas() {
      if (atlasLoaded) return;
      const mapGltf = await loader.loadAsync(`${base}models/los-santos.glb`);
      const map = mapGltf.scene;
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
      atlas.add(map);
      try {
        const heli = await loader.loadAsync(`${base}models/frogger.glb`);
        helicopter = heli.scene;
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
      disposeScene(atlas);
      envRT?.dispose();
      pmrem.dispose();
      composer.dispose();
      groundTex.dispose();
      for (const t of Object.values(tex)) t.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
export type CityRenderer = Awaited<ReturnType<typeof createCityRenderer>>;
