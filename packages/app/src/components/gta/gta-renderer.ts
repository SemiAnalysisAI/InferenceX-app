import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { JOBS, lanePoint, type Point } from './gta-world';
import { target, type CityState } from './gta-engine';
import { clonePedestrian, createPedestrianAnimation, rigPedestrian } from './gta-pedestrian';
import { ARCHITECTURE_ASSET_COUNT, loadArchitecture } from './gta-architecture';
import { buildCityscape } from './gta-cityscape';

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
export const CITY_ASSET_COUNT = MODEL_NAMES.length + ARCHITECTURE_ASSET_COUNT;
const BASE = '/decorative/gta/models/';

export function disposeScene(scene: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  const skeletons = new Set<T.Skeleton>();
  scene.traverse((n) => {
    const m = n as T.Mesh;
    if ((m as T.InstancedMesh).isInstancedMesh) (m as T.InstancedMesh).dispose();
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
  const skyDome = new T.Mesh(
    new T.SphereGeometry(9000, 24, 12),
    new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      vertexShader:
        'varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec3 skyDirection;
      void main(){
        vec3 d=normalize(skyDirection);
        float h=pow(max(d.y,0.0),0.45);
        vec3 skyColor=mix(vec3(0.68,0.78,0.84),vec3(0.15,0.38,0.65),h);
        float glow=pow(max(dot(d,normalize(vec3(-120.,220.,140.))),0.),128.);
        skyColor+=vec3(1.,0.82,0.6)*glow*0.45;
        gl_FragColor=vec4(skyColor,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  city.add(skyDome);
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
  let architecture: Awaited<ReturnType<typeof loadArchitecture>>;
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
            if (!m.map) {
              m.metalness = 0.6;
              m.roughness = 0.25;
            }
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
    architecture = await loadArchitecture(
      city,
      BASE.replace('models/', 'architecture/'),
      signal,
      () => onProgress(++done),
    );
    scene.environment = architecture.environment;
  } catch (error) {
    disposed = true;
    Object.values(models).forEach(disposeScene);
    disposeScene(scene);
    renderer.dispose();
    throw error;
  }
  buildCityscape(city, architecture, models);
  const water = new T.Mesh(
    new T.PlaneGeometry(16000, 16000),
    new T.MeshStandardMaterial({ color: '#23868c', metalness: 0.55, roughness: 0.25 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-1000, -1.1, 0);
  scene.add(water);
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
  const carGroup = new T.Group();
  city.add(carGroup);
  let carName = '';
  const traffic: T.Group[] = [],
    police: T.Group[] = [];
  rigPedestrian(models.michael);
  const person = clonePedestrian(models.michael);
  const personAnimation = createPedestrianAnimation(person);
  city.add(person);
  const headlights = new T.SpotLight('#fff1c7', 0, 70, 0.42, 0.8, 1);
  const headTarget = new T.Object3D();
  scene.add(headlights, headTarget);
  headlights.target = headTarget;
  const peds = Array.from({ length: 14 }, (_, i) => {
    const p = clonePedestrian(models.michael);
    p.scale.setScalar(0.97 + (i % 3) * 0.03);
    city.add(p);
    return p;
  });
  const pedAnimations = peds.map(createPedestrianAnimation);
  let previousTime = 0;
  let previousPosition: Point | null = null;
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
    skyDome.visible = !night;
    scene.environmentIntensity = night ? 0.15 : 0.65;
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
    const dt = Math.max(0, Math.min(s.elapsed - previousTime, 0.1));
    const travelled = previousPosition
      ? Math.hypot(s.player.x - previousPosition.x, s.player.z - previousPosition.z)
      : 0;
    personAnimation.update(
      s.onFoot && travelled < 12 * dt ? travelled * Math.sign(s.player.speed) : 0,
      dt,
      s.player.speed,
    );
    previousTime = s.elapsed;
    previousPosition = { x: s.player.x, z: s.player.z };
    person.position.set(s.player.x, 0.3, s.player.z);
    person.rotation.y = s.player.angle;
    s.traffic.forEach((t, i) => {
      if (!traffic[i]) {
        traffic[i] = models[t.model].clone(true);
        city.add(traffic[i]);
      }
      traffic[i].position.set(t.x, 0.3, t.z);
      traffic[i].rotation.y = t.angle + Math.PI;
      traffic[i].visible = Math.hypot(t.x - s.player.x, t.z - s.player.z) < 220;
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
      const point = lanePoint(i * 67 + s.elapsed * 1.2, i % 3);
      p.position.set(point.x + Math.cos(point.angle) * 8, 0.3, point.z - Math.sin(point.angle) * 8);
      p.rotation.y = point.angle;
      p.visible = Math.hypot(point.x - s.player.x, point.z - s.player.z) < 130;
      pedAnimations[i].update(1.2 * dt, dt, 1.2);
    });
    markers.forEach((m, i) => {
      m.visible = i === (s.tour === null ? Math.min(s.job, 4) : 0);
      const p = s.tour === null ? JOBS[i] : target(s);
      m.position.x = p.x;
      m.position.z = p.z;
      m.position.y = 0.5 + Math.sin(s.elapsed * 2) * 0.2;
    });
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
      camera.position.set(s.player.x, 1000, s.player.z + 1);
      camera.lookAt(s.player.x, 0, s.player.z);
    } else {
      const landmarkHeight = s.tour === 3 ? 250 : s.tour === 4 ? 52 : 30;
      const scenic = s.camera === 2;
      const dist = scenic
        ? Math.max(55, landmarkHeight * 0.75)
        : s.onFoot
          ? 5
          : s.camera === 1
            ? 0.2
            : 10 + Math.abs(s.car.speed) * 0.05;
      const height = scenic
        ? 15 + landmarkHeight * 0.2
        : s.onFoot
          ? 3.1
          : s.camera === 1
            ? 1.6
            : 5.2;
      tmp.set(s.player.x - Math.sin(a) * dist, height, s.player.z - Math.cos(a) * dist);
      if (snap) camera.position.copy(tmp);
      else camera.position.lerp(tmp, 0.14);
      camera.lookAt(
        s.player.x + Math.sin(a) * 9,
        scenic ? landmarkHeight * 0.4 : s.onFoot ? 1.3 : 1.5,
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
    if (!s.explorer) architecture.update(camera);
    renderer.render(scene, camera);
    if (process.env.NODE_ENV !== 'production') {
      canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
    }
  }
  return {
    render,
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
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
      architecture.environment.dispose();
      for (const model of Object.values(models)) scene.add(model);
      disposeScene(scene);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
export type CityRenderer = Awaited<ReturnType<typeof createCityRenderer>>;
