import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { Match, RULES, distance } from './match.mjs';
import { WEAPONS, EQUIPMENT } from './weapons.mjs';
import { Navigation } from './navigation.mjs';
import { SOUND_NAMES, fireSound, resolveSound } from './audio-map.mjs';
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const $ = (id) => document.querySelector(`#${id}`);
const renderer = new THREE.WebGLRenderer({
  canvas: $('world'),
  antialias: true,
  powerPreference: 'high-performance',
});
const lowQuality = new URLSearchParams(location.search).get('quality') === 'low';
renderer.setPixelRatio(Math.min(1, (lowQuality ? 640 : 1280) / innerWidth));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a8c0c6');
scene.fog = new THREE.Fog('#a8c0c6', 95, 210);
scene.add(new THREE.HemisphereLight('#fff3d8', '#5b6152', 2.5));
const sun = new THREE.DirectionalLight('#fff1d3', 2.7);
sun.position.set(-35, 70, -15);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.035, 400);
camera.rotation.order = 'YXZ';
camera.position.set(-18, 5, 18);
camera.lookAt(-5, 0, -30);
const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
let collision = null,
  nav = new Navigation(),
  match = null,
  mode = 'menu',
  paused = true,
  yaw = 0,
  pitch = 0,
  scoped = false,
  muted = false,
  lang = 'en',
  ready = false,
  redraw = true;
const input = { keys: new Set(), fire: false };
let modelId = '',
  modelTicket = 0,
  spawns,
  sites,
  frame = 0,
  smoothedFps = 60,
  last = performance.now(),
  grenades = [],
  effects = [],
  spectate = 0;
const avatars = [],
  characterTemplates = new Map(),
  worldWeaponCache = new Map(),
  droppedMeshes = new Map(),
  modelCache = new Map(),
  weaponRoot = new THREE.Group();
camera.add(weaponRoot);
scene.add(camera);
const audioCache = new Map();
const audioStats = { decoded: 0, played: 0 };
let audioContext = null,
  soundManifest = [],
  lastFoot = 0,
  lastBombBeep = 0,
  hitUntil = 0,
  flashUntil = 0;
const texturedWeapons = new Set(Object.keys(WEAPONS).filter((id) => id !== 'knife'));
let weaponMixer = null,
  weaponClips = [],
  weaponAction = null;
function animateWeapon(fragment) {
  if (!weaponMixer) return;
  const clip = weaponClips.find((c) => c.name.toLowerCase().includes(fragment));
  if (!clip) return;
  const next = weaponMixer.clipAction(clip);
  if (weaponAction) weaponAction.fadeOut(0.08);
  next.reset().fadeIn(0.08).play();
  if (fragment === 'idle') next.setLoop(THREE.LoopRepeat, Infinity);
  else {
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
  }
  weaponAction = next;
}
function loadMessage(text, percent) {
  console.log('LOAD', text);
  $('loading').textContent = text;
  $('loadbar').style.width = `${percent}%`;
}
function captureMouse() {
  try {
    const result = renderer.domElement.requestPointerLock?.();
    result?.catch(() => {
      $('hint').textContent =
        'Mouse capture unavailable. Hold left mouse button and drag to aim, or use arrow keys.';
    });
  } catch {
    $('hint').textContent =
      'Mouse capture unavailable. Hold left mouse button and drag to aim, or use arrow keys.';
  }
}
function vec(p, h = 0) {
  return new THREE.Vector3(p.x, p.y + h, p.z);
}
function hit(a, b) {
  if (!collision) return null;
  const delta = b.clone().sub(a);
  ray.set(a, delta.normalize());
  ray.far = a.distanceTo(b);
  const previous = ray.firstHitOnly;
  ray.firstHitOnly = true;
  const result = ray.intersectObject(collision, false)[0] || null;
  ray.firstHitOnly = previous;
  return result;
}
function floor(p, maxY = p.y + 0.55) {
  if (!collision) return null;
  ray.set(new THREE.Vector3(p.x, maxY, p.z), new THREE.Vector3(0, -1, 0));
  ray.far = 50;
  const h = ray.intersectObject(collision, false)[0];
  return h && h.face.normal.y > 0.45 ? h.point.y : null;
}
function basicMaterial(material) {
  return new THREE.MeshBasicMaterial({
    map: material.map,
    color: material.color,
    side: material.side,
    alphaTest: material.alphaTest,
    transparent: material.transparent,
    depthWrite: !material.transparent,
  });
}
function blockedSmoke(a, b) {
  return effects.some(
    (e) =>
      e.type === 'smoke' &&
      new THREE.Line3(vec(a, 0.8), vec(b, 0.8))
        .closestPointToPoint(vec(e.position, 1), true, new THREE.Vector3())
        .distanceTo(vec(e.position, 1)) < 3.7,
  );
}
function visible(a, b) {
  return !hit(vec(a, 1.05), vec(b, 1.05)) && !blockedSmoke(a, b);
}
function sourcePosition(s) {
  const [x, y, z] = s.split(' ').map(Number);
  return { x: x * 0.01905, y: z * 0.01905, z: -y * 0.01905 };
}
async function load() {
  try {
    const [gltf, entities, manifest, navData] = await Promise.all([
      new GLTFLoader().loadAsync('assets/map/dust2.glb', (e) =>
        loadMessage(
          'Loading converted Dust II geometry and original textures…',
          e.total ? Math.round((e.loaded / e.total) * 55) : 20,
        ),
      ),
      fetch('assets/map/entities.json').then((r) => {
        if (!r.ok) throw new Error('Missing map entities');
        return r.json();
      }),
      fetch('assets-lock.json').then((r) => r.json()),
      fetch('assets/map/navigation.json').then((r) => {
        if (!r.ok) throw new Error('Missing precomputed navigation');
        return r.json();
      }),
    ]);
    soundManifest = (manifest.assets || manifest.files || [])
      .filter((x) => x.path?.endsWith('.wav'))
      .map((x) => x.path);
    gltf.scene.updateMatrixWorld(true);
    const solid = [],
      groups = new Map();
    let meshCount = 0;
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (materials.some((m) => /tools|trigger|clip|skybox|nodraw|hint|areaportal/i.test(m.name)))
        return;
      const matrices = [];
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          const m = new THREE.Matrix4();
          o.getMatrixAt(i, m);
          matrices.push(new THREE.Matrix4().multiplyMatrices(o.matrixWorld, m));
        }
      } else matrices.push(o.matrixWorld);
      for (const matrix of matrices) {
        const geom = o.geometry.clone().applyMatrix4(matrix);
        const c = geom.clone();
        for (const name of Object.keys(c.attributes))
          if (name !== 'position') c.deleteAttribute(name);
        solid.push(c.index ? c.toNonIndexed() : c);
        // Keep glTF material groups; merge single-material surfaces to reduce draw calls.
        if (materials.length === 1) {
          const m = materials[0];
          if (!m.alphaTest && !m.transparent) m.side = THREE.FrontSide;
          m.roughness = 1;
          m.metalness = 0;
          const groupKey = m.uuid;
          if (!groups.has(groupKey)) groups.set(groupKey, { material: m, geometries: [] });
          const g = geom.index ? geom.toNonIndexed() : geom;
          for (const key of Object.keys(g.attributes))
            if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
          if (!g.attributes.uv)
            g.setAttribute(
              'uv',
              new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2),
            );
          groups.get(groupKey).geometries.push(g);
        } else {
          scene.add(new THREE.Mesh(geom, materials));
        }
        meshCount++;
      }
    });
    for (const group of groups.values()) {
      const geometry = mergeGeometries(group.geometries);
      if (geometry) scene.add(new THREE.Mesh(geometry, basicMaterial(group.material)));
    }
    const geometry = mergeGeometries(solid);
    geometry.boundsTree = new MeshBVH(geometry, { maxLeafSize: 12 });
    collision = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    spawns = {
      T: entities
        .filter((e) => e.classname === 'info_player_terrorist')
        .map((e) => sourcePosition(e.origin)),
      CT: entities
        .filter((e) => e.classname === 'info_player_counterterrorist')
        .map((e) => sourcePosition(e.origin)),
    };
    for (const team of ['T', 'CT']) for (const p of spawns[team]) p.y = floor(p) ?? p.y;
    sites = entities
      .filter((e) => e.classname === 'func_bomb_target')
      .map((e) => sourcePosition(e.origin));
    for (const p of sites) p.y = floor(p) ?? p.y;
    camera.position.copy(vec(spawns.T[0], 1.22));
    yaw = -Math.PI;
    camera.rotation.set(0, yaw, 0);
    loadMessage(`Map imported: ${meshCount} surfaces. Loading precomputed navigation…`, 90);
    nav = new Navigation(navData.cell);
    nav.nodes = navData.nodes;
    window.__mapInfo = {
      meshes: meshCount,
      nodes: nav.nodes.length,
      sites,
      spawns,
      materials: groups.size,
    };
    for (const team of ['T', 'CT']) {
      characterTemplates.set(
        team,
        await new GLTFLoader().loadAsync(`assets/characters/${team.toLowerCase()}.glb`),
      );
    }
    for (let i = 0; i < 10; i++) {
      const avatar = createAvatar(i);
      avatars.push(avatar);
      scene.add(avatar);
    }
    loadMessage(
      `Ready. ${nav.nodes.length.toLocaleString()} navigation nodes. Prototype gameplay, unverified parity.`,
      100,
    );
    for (const id of ['start-t', 'start-ct', 'tour']) $(id).disabled = false;
    ready = true;
  } catch (error) {
    console.error(error);
    loadMessage(`Unable to load the game: ${error.message}. Restore map assets and reload.`, 0);
  }
}
function createAvatar(id) {
  const g = new THREE.Group();
  setAvatarTeam(g, id < 5 ? 'T' : 'CT');
  g.visible = false;
  return g;
}
function setAvatarTeam(avatar, team) {
  if (avatar.userData.team === team) return;
  avatar.userData.mixer?.stopAllAction();
  avatar.traverse((o) => {
    if (o.isMesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
  });
  avatar.clear();
  const template = characterTemplates.get(team);
  const model = cloneSkeleton(template.scene);
  model.rotation.y = Math.PI;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = Array.isArray(o.material)
      ? o.material.map(basicMaterial)
      : basicMaterial(o.material);
  });
  avatar.add(model);
  const mixer = new THREE.AnimationMixer(model);
  avatar.userData = { team, mixer, actions: {}, action: null, previous: null };
  for (const clip of template.animations)
    avatar.userData.actions[clip.name] = mixer.clipAction(clip);
}
function animateAvatar(avatar, player, dt) {
  setAvatarTeam(avatar, player.team);
  const data = avatar.userData;
  const moving = data.previous && distance(data.previous, player.position) > dt * 0.2;
  const name = player.crouch ? 'crouch' : moving ? 'run' : 'idle';
  const action = data.actions[name];
  if (action && action !== data.action) {
    data.action?.fadeOut(0.16);
    action.reset().fadeIn(0.16).play();
    data.action = action;
  }
  data.mixer.update(dt);
  data.previous = { ...player.position };
  if (data.weaponId !== player.weapon.id) showAvatarWeapon(avatar, player.weapon.id);
}
function worldWeapon(id) {
  if (!worldWeaponCache.has(id))
    worldWeaponCache.set(id, new GLTFLoader().loadAsync(`assets/worldmodels/${id}.glb`));
  return worldWeaponCache.get(id);
}
function prepareWorldWeapon(template) {
  const model = cloneSkeleton(template.scene);
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.material = Array.isArray(o.material)
        ? o.material.map(basicMaterial)
        : basicMaterial(o.material);
    }
  });
  return model;
}
async function showAvatarWeapon(avatar, id) {
  const data = avatar.userData;
  data.weaponId = id;
  if (data.weaponModel) {
    data.weaponModel.removeFromParent();
    data.weaponModel.traverse((o) => {
      if (o.isMesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
    });
    data.weaponModel = null;
  }
  if (id === 'knife') return;
  try {
    const template = await worldWeapon(id);
    if (avatar.userData !== data || data.weaponId !== id) return;
    const targetHand =
      avatar.getObjectByName('ValveBipedBip01_R_Hand') ||
      avatar.getObjectByName('ValveBiped.Bip01_R_Hand');
    if (!targetHand) throw new Error('Missing character hand attachment');
    const model = prepareWorldWeapon(template);
    model.updateMatrixWorld(true);
    const sourceHand =
      model.getObjectByName('ValveBipedBip01_R_Hand') ||
      model.getObjectByName('ValveBiped.Bip01_R_Hand');
    if (!sourceHand) throw new Error(`Missing ${id} hand attachment`);
    model.applyMatrix4(sourceHand.matrixWorld.clone().invert());
    targetHand.add(model);
    data.weaponModel = model;
  } catch (error) {
    console.warn('World weapon unavailable', id, error.message);
  }
}
function updateDrops() {
  for (const [drop, mesh] of droppedMeshes) {
    if (match.drops.includes(drop)) continue;
    droppedMeshes.delete(drop);
    if (mesh) {
      scene.remove(mesh);
      mesh.traverse((o) => {
        if (o.isMesh)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
  }
  for (const drop of match.drops) {
    if (drop.weapon.id === 'knife' || droppedMeshes.has(drop)) continue;
    droppedMeshes.set(drop, null);
    worldWeapon(drop.weapon.id)
      .then((template) => {
        if (!droppedMeshes.has(drop)) return;
        const model = prepareWorldWeapon(template);
        model.rotation.x = Math.PI / 2;
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(
          drop.position.x - center.x,
          drop.position.y - box.min.y + 0.03,
          drop.position.z - center.z,
        );
        droppedMeshes.set(drop, model);
        scene.add(model);
      })
      .catch((error) => console.warn('Dropped weapon unavailable', error.message));
  }
}
async function showWeapon(id) {
  if (id === modelId) return;
  modelId = id;
  const ticket = ++modelTicket;
  weaponRoot.clear();
  weaponMixer = null;
  weaponAction = null;
  weaponClips = [];
  if (texturedWeapons.has(id)) {
    try {
      let gltf = modelCache.get(`gltf:${id}`);
      if (!gltf) {
        gltf = await new GLTFLoader().loadAsync(`assets/viewmodels/${id}.glb`);
        modelCache.set(`gltf:${id}`, gltf);
      }
      if (ticket !== modelTicket) return;
      const model = cloneSkeleton(gltf.scene);
      model.rotation.y = Math.PI;
      model.traverse((o) => {
        if (o.name.includes('ct_arms') && match?.players[0].team === 'T') o.visible = false;
        if (o.name.includes('t_arms') && match?.players[0].team === 'CT') o.visible = false;
        if (o.isMesh) {
          o.frustumCulled = false;
          o.material = Array.isArray(o.material)
            ? o.material.map(basicMaterial)
            : basicMaterial(o.material);
        }
      });
      weaponRoot.add(model);
      weaponMixer = new THREE.AnimationMixer(model);
      weaponClips = gltf.animations;
      animateWeapon('idle');
      return;
    } catch (error) {
      console.warn('Textured weapon load failed; using verified OBJ', error.message);
    }
  }
  if (id === 'knife') {
    const knife = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.06, 0.38),
      new THREE.MeshStandardMaterial({ color: '#c6c7bd', metalness: 0.7, roughness: 0.3 }),
    );
    knife.position.set(0.22, -0.21, -0.45);
    weaponRoot.add(knife);
    return;
  }
  try {
    let obj = modelCache.get(id);
    if (!obj) {
      obj = await new OBJLoader().loadAsync(`assets/models/${id}.obj`);
      modelCache.set(id, obj);
    }
    if (ticket !== modelTicket) return;
    const clone = obj.clone();
    const box = new THREE.Box3().setFromObject(clone),
      size = box.getSize(new THREE.Vector3()),
      center = box.getCenter(new THREE.Vector3());
    clone.position.sub(center);
    const holder = new THREE.Group();
    holder.add(clone);
    const scale = 0.4 / Math.max(size.x, size.y, size.z);
    holder.scale.setScalar(scale);
    // Workshop OBJ axes differ from animated viewmodels; this is a static-mesh approximation.
    holder.rotation.y = Math.PI;
    holder.position.set(0.24, -0.26, -0.42);
    clone.traverse((o) => {
      if (o.isMesh)
        o.material = new THREE.MeshStandardMaterial({
          color: id === 'ak-47' ? '#4b4031' : '#343d3b',
          roughness: 0.55,
          metalness: 0.5,
        });
    });
    weaponRoot.add(holder);
  } catch (error) {
    console.warn('Weapon unavailable', id, error);
  }
}
function start(team, tour = false) {
  match = new Match({ team, spawns, sites });
  mode = tour ? 'tour' : 'match';
  paused = false;
  scoped = false;
  spectate = 0;
  yaw = 0;
  pitch = 0;
  if (tour) {
    match.phase = 'live';
    match.timer = 99999;
    for (const p of match.players) if (!p.human) p.alive = false;
  }
  $('menu').hidden = true;
  $('resume').hidden = false;
  audioContext ??= new AudioContext();
  audioContext.resume().catch(() => {});
  captureMouse();
  showWeapon(match.players[0].weapon.id);
}
function move(p, dx, dz, dt, jump = false) {
  const radius = 0.25,
    from = { ...p.position };
  for (const [x, z] of [
    [dx, 0],
    [0, dz],
  ]) {
    if (!x && !z) continue;
    const to = { ...p.position, x: p.position.x + x, z: p.position.z + z };
    const dir = new THREE.Vector3(x, 0, z).normalize();
    const probe = vec(to, 0.35).addScaledVector(dir, radius);
    if (
      !hit(vec(p.position, 0.35), probe) &&
      !hit(
        vec(p.position, p.crouch ? 0.7 : 1.08),
        vec(to, p.crouch ? 0.7 : 1.08).addScaledVector(dir, radius),
      )
    ) {
      p.position.x = to.x;
      p.position.z = to.z;
    }
  }
  const ground = floor(p.position, p.position.y + 0.48);
  if (ground !== null && ground > p.position.y + 0.42) {
    p.position = from;
    return;
  }
  if (jump && p.grounded) {
    p.vy = 4.5;
    p.grounded = false;
  }
  if (!p.grounded || ground === null || p.position.y - ground > 0.1) {
    p.grounded = false;
    p.vy -= 14 * dt;
    const nextY = p.position.y + p.vy * dt;
    if (
      p.vy > 0 &&
      hit(vec(p.position, 1.25), new THREE.Vector3(p.position.x, nextY + 1.25, p.position.z))
    )
      p.vy = 0;
    else p.position.y = nextY;
  }
  if (ground !== null && p.position.y <= ground + 0.05 && p.vy <= 0) {
    p.position.y = ground;
    p.vy = 0;
    p.grounded = true;
  }
  if (p.position.y < -12) {
    p.position = { ...spawns[p.team][0] };
    p.vy = 0;
  }
}
function shoot(p, target = null) {
  if (!match.fire(p)) return;
  const w = WEAPONS[p.weapon.id],
    origin = vec(p.position, p.crouch ? 0.85 : 1.18);
  let direction;
  if (p.human) {
    direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const moving =
      input.keys.has('KeyW') ||
      input.keys.has('KeyA') ||
      input.keys.has('KeyS') ||
      input.keys.has('KeyD');
    const spread =
      (scoped ? 0.001 : 0.004) + (moving ? 0.025 : 0) + Math.min(p.weapon.shots, 0.02) / 100;
    direction.x += (match.random() - 0.5) * spread;
    direction.y += (match.random() - 0.5) * spread;
    direction.z += (match.random() - 0.5) * spread;
    direction.normalize();
    pitch = Math.max(-1.4, pitch - 0.009);
  } else {
    direction = vec(target.position, 0.9 + match.random() * 0.3)
      .sub(origin)
      .normalize();
    direction.x += (match.random() - 0.5) * 0.025;
    direction.y += (match.random() - 0.5) * 0.025;
    direction.normalize();
  }
  const range = w.category === 'knife' ? 1.8 : 150;
  const wall = hit(origin, origin.clone().addScaledVector(direction, range));
  let max = wall ? wall.distance : range;
  let victim = null,
    head = false;
  for (const enemy of match.players) {
    if (!enemy.alive || enemy.team === p.team) continue;
    for (const [height, r, isHead] of [
      [enemy.crouch ? 0.8 : 1.18, 0.18, true],
      [enemy.crouch ? 0.52 : 0.75, 0.29, false],
      [0.3, 0.23, false],
    ]) {
      const point = new THREE.Ray(origin, direction).intersectSphere(
        new THREE.Sphere(vec(enemy.position, height), r),
        new THREE.Vector3(),
      );
      const d = point ? origin.distanceTo(point) : Infinity;
      if (d < max) {
        max = d;
        victim = enemy;
        head = isHead;
      }
    }
  }
  if (victim) {
    const pellet = w.category === 'shotgun' ? 4 : 1;
    match.damage(victim, w.damage * (head ? 4 : 1) * pellet * 0.98 ** (max / 10), p, head);
    if (p.human) hitUntil = performance.now() + 130;
  }
  const end = origin.clone().addScaledVector(direction, Math.min(max, 60));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([origin, end]),
    new THREE.LineBasicMaterial({ color: '#f8d588', transparent: true, opacity: 0.6 }),
  );
  scene.add(line);
  effects.push({ type: 'tracer', mesh: line, life: 0.06 });
  if (p.human) {
    weaponRoot.position.z = 0.025;
    weaponRoot.rotation.x = 0.02;
    animateWeapon('fire');
  }
}
function botThink(p, dt) {
  if (!p.alive || match.phase !== 'live') return;
  if (p.blindedUntil > match.time) {
    match.interact(p, dt, false);
    return;
  }
  const enemies = match.players
    .filter(
      (e) =>
        e.alive &&
        e.team !== p.team &&
        distance(p.position, e.position) < 48 &&
        (Math.cos(
          Math.atan2(e.position.x - p.position.x, e.position.z - p.position.z) +
            Math.PI -
            (p.aim || 0),
        ) > 0.1 ||
          distance(p.position, e.position) < 6 ||
          match.time - (e.lastShotAt ?? -100) < 0.5) &&
        visible(p.position, e.position),
    )
    .sort((a, b) => distance(p.position, a.position) - distance(p.position, b.position));
  const enemy = enemies[0];
  p.crouch = Boolean(
    enemy && distance(p.position, enemy.position) > 16 && p.health >= 35 && !p.weapon.reloading,
  );
  if (enemy) {
    match.interact(p, dt, false);
    if (p.target !== enemy.id) {
      p.target = enemy.id;
      p.reaction = match.time + 0.25 + match.random() * 0.3;
    }
    p.lastSeen = { position: { ...enemy.position }, time: match.time };
    p.aim = Math.atan2(enemy.position.x - p.position.x, enemy.position.z - p.position.z) + Math.PI;
    if (!p.weapon.ammo) match.reload(p);
    if (
      match.time > (p.utilityAt || 0) &&
      p.grenades.length > 0 &&
      distance(p.position, enemy.position) > 8
    ) {
      const type =
        p.health < 50 && p.grenades.includes('smoke')
          ? 'smoke'
          : p.grenades.includes('flash')
            ? 'flash'
            : null;
      if (type) {
        throwGrenade(p, type, enemy.position);
        p.utilityAt = match.time + 12;
      }
    }
    if (match.time > p.reaction) shoot(p, enemy);
    if (p.health < 35 || p.weapon.reloading) {
      const away = vec(p.position).sub(vec(enemy.position)).normalize();
      move(p, away.x * dt * 2, away.z * dt * 2, dt);
    } else if (distance(p.position, enemy.position) > 22) {
      const toward = vec(enemy.position).sub(vec(p.position)).normalize();
      move(p, toward.x * dt * 1.5, toward.z * dt * 1.5, dt);
    }
    return;
  }
  p.target = null;
  if (p.weapon.ammo < WEAPONS[p.weapon.id].mag * 0.35) match.reload(p);
  const b = match.bomb;
  let goal;
  if (b.state === 'planted') {
    goal = b.position;
    if (p.team === 'CT' && distance(p.position, goal) < 2.2) {
      match.interact(p, dt, true);
      return;
    }
    if (p.team === 'T' && distance(p.position, goal) < 7) return;
  } else if (p.team === 'T') {
    goal =
      b.state === 'dropped' ? b.position : sites[Math.floor((match.round - 1) / 2) % sites.length];
    if (b.carrier === p.id && distance(p.position, goal) < 3.7) {
      match.interact(p, dt, true);
      return;
    }
  } else {
    goal = sites[p.id % sites.length];
    if (p.lastSeen && match.time - p.lastSeen.time < 8) goal = p.lastSeen.position;
    // Rotate toward known teammates' sightings; no access to unseen opponents.
    const report = match.players.find(
      (a) => a.team === p.team && a.lastSeen && match.time - a.lastSeen.time < 5,
    );
    if (report) goal = report.lastSeen.position;
    if (distance(p.position, goal) < 5 && !report) return;
  }
  match.interact(p, dt, false);
  if (p.navGoal && distance(p.navGoal, goal) > 3) p.navAt = 0;
  if (match.time > p.navAt || p.path.length === 0) {
    p.path = nav.path(p.position, goal);
    p.navGoal = { ...goal };
    p.navAt = match.time + 3 + match.random() * 2;
    p.pathIndex = 0;
  }
  const node = p.path[p.pathIndex];
  if (!node) return;
  const d = distance(p.position, node);
  if (d < 0.12) {
    p.pathIndex++;
    return;
  }
  const dx = (node.x - p.position.x) / d,
    dz = (node.z - p.position.z) / d;
  const speed = 3.7;
  const before = { ...p.position };
  const step = Math.min(speed * dt, d);
  move(p, dx * step, dz * step, dt, node.y - p.position.y > 0.25 && d < 1.2);
  p.aim = Math.atan2(dx, dz) + Math.PI;
  if (distance(before, p.position) < dt * 0.1) {
    p.stuck += dt;
    if (p.stuck > 0.6) {
      p.path = [];
      p.stuck = 0;
    }
  } else p.stuck = 0;
}
function throwGrenade(p, type, target = null) {
  const index = p.grenades.indexOf(type);
  if (index === -1 || match.phase !== 'live') return;
  p.grenades.splice(index, 1);
  const direction = target
    ? vec(target, 0.8)
        .sub(vec(p.position, 1))
        .normalize()
        .add(new THREE.Vector3(0, 0.22, 0))
        .normalize()
    : new THREE.Vector3(0, 0.15, -1).applyQuaternion(camera.quaternion).normalize();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 8, 6),
    new THREE.MeshStandardMaterial({ color: type === 'smoke' ? '#9eac95' : '#677446' }),
  );
  mesh.position.copy(vec(p.position, 1));
  scene.add(mesh);
  grenades.push({
    type,
    mesh,
    owner: p,
    velocity: direction.multiplyScalar(11),
    life: 1.7,
    bounces: 0,
  });
}
function updateGrenades(dt) {
  for (const g of grenades) {
    g.life -= dt;
    g.velocity.y -= 10 * dt;
    const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
    const h = hit(g.mesh.position, next);
    if (h) {
      g.velocity.reflect(h.face.normal).multiplyScalar(0.45);
      g.bounces++;
    } else g.mesh.position.copy(next);
    if (g.life > 0) continue;
    const position = { x: g.mesh.position.x, y: g.mesh.position.y, z: g.mesh.position.z };
    if (g.type === 'he') {
      for (const p of match.players)
        if (p.alive) {
          const d = vec(p.position, 0.7).distanceTo(g.mesh.position);
          if (d < 8 && visible(position, p.position))
            match.damage(p, Math.max(0, 100 - d * 13), g.owner);
        }
    }
    if (g.type === 'flash') {
      for (const p of match.players)
        if (p.alive && distance(p.position, position) < 25 && visible(position, p.position)) {
          if (p.human) flashUntil = performance.now() + 2300;
          else p.blindedUntil = match.time + 2.3;
        }
    }
    if (g.type === 'smoke' || g.type === 'fire' || g.type === 'decoy') {
      const smoke = g.type === 'smoke';
      const mesh = new THREE.Mesh(
        smoke ? new THREE.SphereGeometry(3.7, 14, 12) : new THREE.CylinderGeometry(3, 3, 0.12, 18),
        new THREE.MeshBasicMaterial({
          color: smoke ? '#989b89' : g.type === 'fire' ? '#e48524' : '#879273',
          transparent: true,
          opacity: smoke ? 0.93 : 0.7,
          depthWrite: false,
        }),
      );
      mesh.position.copy(g.mesh.position);
      if (smoke) mesh.position.y += 1;
      scene.add(mesh);
      effects.push({ type: g.type, mesh, position, owner: g.owner, life: smoke ? 18 : 7 });
    }
    playSound(g.type === 'he' ? 'hegrenade/explode' : 'smokegrenade/sg_explode', position, 1);
    scene.remove(g.mesh);
    g.mesh.geometry.dispose();
    g.mesh.material.dispose();
  }
  grenades = grenades.filter((g) => g.life > 0);
  for (const e of effects) {
    e.life -= dt;
    if (e.type === 'fire' && match)
      for (const p of match.players)
        if (p.alive && distance(p.position, e.position) < 3) match.damage(p, dt * 30, e.owner);
    if (e.life <= 0) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
    }
  }
  effects = effects.filter((e) => e.life > 0);
}
async function playSound(fragment, position, volume = 0.55) {
  if (muted || !audioContext) return;
  const path = resolveSound(soundManifest, fragment);
  if (!path) return;
  try {
    let buffer = audioCache.get(path);
    if (!buffer) {
      const response = await fetch(`assets/${path}`);
      if (!response.ok) return;
      buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      audioCache.set(path, buffer);
      audioStats.decoded++;
    }
    if (muted || paused) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const gain = audioContext.createGain();
    let attenuation = 1;
    const pan = audioContext.createStereoPanner();
    if (position && match) {
      const listener = { x: camera.position.x, y: camera.position.y - 1.22, z: camera.position.z };
      const d = distance(listener, position);
      attenuation = 1 / (1 + d * 0.13);
      if (d > 1 && hit(vec(listener, 1.1), vec(position, 1.1))) attenuation *= 0.4;
      pan.pan.value = Math.max(
        -1,
        Math.min(
          1,
          ((position.x - listener.x) * Math.cos(camera.rotation.y) -
            (position.z - listener.z) * Math.sin(camera.rotation.y)) /
            Math.max(1, d),
        ),
      );
    }
    gain.gain.value = volume * attenuation;
    source.connect(gain);
    gain.connect(pan);
    pan.connect(audioContext.destination);
    source.start();
    audioStats.played++;
  } catch (error) {
    console.warn('Audio unavailable', path, error.message);
  }
}
function events() {
  for (const e of match.events.splice(0)) {
    const p = match.players[e.player];
    if (e.type === 'fire') {
      playSound(fireSound(e.weapon), p.position);
    }
    if (e.type === 'reload') {
      const name = SOUND_NAMES[e.weapon] || e.weapon;
      playSound(`weapons/${name}/${name}_clipout`, p.position, 0.4);
      if (p.human) animateWeapon('reload');
    }
    if (e.type === 'plant') playSound('c4/c4_plant', p.position);
    if (e.type === 'roundEnd' && e.reason === 'Bomb defused')
      playSound('c4/c4_disarmfinish', match.bomb.position);
    if (e.type === 'roundEnd' && e.reason === 'Bomb detonated')
      playSound('c4/c4_explode1', match.bomb.position, 1);
    if (e.type === 'kill') {
      const div = document.createElement('div');
      div.textContent = `${match.players[e.attacker]?.name || 'WORLD'}  ${e.weapon || 'GRENADE'} ${e.head ? '[HEAD]' : ''}  ${match.players[e.victim].name}`;
      $('feed').prepend(div);
      while ($('feed').children.length > 5) $('feed').lastChild.remove();
    }
    if (e.type === 'damage' && e.player === 0) {
      $('damage').style.boxShadow = 'inset 0 0 130px #c12a1588';
      setTimeout(() => ($('damage').style.boxShadow = 'inset 0 0 130px #c12a1500'), 180);
    }
    if (e.type === 'round') {
      for (const effect of effects) {
        scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
      }
      effects = [];
      for (const g of grenades) scene.remove(g.mesh);
      grenades = [];
      spectate = 0;
      scoped = false;
      modelId = '';
      for (const player of match.players) setAvatarTeam(avatars[player.id], player.team);
    }
  }
}
function update(dt) {
  if (!match || paused) return;
  const human = match.players[0];
  if (mode === 'tour') {
    match.time += dt;
  } else {
    match.tick(dt);
  }
  if (human.alive) {
    yaw +=
      ((input.keys.has('ArrowLeft') ? 1 : 0) - (input.keys.has('ArrowRight') ? 1 : 0)) * dt * 1.5;
    pitch = Math.max(
      -1.45,
      Math.min(
        1.45,
        pitch +
          ((input.keys.has('ArrowUp') ? -1 : 0) - (input.keys.has('ArrowDown') ? -1 : 0)) * dt,
      ),
    );
    human.crouch = input.keys.has('ControlLeft') || input.keys.has('KeyC');
    if (match.phase === 'live' || mode === 'tour') {
      const forward = (input.keys.has('KeyW') ? 1 : 0) - (input.keys.has('KeyS') ? 1 : 0),
        side = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0);
      const length = Math.hypot(forward, side) || 1,
        speed = human.crouch ? 1.7 : input.keys.has('ShiftLeft') ? 2.4 : 4.6;
      move(
        human,
        ((-Math.sin(yaw) * forward + Math.cos(yaw) * side) / length) * speed * dt,
        ((-Math.cos(yaw) * forward - Math.sin(yaw) * side) / length) * speed * dt,
        dt,
        input.keys.has('Space'),
      );
      if (
        (forward || side) &&
        human.grounded &&
        match.time - lastFoot > 0.4 &&
        !input.keys.has('ShiftLeft')
      ) {
        lastFoot = match.time;
        playSound(`footsteps/concrete${(frame % 4) + 1}.wav`, human.position, 0.3);
      }
      if (input.fire) {
        shoot(human);
        if (!WEAPONS[human.weapon.id].automatic) input.fire = false;
      }
      match.interact(human, dt, input.keys.has('KeyE'));
    }
    if (mode !== 'tour') for (const p of match.players) if (!p.human) botThink(p, dt);
    camera.position.copy(vec(human.position, human.crouch ? 0.82 : 1.22));
    camera.rotation.set(pitch, yaw, 0);
    weaponRoot.visible = true;
    showWeapon(human.weapon.id);
  } else {
    for (const p of match.players) if (!p.human && mode !== 'tour') botThink(p, dt);
    const alive = match.players.filter((p) => p.alive && p.team === human.team);
    const viewed = alive[spectate % Math.max(1, alive.length)];
    if (viewed) {
      camera.position.copy(vec(viewed.position, 1.3));
      camera.rotation.set(0, viewed.aim || 0, 0);
    }
    weaponRoot.visible = false;
  }
  const sniperScope = scoped && WEAPONS[human.weapon.id].category === 'sniper';
  camera.fov = scoped ? (sniperScope ? 18 : 40) : 78;
  $('scope').hidden = !sniperScope;
  $('crosshair').hidden = sniperScope;
  if (sniperScope) weaponRoot.visible = false;
  camera.updateProjectionMatrix();
  weaponRoot.position.z *= 0.8;
  weaponRoot.rotation.x *= 0.8;
  for (const p of match.players) {
    match.pickupWeapon(p, false, (position) => !hit(vec(p.position, 0.3), vec(position, 0.3)));
    const a = avatars[p.id];
    a.visible = !p.human && p.alive && mode !== 'tour';
    a.position.copy(vec(p.position));
    a.rotation.y = p.aim || 0;
    if (a.visible) animateAvatar(a, p, dt);
  }
  updateGrenades(dt);
  updateDrops();
  events();
  if (weaponMixer) {
    weaponMixer.update(dt);
    if (
      weaponAction &&
      weaponAction.getClip().name.includes('fire') &&
      weaponAction.time >= weaponAction.getClip().duration
    )
      animateWeapon('idle');
  }
  if (
    match.bomb.state === 'planted' &&
    match.time - lastBombBeep > (match.bomb.timer < 10 ? 0.25 : 1)
  ) {
    lastBombBeep = match.time;
    playSound('c4/c4_beep', match.bomb.position, 0.65);
  }
}
function hud() {
  if (!match) return;
  const p = match.players[0],
    w = p.weapon;
  $('ct-score').textContent = match.scores.CT;
  $('t-score').textContent = match.scores.T;
  $('phase').textContent =
    mode === 'tour'
      ? 'EXPLORATION'
      : match.phase === 'freeze'
        ? 'BUY TIME'
        : match.phase === 'over'
          ? 'ROUND OVER'
          : match.phase === 'match'
            ? 'MATCH END'
            : `ROUND ${match.round}`;
  const seconds = Math.max(
    0,
    Math.ceil(match.bomb.state === 'planted' ? match.bomb.timer : match.timer),
  );
  $('clock').textContent =
    mode === 'tour' ? '∞' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  $('health').textContent = Math.ceil(p.health);
  $('armor').textContent = Math.ceil(p.armor);
  $('money').textContent = `$${p.money}`;
  $('weapon').innerHTML =
    `<small>${WEAPONS[w.id].name}${w.reloading ? ' · RELOADING' : ''}</small><strong>${w.ammo} <em>/ ${w.reserve}</em></strong>`;
  let objective = '';
  if (!p.alive) objective = 'ELIMINATED · Click to change teammate view';
  else if (match.phase === 'over' || match.phase === 'match')
    objective = `${match.winner || ''} · ${match.reason || 'Match finished'}`;
  else if (match.bomb.state === 'planted')
    objective =
      p.team === 'CT'
        ? 'BOMB PLANTED · Retake and hold E to defuse'
        : 'BOMB PLANTED · Defend the site';
  else if (match.bomb.carrier === p.id)
    objective = 'YOU HAVE THE BOMB · Reach A or B, hold E to plant';
  else if (match.phase === 'freeze') objective = 'Press B to buy weapons and equipment';
  $('objective').textContent = objective;
  const b = match.bomb,
    actor = match.players[b.actor];
  $('action').hidden = !actor;
  $('action').firstElementChild.style.width =
    `${(b.progress / (b.state === 'planted' ? (actor?.kit ? RULES.kit : RULES.defuse) : RULES.plant)) * 100}%`;
  $('hitmarker').style.display = performance.now() < hitUntil ? 'block' : 'none';
  $('flash').style.opacity = Math.max(0, Math.min(0.98, (flashUntil - performance.now()) / 1700));
  if (!$('scoreboard').hidden)
    $('scores').innerHTML = match.players
      .map(
        (a) =>
          `<tr class="${a.alive ? '' : 'dead'}"><td>${a.name}</td><td>${a.team}</td><td>${a.alive ? Math.ceil(a.health) : 'DEAD'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.money}</td></tr>`,
      )
      .join('');
  drawRadar();
}
function drawRadar() {
  const ctx = $('radar').getContext('2d');
  ctx.clearRect(0, 0, 220, 220);
  if (!match) return;
  const me = match.players[0],
    scale = 2.5;
  const xy = (p) => [110 + (p.x - me.position.x) * scale, 110 + (p.z - me.position.z) * scale];
  ctx.save();
  ctx.beginPath();
  ctx.arc(110, 110, 106, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#84947733';
  for (const n of nav.nodes) {
    if (Math.abs(n.x - me.position.x) > 44 || Math.abs(n.z - me.position.z) > 44) continue;
    const [x, y] = xy(n);
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.font = 'bold 15px Arial';
  sites.forEach((s, i) => {
    const [x, y] = xy(s);
    ctx.fillStyle = '#e4bb62';
    ctx.fillText(i ? 'B' : 'A', x, y);
  });
  for (const p of match.players) {
    if (!p.alive || p.team !== me.team) continue;
    const [x, y] = xy(p.position);
    ctx.fillStyle = p.human ? '#fff' : '#9cc8df';
    ctx.beginPath();
    ctx.arc(x, y, p.human ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(110, 110);
  ctx.lineTo(110 - Math.sin(yaw) * 13, 110 - Math.cos(yaw) * 13);
  ctx.stroke();
  ctx.restore();
}
function buyMenu() {
  if (!match) return;
  const p = match.players[0];
  $('buy').hidden = !$('buy').hidden;
  if ($('buy').hidden) {
    if (!paused) captureMouse();
    return;
  }
  document.exitPointerLock?.();
  $('buy-status').textContent =
    `${p.team} · $${p.money} · ${match.canBuy(p) ? 'Buy zone active' : 'Outside buy zone / buy time'}`;
  $('buy-items').replaceChildren();
  for (const item of [...Object.values(WEAPONS), ...EQUIPMENT]) {
    if (item.id === 'knife' || (item.team !== 'both' && item.team !== p.team)) continue;
    const button = document.createElement('button');
    button.innerHTML = `${item.name}<small>$${item.price}</small>`;
    button.disabled = p.money < item.price || !match.canBuy(p);
    const currentMatch = match;
    button.addEventListener('click', () => {
      currentMatch.buy(p, item.id);
      $('buy').hidden = true;
      buyMenu();
    });
    $('buy-items').append(button);
  }
}
function pause() {
  paused = true;
  input.keys.clear();
  input.fire = false;
  $('menu').hidden = false;
  $('resume').hidden = !match;
  document.exitPointerLock?.();
}
$('start-t').addEventListener('click', () => start('T'));
$('start-ct').addEventListener('click', () => start('CT'));
$('tour').addEventListener('click', () => start('T', true));
$('resume').addEventListener('click', () => {
  paused = false;
  $('menu').hidden = true;
  captureMouse();
});
$('close-buy').addEventListener('click', buyMenu);
$('restart').addEventListener('click', () => {
  const team = match.players[0].team;
  $('scoreboard').hidden = true;
  start(team);
});
$('sound').addEventListener('click', () => {
  muted = !muted;
  $('sound').textContent = muted ? 'Sound off' : 'Sound on';
  $('sound').setAttribute('aria-pressed', String(!muted));
});
$('language').addEventListener('click', () => {
  lang = lang === 'en' ? 'zh' : 'en';
  document.documentElement.lang = lang;
  $('language').textContent = lang === 'en' ? '中文' : 'English';
  $('intro').textContent =
    lang === 'zh'
      ? '1 名真人与 9 名机器人。使用原始地图和武器素材。'
      : 'One human. Nine bots. Original map and weapon assets.';
  $('disclaimer').textContent =
    lang === 'zh'
      ? '开发版本，尚未达到 95% 还原度。使用 Workshop 移植地图、简化光照和重定向角色动画。机器人策略尚未通过验收，不适合正式演示。'
      : 'Development build, not 95% parity. Workshop map port, simplified lighting, retargeted character animations and unqualified bot tactics. Do not use as a finished CS:GO presentation.';
  $('start-t').textContent = lang === 'zh' ? '加入 T 队' : 'Play Terrorists';
  $('start-ct').textContent = lang === 'zh' ? '加入 CT 队' : 'Play Counter-Terrorists';
  $('tour').textContent = lang === 'zh' ? '探索地图' : 'Explore map';
});
document.addEventListener('keydown', (e) => {
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') {
    pause();
    return;
  }
  input.keys.add(e.code);
  if (e.repeat || !match || paused) return;
  const p = match.players[0];
  if (e.code === 'KeyB') buyMenu();
  if (e.code === 'KeyR') match.reload(p);
  if (e.code === 'KeyF') animateWeapon('lookat');
  if (e.code === 'Tab') $('scoreboard').hidden = false;
  if (e.code === 'Digit1') {
    const w = p.inventory.find((item) => !['pistol', 'knife'].includes(WEAPONS[item.id].category));
    if (w) match.switchWeapon(p, w);
  }
  if (e.code === 'Digit2') {
    const w = p.inventory.find((item) => WEAPONS[item.id].category === 'pistol');
    if (w) match.switchWeapon(p, w);
  }
  if (e.code === 'Digit3')
    match.switchWeapon(
      p,
      p.inventory.find((w) => w.id === 'knife'),
    );
  if (e.code === 'KeyE')
    match.pickupWeapon(p, true, (position) => !hit(vec(p.position, 0.3), vec(position, 0.3)));
  if (e.code === 'Digit4' && p.grenades.length > 0) throwGrenade(p, p.grenades[0]);
  if (e.code === 'KeyG') {
    if (match.bomb.carrier === p.id) {
      match.bomb = { ...match.bomb, state: 'dropped', carrier: null, position: { ...p.position } };
    } else match.dropWeapon(p);
  }
});
document.addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
  if (e.code === 'Tab') $('scoreboard').hidden = true;
});
document.addEventListener('mousemove', (e) => {
  if (paused || (document.pointerLockElement !== renderer.domElement && !(e.buttons & 1))) return;
  yaw -= e.movementX * (scoped ? 0.001 : 0.002);
  pitch = Math.max(-1.45, Math.min(1.45, pitch - e.movementY * (scoped ? 0.001 : 0.002)));
});
renderer.domElement.addEventListener('mousedown', (e) => {
  if (paused || !match) return;
  if (!match.players[0].alive) {
    spectate++;
    return;
  }
  if (e.button === 0) input.fire = true;
  if (e.button === 2 && WEAPONS[match.players[0].weapon.id].scoped) scoped = !scoped;
});
document.addEventListener('mouseup', () => (input.fire = false));
document.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  redraw = true;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
window.__test = {
  get match() {
    return match;
  },
  get navigation() {
    return nav;
  },
  get camera() {
    return camera;
  },
  get collision() {
    return collision;
  },
  get avatars() {
    return avatars;
  },
  get renderStats() {
    return { ...renderer.info.render };
  },
  get audioStats() {
    return { ...audioStats };
  },
  start,
  move,
  hit,
  floor,
};
window.render_game_to_text = () =>
  JSON.stringify({
    mode,
    paused,
    phase: match?.phase,
    round: match?.round,
    bomb: match?.bomb,
    scores: match?.scores,
    players: match?.players.map((p) => ({
      id: p.id,
      team: p.team,
      health: p.health,
      position: p.position,
      weapon: p.weapon.id,
      ammo: p.weapon.ammo,
      path: p.path.length,
      alive: p.alive,
    })),
    map: window.__mapInfo,
    coordinates: 'meters; Y up; Source X => X, Source Y => -Z',
  });
window.advanceTime = (ms) => {
  for (let i = 0; i < Math.ceil(ms / 16.667); i++) update(Math.min(ms / 1000, 0.016667));
  hud();
  renderer.render(scene, camera);
};
function loop(now) {
  const rawDt = (now - last) / 1000;
  last = now;
  smoothedFps = smoothedFps * 0.95 + 0.05 / Math.max(0.001, rawDt);
  let remaining = Math.min(0.2, rawDt);
  while (remaining > 0) {
    const dt = Math.min(1 / 60, remaining);
    update(dt);
    remaining -= dt;
  }
  if (frame++ % 5 === 0) hud();
  if (frame % 30 === 0)
    $('performance').textContent =
      `${Math.round(smoothedFps)} FPS · ${renderer.info.render.calls} draws · ${Math.round(renderer.info.render.triangles / 1000)}k tris`;
  if (ready && (!paused || redraw)) {
    renderer.render(scene, camera);
    redraw = false;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
load();
