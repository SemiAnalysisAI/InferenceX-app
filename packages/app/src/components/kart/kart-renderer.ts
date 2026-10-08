import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTERS, isStunned, type CharacterId, type Kart, type Race } from './kart-engine';
import { heightAt } from './kart-surface';
import { pointAt, wrapAngle } from './kart-track';

function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.geometry) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
  geometries.forEach((g) => g.dispose());
}

// ---------------------------------------------------------------------------
// Particles: one draw call for sparks, dust, smoke, flames, and confetti.
// ---------------------------------------------------------------------------
const MAX_PARTICLES = 2400;
class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 4);
  private size = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private max = new Float32Array(MAX_PARTICLES);
  private grow = new Float32Array(MAX_PARTICLES);
  private gravity = new Float32Array(MAX_PARTICLES);
  private base = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    g.setAttribute('rgba', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute(
      'size',
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    );
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { scale: { value: 400 } },
      vertexShader: `attribute vec4 rgba; attribute float size; varying vec4 vC; uniform float scale;
        void main(){ vC=rgba; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d=gl_PointCoord-0.5; float r=dot(d,d)*4.0; if(r>1.0) discard; gl_FragColor=vec4(vC.rgb, vC.a*(1.0-r*r)); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  setScale(height: number, fov: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value =
      height / (2 * Math.tan((fov * Math.PI) / 360));
  }
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: THREE.Color,
    alpha: number,
    size: number,
    life: number,
    grow = 0,
    gravity = 0,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([color.r, color.g, color.b, alpha], i * 4);
    this.base[i] = alpha;
    this.size[i] = size;
    this.life[i] = life;
    this.max[i] = life;
    this.grow[i] = grow;
    this.gravity[i] = gravity;
  }
  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4 + 3] = this.base[i] * Math.max(0, this.life[i] / this.max[i]);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.rgba.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
  clear() {
    this.life.fill(0);
  }
}

const C = {
  blue: new THREE.Color('#5fc8ff'),
  orange: new THREE.Color('#ff9a1f'),
  white: new THREE.Color('#ffffff'),
  flame: new THREE.Color('#ffb347'),
  flameCore: new THREE.Color('#fff1a8'),
  dust: new THREE.Color('#c9b07a'),
  grass: new THREE.Color('#7fbf4d'),
  smoke: new THREE.Color('#9c9c9c'),
  dark: new THREE.Color('#3a3a3a'),
  water: new THREE.Color('#bfe9ff'),
  star: new THREE.Color('#fff36b'),
  boom: new THREE.Color('#ff6a1a'),
  spark: new THREE.Color('#ffe066'),
};
const tmpColor = new THREE.Color();

interface RacerView {
  root: THREE.Group;
  chassis: THREE.Object3D;
  driver: THREE.Object3D | null;
  wheels: { node: THREE.Object3D; front: boolean; side: number; base: THREE.Euler }[];
  materials: THREE.MeshStandardMaterial[];
  shadow: THREE.Mesh;
  trail: THREE.Group;
  orbit: THREE.Group;
  spinAngle: number;
  tumbleAngle: number;
  scale: number;
}

export interface RendererOptions {
  assetBase?: string;
  onProgress?: (loaded: number, total: number) => void;
}

export function createKartRenderer(
  canvas: HTMLCanvasElement,
  options: RendererOptions | string = {},
) {
  const opts: RendererOptions = typeof options === 'string' ? { assetBase: options } : options;
  const assetBase = opts.assetBase ?? '/decorative/kart';
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8ed7f5');
  scene.fog = new THREE.Fog('#bfe6f7', 420, 1500);
  const camera = new THREE.PerspectiveCamera(66, 1, 0.3, 6000);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6f8a5a', 1.9));
  const sun = new THREE.DirectionalLight('#fff6e0', 2.3);
  sun.position.set(-160, 260, 120);
  scene.add(sun);
  const particles = new Particles();
  scene.add(particles.points);

  const controller = new AbortController();
  let disposed = false;
  const views: RacerView[] = [];
  const templates: Partial<Record<string, THREE.Object3D>> = {};
  const boxes: THREE.Group[] = [];
  const boxMaterials: THREE.Material[] = [];
  const projectiles = new Map<number, THREE.Object3D>();
  const explosions = new Map<number, THREE.Mesh>();
  let sky: THREE.Object3D | null = null;
  let lakitu: THREE.Group | null = null;
  let signalLights: THREE.MeshStandardMaterial[] = [];
  let flag: THREE.Object3D | null = null;
  let reverseBoard: THREE.Object3D | null = null;
  let question: THREE.Texture | null = null;
  let camYaw = 0;
  let camSet = false;
  let shake = 0;
  let time = 0;
  let introAngle = 0;
  let lastPhase: Race['phase'] = 'ready';

  const loader = new GLTFLoader();
  const fetchAsset = async (url: string) => {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Asset load failed: ${response.status} ${url}`);
    const data = url.endsWith('.gltf') ? await response.text() : await response.arrayBuffer();
    const asset = await loader.parseAsync(data, '');
    if (disposed) {
      disposeObject(asset.scene);
      throw new Error('Closed');
    }
    return asset.scene;
  };
  const shadowTexture = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: false,
  });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  const ITEM_FILES = [
    'item-banana',
    'item-green-shell',
    'item-red-shell',
    'item-bobomb',
    'item-box',
    'lakitu',
    'lakitu-signal',
    'lakitu-flag',
    'lakitu-reverse',
  ];
  let race: Race | null = null;

  const ready = (async () => {
    const total = 1 + CHARACTERS.length + ITEM_FILES.length;
    let loaded = 0;
    const tick = () => opts.onProgress?.(++loaded, total);
    const track = await fetchAsset(`${assetBase}/luigi-circuit.gltf`);
    tick();
    scene.add(track);
    // The exported sky dome is tiny; scale it up and keep it centred on the camera.
    track.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }
    });
    const skyNode = track.children[0]?.children?.[1];
    if (skyNode) {
      sky = skyNode;
      sky.scale.setScalar(70);
      sky.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.renderOrder = -10;
        const m = mesh.material as THREE.MeshBasicMaterial;
        m.depthWrite = false;
        m.fog = false;
        mesh.frustumCulled = false;
      });
    }
    const results = await Promise.all([
      ...CHARACTERS.map((c) =>
        fetchAsset(`${assetBase}/racers/racer-${c.id}.glb`).then((s) => {
          templates[c.id] = s;
          tick();
        }),
      ),
      ...ITEM_FILES.map((f) =>
        fetchAsset(`${assetBase}/items/${f}.glb`).then((s) => {
          templates[f] = s;
          tick();
        }),
      ),
      new THREE.TextureLoader().loadAsync(`${assetBase}/items/item-box-question.png`).then((t) => {
        if (disposed) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.magFilter = THREE.NearestFilter;
        question = t;
      }),
    ]);
    void results;
    if (disposed) throw new Error('Closed');
    // Lakitu with the start signal.
    lakitu = new THREE.Group();
    const body = templates['lakitu']!.clone();
    lakitu.add(body);
    const signal = templates['lakitu-signal']!.clone();
    signal.position.set(0, -3.4, 1.4);
    signal.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = m;
      if (
        /light/.test(m.map?.name ?? '') ||
        mesh.name === 'polygon1' ||
        mesh.name === 'polygon2' ||
        mesh.name === 'polygon3'
      ) {
        m.emissive = new THREE.Color('#000000');
        signalLights.push(m);
      }
    });
    lakitu.add(signal);
    flag = templates['lakitu-flag']!.clone();
    flag.position.set(2.2, 0.6, 0.4);
    flag.visible = false;
    lakitu.add(flag);
    reverseBoard = templates['lakitu-reverse']!.clone();
    reverseBoard.position.set(0, -3.2, 1.2);
    reverseBoard.visible = false;
    lakitu.add(reverseBoard);
    lakitu.visible = false;
    scene.add(lakitu);
    signalLights = signalLights.slice(0, 3);
    scene.updateMatrixWorld(true);
  })();

  function buildRacer(id: CharacterId): RacerView {
    const root = new THREE.Group();
    const model = clone(templates[id]!);
    const materials: THREE.MeshStandardMaterial[] = [];
    model.traverse((n) => {
      const mesh = n as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = m;
      materials.push(m);
    });
    root.add(model);
    const chassis = model.getObjectByName('chassis') ?? model;
    const driver = model.getObjectByName('driver') ?? null;
    const wheels = ['fl', 'fr', 'rl', 'rr']
      .map((k) => model.getObjectByName(`wheel_${k}`))
      .filter((n): n is THREE.Object3D => Boolean(n))
      .map((node) => ({
        node,
        front: node.name.includes('_f'),
        side: node.name.endsWith('l') ? 1 : -1,
        base: node.rotation.clone(),
      }));
    wheels.forEach((w) => (w.node.rotation.order = 'YXZ'));
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    const weight = CHARACTERS.find((c) => c.id === id)?.weight;
    const scale = weight === 'heavy' ? 1.15 : weight === 'light' ? 0.92 : 1;
    shadow.scale.set(7.2 * scale, 1, 10.5 * scale);
    shadow.renderOrder = 1;
    scene.add(shadow);
    const trail = new THREE.Group();
    const orbit = new THREE.Group();
    root.add(trail, orbit);
    root.rotation.order = 'YXZ';
    scene.add(root);
    return {
      root,
      chassis,
      driver,
      wheels,
      materials,
      shadow,
      trail,
      orbit,
      spinAngle: 0,
      tumbleAngle: 0,
      scale,
    };
  }

  function itemModel(kind: string) {
    const t = templates[`item-${kind}`];
    return t ? t.clone() : new THREE.Group();
  }

  function setup(r: Race) {
    race = r;
    for (const v of views) {
      scene.remove(v.root, v.shadow);
      // Item clones borrow their geometry, materials and textures from templates.
      v.trail.clear();
      v.orbit.clear();
      v.materials.forEach((m) => m.dispose());
    }
    views.length = 0;
    for (const k of r.karts) views.push(buildRacer(k.character));
    for (const b of boxes) scene.remove(b);
    boxes.length = 0;
    boxMaterials.forEach((m) => m.dispose());
    boxMaterials.length = 0;
    const tpl = templates['item-box'];
    for (const b of r.boxes) {
      const g = new THREE.Group();
      if (tpl) {
        const shell = tpl.clone();
        shell.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.name.includes('question')) mesh.visible = false;
          else {
            const m = (mesh.material as THREE.MeshStandardMaterial).clone();
            boxMaterials.push(m);
            m.transparent = true;
            m.opacity = 0.5;
            m.depthWrite = false;
            m.side = THREE.DoubleSide;
            mesh.material = m;
            mesh.renderOrder = 3;
          }
        });
        g.add(shell);
      }
      if (question) {
        const material = new THREE.SpriteMaterial({
          map: question,
          transparent: true,
          depthWrite: false,
        });
        boxMaterials.push(material);
        const s = new THREE.Sprite(material);
        s.scale.set(2.1, 2.1, 1);
        s.renderOrder = 4;
        g.add(s);
      }
      g.position.set(b.x, b.y, b.z);
      scene.add(g);
      boxes.push(g);
    }
    for (const o of projectiles.values()) scene.remove(o);
    projectiles.clear();
    for (const e of explosions.values()) {
      scene.remove(e);
      disposeObject(e);
    }
    explosions.clear();
    particles.clear();
    camSet = false;
    introAngle = 0;
  }

  function updateTrail(v: RacerView, k: Kart) {
    const kinds =
      k.trailing && k.item
        ? k.item.includes('banana')
          ? 'banana'
          : k.item.includes('red')
            ? 'red-shell'
            : k.item.includes('green')
              ? 'green-shell'
              : ''
        : '';
    const tripleOrbit = k.item === 'triple-green-shell' && k.roulette <= 0;
    const want = kinds && !tripleOrbit ? (k.item?.startsWith('triple') ? k.itemCount : 1) : 0;
    const key = `${kinds}:${want}`;
    if (v.trail.userData.key !== key) {
      v.trail.clear();
      v.trail.userData.key = key;
      for (let i = 0; i < want; i++) {
        const m = itemModel(kinds);
        m.position.set(0, 0, -6.2 - i * 2.4);
        v.trail.add(m);
      }
    }
    const okey = tripleOrbit ? `o:${k.itemCount}` : '';
    if (v.orbit.userData.key !== okey) {
      v.orbit.clear();
      v.orbit.userData.key = okey;
      if (tripleOrbit)
        for (let i = 0; i < k.itemCount; i++) {
          const m = itemModel('green-shell');
          const a = (i / 3) * Math.PI * 2;
          m.position.set(Math.cos(a) * 5.2, 0.6, Math.sin(a) * 5.2);
          v.orbit.add(m);
        }
    }
    v.orbit.rotation.y = time * 5;
    v.trail.children.forEach((c, i) => {
      c.rotation.y = kinds.includes('shell') ? time * 9 : 0;
      c.position.y = Math.sin(time * 8 + i) * 0.1;
    });
  }

  function drawKart(v: RacerView, k: Kart, dt: number, reduced: boolean, isPlayer: boolean) {
    const s = race!.surface;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    // Terrain pitch/roll.
    const hf = heightAt(s, k.x + fx * 3, k.z + fz * 3);
    const hb = heightAt(s, k.x - fx * 3, k.z - fz * 3);
    const hl = heightAt(s, k.x + fz * 2.2, k.z - fx * 2.2);
    const hr = heightAt(s, k.x - fz * 2.2, k.z + fx * 2.2);
    const pitch = k.grounded ? Math.atan2(hb - hf, 6) : -k.vy * 0.004;
    const roll = k.grounded ? Math.atan2(hl - hr, 4.4) : 0;
    v.spinAngle = k.spin > 0 ? v.spinAngle + dt * 14 * Math.min(1, k.spin * 1.6) : 0;
    v.tumbleAngle = k.tumble > 0 ? (1.45 - k.tumble) * Math.PI * 2 * 0.68 : 0;
    const driftYaw = k.driftDir * 0.42;
    let y = k.y;
    if (k.respawn > 0) {
      // Lakitu fishes the kart out and lowers it back on the course.
      const t = Math.min(1, k.respawn / 1.6);
      y += 4 + t * 26;
    }
    v.root.position.set(k.x, y, k.z);
    v.root.rotation.set(
      pitch - (k.tumble > 0 ? v.tumbleAngle : 0),
      k.heading + driftYaw + v.spinAngle,
      roll + k.steer * -0.04,
    );
    const shrink = k.shrink > 0 ? 0.55 : 1;
    v.root.scale.setScalar(THREE.MathUtils.lerp(v.root.scale.x || 1, shrink, Math.min(1, dt * 8)));
    // Hop bounce.
    v.chassis.position.y = k.hop > 0 ? Math.sin((1 - k.hop / 0.22) * Math.PI) * 0.6 : 0;
    if (v.driver) v.driver.rotation.z = -k.steer * 0.1 - k.driftDir * 0.08;
    for (const w of v.wheels) {
      w.node.rotation.x = w.base.x + k.wheelTurn;
      w.node.rotation.y = w.base.y + (w.front ? k.steer * 0.42 - k.driftDir * 0.25 : 0);
    }
    v.shadow.position.set(k.x, heightAt(s, k.x, k.z) + 0.08, k.z);
    v.shadow.rotation.y = k.heading + driftYaw;
    v.shadow.visible = k.respawn <= 0;
    (v.shadow.material as THREE.MeshBasicMaterial).opacity = 1;
    // Star rainbow, invulnerability blink.
    const blinking = k.invulnerable > 0 && k.star <= 0 && Math.floor(time * 18) % 2 === 0;
    v.root.visible = !blinking;
    if (k.star > 0) {
      tmpColor.setHSL((time * 1.8) % 1, 1, 0.5);
      v.materials.forEach((m) => {
        m.emissive.copy(tmpColor);
        m.emissiveIntensity = 0.85;
      });
    } else if (v.materials[0]?.emissiveIntensity) {
      v.materials.forEach((m) => {
        m.emissiveIntensity = 0;
      });
    }
    updateTrail(v, k);
    // Effects.
    if (reduced) return;
    const lx = fz;
    const lz = -fx;
    const sc = v.scale * shrink;
    const rear = (side: number) => ({
      x: k.x - fx * 3.6 * sc + lx * side * 2.2 * sc,
      z: k.z - fz * 3.6 * sc + lz * side * 2.2 * sc,
    });
    const near = isPlayer ? 1 : 0.5;
    if (k.driftDir !== 0 && k.grounded) {
      const col = k.driftStage === 2 ? C.orange : k.driftStage === 1 ? C.blue : C.white;
      for (const side of [-1, 1]) {
        const p = rear(side);
        const n = k.driftStage > 0 ? 3 : 1;
        for (let i = 0; i < n * near + 0.5; i++)
          particles.emit(
            p.x,
            k.y + 0.4,
            p.z,
            (Math.random() - 0.5) * 10 - fx * 6,
            Math.random() * 7 + 2,
            (Math.random() - 0.5) * 10 - fz * 6,
            col,
            k.driftStage > 0 ? 1 : 0.6,
            k.driftStage > 0 ? 0.5 : 0.35,
            0.28,
            0,
            30,
          );
      }
    }
    if (k.boost > 0 || k.star > 0) {
      for (const side of [-0.5, 0.5]) {
        const p = rear(side);
        particles.emit(
          p.x,
          k.y + 1.3 * sc,
          p.z,
          -fx * 18,
          1,
          -fz * 18,
          C.flame,
          0.95,
          1.2 * sc,
          0.16,
          -3,
        );
        particles.emit(
          p.x,
          k.y + 1.3 * sc,
          p.z,
          -fx * 14,
          1,
          -fz * 14,
          C.flameCore,
          0.95,
          0.6 * sc,
          0.1,
          -2,
        );
      }
    }
    const offroad = k.surface === 2 || k.surface === 3;
    if (offroad && Math.abs(k.speed) > 12 && k.grounded && Math.random() < 0.7 * near) {
      const p = rear(Math.random() < 0.5 ? -1 : 1);
      particles.emit(
        p.x,
        k.y + 0.5,
        p.z,
        (Math.random() - 0.5) * 6,
        4 + Math.random() * 3,
        (Math.random() - 0.5) * 6,
        k.surface === 3 ? C.dust : C.grass,
        0.65,
        0.9,
        0.55,
        2.5,
        6,
      );
    }
    if (k.burnout > 0 || (k.spin > 0 && Math.random() < 0.6) || k.tumble > 0) {
      const p = rear(0);
      particles.emit(
        p.x,
        k.y + 1,
        p.z,
        (Math.random() - 0.5) * 3,
        5,
        (Math.random() - 0.5) * 3,
        k.burnout > 0 ? C.dark : C.smoke,
        0.55,
        1.4,
        0.8,
        3,
      );
    }
    if (k.wallHit > 0.3) {
      for (let i = 0; i < 6; i++)
        particles.emit(
          k.x + fx * 3,
          k.y + 1,
          k.z + fz * 3,
          (Math.random() - 0.5) * 20,
          Math.random() * 12,
          (Math.random() - 0.5) * 20,
          C.spark,
          1,
          0.45,
          0.35,
          0,
          30,
        );
    }
    if (k.star > 0 && Math.random() < 0.5) {
      tmpColor.setHSL(Math.random(), 1, 0.65);
      particles.emit(
        k.x + (Math.random() - 0.5) * 5,
        k.y + Math.random() * 4,
        k.z + (Math.random() - 0.5) * 5,
        0,
        3,
        0,
        tmpColor,
        1,
        0.5,
        0.5,
      );
    }
  }

  function drawProjectiles(r: Race, dt: number, reduced: boolean) {
    const seen = new Set<number>();
    for (const p of r.projectiles) {
      seen.add(p.id);
      let o = projectiles.get(p.id);
      if (!o) {
        o = itemModel(p.kind);
        scene.add(o);
        projectiles.set(p.id, o);
      }
      o.position.set(p.x, p.y + (p.kind === 'banana' ? 0 : p.kind === 'bobomb' ? 0 : 0.1), p.z);
      if (p.kind === 'green-shell' || p.kind === 'red-shell') {
        o.rotation.y += dt * 14;
        if (!reduced && Math.random() < 0.5)
          particles.emit(
            p.x,
            p.y + 0.6,
            p.z,
            0,
            1,
            0,
            p.kind === 'red-shell' ? C.orange : C.white,
            0.5,
            0.6,
            0.25,
          );
      } else if (p.kind === 'bobomb') {
        o.rotation.y = Math.atan2(p.vx, p.vz);
        if (p.grounded && Math.floor(time * (p.fuse < 1 ? 16 : 6)) % 2 === 0)
          o.traverse((n) => {
            const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m?.emissive) m.emissive.set('#ff2200');
          });
        else
          o.traverse((n) => {
            const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m?.emissive) m.emissive.set('#000000');
          });
      }
    }
    for (const [id, o] of projectiles)
      if (!seen.has(id)) {
        scene.remove(o);
        projectiles.delete(id);
      }
    const eseen = new Set<number>();
    for (const e of r.explosions) {
      eseen.add(e.id);
      let m = explosions.get(e.id);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.SphereGeometry(1, 24, 16),
          new THREE.MeshBasicMaterial({
            color: '#ffb02e',
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        scene.add(m);
        explosions.set(e.id, m);
        shake = Math.max(shake, 0.8);
        if (!reduced)
          for (let i = 0; i < 90; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 10 + Math.random() * 26;
            particles.emit(
              e.x,
              e.y + 2,
              e.z,
              Math.cos(a) * sp,
              Math.random() * 26,
              Math.sin(a) * sp,
              i % 3 ? C.boom : C.smoke,
              0.95,
              2 + Math.random() * 2,
              0.9,
              3,
              12,
            );
          }
      }
      m.position.set(e.x, e.y + 2, e.z);
      m.scale.setScalar(2 + e.age * 26);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - e.age * 1.4);
    }
    for (const [id, m] of explosions)
      if (!eseen.has(id)) {
        scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        explosions.delete(id);
      }
  }

  function drawLakitu(r: Race, k: Kart, phase: Race['phase']) {
    if (!lakitu) return;
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let show = false;
    reverseBoard!.visible = false;
    flag!.visible = false;
    lakitu.children[1].visible = false;
    if (phase === 'countdown' || (phase === 'racing' && r.elapsed < 0.9)) {
      show = true;
      lakitu.children[1].visible = true;
      lakitu.position.set(
        k.x + fx * 13 - fz * 3.5,
        k.y + 9 + Math.sin(time * 2) * 0.3 + (phase === 'racing' ? r.elapsed * 30 : 0),
        k.z + fz * 13 + fx * 3.5,
      );
      const n = Math.ceil(r.countdown);
      signalLights.forEach((m, i) => {
        const lit = phase === 'racing' || n <= 3 - i;
        m.emissive.set(phase === 'racing' ? '#1d8bff' : lit ? '#ff2a1a' : '#000000');
        m.emissiveIntensity = lit ? 2 : 0;
      });
    } else if (k.respawn > 0) {
      show = true;
      lakitu.position.set(k.x, k.y + 4 + Math.min(1, k.respawn / 1.6) * 26 + 6, k.z);
    } else if (k.wrongWay > 1 && phase === 'racing') {
      show = true;
      reverseBoard!.visible = true;
      lakitu.position.set(k.x + fx * 12, k.y + 8 + Math.sin(time * 2) * 0.3, k.z + fz * 12);
    } else if (phase === 'finished') {
      show = true;
      flag!.visible = true;
      flag!.rotation.z = Math.sin(time * 9) * 0.6;
      lakitu.position.set(k.x + fx * 9 + fz * 4, k.y + 8, k.z + fz * 9 - fx * 4);
    }
    lakitu.visible = show;
    if (show) lakitu.lookAt(camera.position.x, lakitu.position.y, camera.position.z);
  }

  return {
    ready,
    setup,
    resize(width: number, height: number) {
      if (disposed) return;
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      particles.setScale(height * renderer.getPixelRatio(), camera.fov);
    },
    events(r: Race) {
      const pi = r.player.index;
      for (const e of r.events)
        if (e.kart === pi && (e.type === 'hit' || e.type === 'spin')) shake = Math.max(shake, 0.6);
    },
    draw(r: Race, dt: number, reducedMotion: boolean, lookBack = false) {
      if (disposed || !templates.mario) return;
      if (race !== r || views.length !== r.karts.length) setup(r);
      time += dt;
      const player = r.player;
      r.karts.forEach((k, i) => drawKart(views[i], k, dt, reducedMotion, k.human));
      // Item boxes spin and bob; hide while respawning.
      r.boxes.forEach((b, i) => {
        const g = boxes[i];
        if (!g) return;
        g.visible = b.respawn <= 0;
        const grow = b.respawn > 0 ? 0 : 1;
        g.scale.setScalar(grow);
        g.rotation.set(time * 0.9 + i, time * 1.3 + i, 0);
        g.position.y = b.y + Math.sin(time * 2.4 + i) * 0.35;
        g.children[1]?.rotation.set(0, 0, 0);
        const shell = g.children[0];
        shell?.traverse((n) => {
          const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m?.emissive) m.emissive.setHSL((time * 0.25 + i * 0.07) % 1, 0.9, 0.45);
        });
      });
      drawProjectiles(r, dt, reducedMotion);
      particles.update(dt);
      // Camera.
      const k = player;
      if (lastPhase === 'ready' && r.phase !== 'ready') camSet = false;
      lastPhase = r.phase;
      const ease = (rate: number) => (reducedMotion ? 1 : 1 - Math.exp(-dt * rate));
      if (!camSet) camYaw = k.heading;
      let pos: THREE.Vector3;
      let look: THREE.Vector3;
      if (r.phase === 'ready') {
        introAngle += dt * 0.25;
        const ahead = pointAt(k.progress + 20);
        const a = k.heading + Math.PI * 0.85 + Math.sin(introAngle) * 0.6;
        pos = new THREE.Vector3(ahead.x + Math.sin(a) * 34, k.y + 12, ahead.z + Math.cos(a) * 34);
        look = new THREE.Vector3(k.x, k.y + 2, k.z);
        camYaw = k.heading;
      } else if (r.phase === 'finished') {
        introAngle += dt * 0.35;
        const a = k.heading + Math.PI + introAngle;
        pos = new THREE.Vector3(k.x + Math.sin(a) * 15, k.y + 6, k.z + Math.cos(a) * 15);
        look = new THREE.Vector3(k.x, k.y + 2.2, k.z);
      } else {
        const stunned = isStunned(k);
        if (!stunned || k.respawn > 0)
          camYaw += wrapAngle(k.heading + k.driftDir * 0.12 - camYaw) * ease(k.driftDir ? 4 : 6);
        const yaw = lookBack ? camYaw + Math.PI : camYaw;
        const dist = lookBack ? 12 : 13.5 + Math.min(1, Math.max(0, k.speed) / 70) * 1.5;
        const ky = k.respawn > 0 ? k.y + 4 + Math.min(1, k.respawn / 1.6) * 26 : k.y;
        pos = new THREE.Vector3(k.x - Math.sin(yaw) * dist, ky + 5.6, k.z - Math.cos(yaw) * dist);
        const ground = heightAt(r.surface, pos.x, pos.z);
        pos.y = Math.max(pos.y, ground + 2.5);
        look = new THREE.Vector3(k.x + Math.sin(yaw) * 7, ky + 2.6, k.z + Math.cos(yaw) * 7);
      }
      if (!camSet || reducedMotion) camera.position.copy(pos);
      else camera.position.lerp(pos, ease(r.phase === 'racing' ? 12 : 3));
      camSet = true;
      if (shake > 0 && !reducedMotion) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        shake = Math.max(0, shake - dt * 2.5);
      }
      camera.lookAt(look);
      const boosting = k.boost > 0 || k.star > 0;
      const fov = reducedMotion
        ? 66
        : boosting
          ? 76
          : 66 + Math.min(1, Math.max(0, k.speed) / 66) * 3;
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * ease(5);
        camera.updateProjectionMatrix();
        particles.setScale(renderer.domElement.height, camera.fov);
      }
      if (sky) {
        sky.position.set(camera.position.x, 0, camera.position.z);
        sky.updateMatrixWorld();
      }
      drawLakitu(r, k, r.phase);
      // Lightning flash.
      scene.background = (scene.background as THREE.Color).set(
        r.lightning > 0.3 ? '#ffffff' : '#8ed7f5',
      );
      renderer.render(scene, camera);
    },
    stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const v of views) v.materials.forEach((m) => m.dispose());
      boxMaterials.forEach((m) => m.dispose());
      disposeObject(scene);
      Object.values(templates).forEach((t) => t && disposeObject(t));
      shadowTexture.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      question?.dispose();
      renderer.dispose();
    },
  };
}
export type KartRenderer = ReturnType<typeof createKartRenderer>;
