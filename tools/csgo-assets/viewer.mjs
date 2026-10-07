import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.querySelector(`#${id}`);
let locale = 'en';
const say = (en, zh) => (locale === 'en' ? en : zh);
const state = { selected: null, loaded: false, audioPlayed: null, triangles: 0, error: null };
const dispose = (object) => {
  object.traverse((node) => {
    if (node.isMesh) node.geometry.dispose();
  });
};
window.render_game_to_text = () =>
  JSON.stringify({ type: 'asset-inspection-not-gameplay', ...state });
const names = {
  'ak-47': 'AK-47',
  aug: 'AUG',
  awp: 'AWP',
  bizon: 'PP-Bizon',
  cz_75: 'CZ75-Auto',
  desert_eagle: 'Desert Eagle',
  dual_berettas: 'Dual Berettas',
  famas: 'FAMAS',
  'five-seven': 'Five-SeveN',
  g3sg1: 'G3SG1',
  galil_ar: 'Galil AR',
  'glock-18': 'Glock-18',
  m249: 'M249',
  m4a1_s: 'M4A1-S',
  m4a4: 'M4A4',
  'mac-10': 'MAC-10',
  'mag-7': 'MAG-7',
  mp5sd: 'MP5-SD',
  mp7: 'MP7',
  mp9: 'MP9',
  negev: 'Negev',
  nova: 'Nova',
  p2000: 'P2000',
  p250: 'P250',
  p90: 'P90',
  revolver: 'R8 Revolver',
  'sawed-off': 'Sawed-Off',
  'scar-20': 'SCAR-20',
  sg_553: 'SG 553',
  ssg_08: 'SSG 08',
  'tec-9': 'Tec-9',
  'ump-45': 'UMP-45',
  'usp-s': 'USP-S',
  xm1014: 'XM1014',
};
const directories = {
  'ak-47': 'ak47',
  aug: 'aug',
  awp: 'awp',
  bizon: 'bizon',
  cz_75: 'cz75a',
  desert_eagle: 'deagle',
  dual_berettas: 'elite',
  famas: 'famas',
  'five-seven': 'fiveseven',
  g3sg1: 'g3sg1',
  galil_ar: 'galilar',
  'glock-18': 'glock18',
  m249: 'm249',
  m4a1_s: 'm4a1',
  m4a4: 'm4a1',
  'mac-10': 'mac10',
  'mag-7': 'mag7',
  mp5sd: 'mp5',
  mp7: 'mp7',
  mp9: 'mp9',
  negev: 'negev',
  nova: 'nova',
  p2000: 'hkp2000',
  p250: 'p250',
  p90: 'p90',
  revolver: 'revolver',
  'sawed-off': 'sawedoff',
  'scar-20': 'scar20',
  sg_553: 'sg556',
  ssg_08: 'ssg08',
  'tec-9': 'tec9',
  'ump-45': 'ump45',
  'usp-s': 'usp',
  xm1014: 'xm1014',
};

try {
  const response = await fetch('./assets-lock.json');
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
  const lock = await response.json();
  const models = lock.files.filter((entry) => entry.kind === 'model');
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas: $('viewport'), antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.3;
  controls.maxDistance = 7;
  const material = new THREE.MeshStandardMaterial({
    color: '#abb5be',
    metalness: 0.4,
    roughness: 0.38,
  });
  scene.add(new THREE.HemisphereLight('#e6efff', '#45433c', 2.6));
  for (const [position, color, intensity] of [
    [[2, 3, 4], '#fff0d6', 5],
    [[-2, 1, -3], '#8dacd9', 4],
    [[0, -2, 1], '#ffffff', 1],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
  let model;
  let requestId = 0;
  const audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.3;
  const stopAudio = () => {
    audio.pause();
    audio.currentTime = 0;
    state.audioPlayed = null;
    if (state.loaded && !state.error) $('message').textContent = '';
  };
  audio.addEventListener('ended', () => {
    if (state.loaded && !state.error) $('message').textContent = '';
  });
  audio.addEventListener('error', () => {
    state.error = 'audio-unavailable';
    $('message').textContent = say(
      'Audio file is unavailable. Run prepare.mjs first.',
      '音频文件不可用，请先运行 prepare.mjs。',
    );
  });
  const reset = () => {
    const distance = 4.1 / Math.min(1, camera.aspect);
    camera.position.set(2.3, 1, 2.4).normalize().multiplyScalar(distance);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  reset();
  const selectModel = async () => {
    const id = ++requestId;
    const entry = models.find((candidate) => candidate.id === $('weapon').value);
    state.selected = entry.id;
    state.loaded = false;
    state.error = null;
    state.audioPlayed = null;
    $('weapon-name').textContent = names[entry.id] ?? entry.id;
    $('message').textContent = say('Loading original geometry…', '正在加载原始模型…');
    audio.pause();
    $('sound').replaceChildren();
    for (const sound of lock.files.filter(
      (item) =>
        item.kind === 'audio' && item.path.startsWith(`sound/weapons/${directories[entry.id]}/`),
    )) {
      $('sound').add(new Option(sound.path.split('/').pop(), sound.path));
    }
    $('play').disabled = $('sound').options.length === 0;
    const preferred = [...$('sound').options].find(
      (option) => /(?:_01|-1|1)\.wav$/.test(option.text) && !/distant|silencer/.test(option.text),
    );
    if (preferred) $('sound').value = preferred.value;
    try {
      const source = await fetch(`./assets/${entry.path}`);
      if (!source.ok) throw new Error(`Model HTTP ${source.status}`);
      const obj = new OBJLoader().parse(await source.text());
      if (id !== requestId) {
        dispose(obj);
        return;
      }
      if (model) {
        scene.remove(model);
        dispose(model);
      }
      let triangles = 0;
      obj.traverse((mesh) => {
        if (mesh.isMesh) {
          const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          old.forEach((item) => item.dispose());
          mesh.material = material;
          triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        }
      });
      const box = new THREE.Box3().setFromObject(obj);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.5 / Math.max(size.x, size.y, size.z);
      obj.position.copy(center).multiplyScalar(-scale);
      obj.scale.setScalar(scale);
      model = new THREE.Group();
      model.add(obj);
      // The supplied OBJ models use the barrel along Z; turn it across the inspection view.
      model.rotation.y = Math.PI / 2;
      scene.add(model);
      reset();
      state.loaded = true;
      state.triangles = triangles;
      $('message').textContent = '';
      $('stats').textContent =
        `${triangles.toLocaleString()} triangles · ${(entry.bytes / 1024).toFixed(0)} KB`;
    } catch (error) {
      if (id !== requestId) return;
      if (model) {
        scene.remove(model);
        dispose(model);
        model = null;
      }
      state.error = String(error);
      $('message').textContent = say(
        'Model unavailable. Run node prepare.mjs and reload.',
        '模型不可用。请运行 node prepare.mjs 后刷新。',
      );
    }
  };
  for (const entry of models) $('weapon').add(new Option(names[entry.id] ?? entry.id, entry.id));
  $('weapon').value = 'ak-47';
  $('weapon').addEventListener('change', selectModel);
  $('stop').addEventListener('click', stopAudio);
  $('sound').addEventListener('change', stopAudio);
  $('play').addEventListener('click', async () => {
    if (!$('sound').value) return;
    audio.pause();
    audio.src = `./assets/${$('sound').value}`;
    try {
      await audio.play();
      state.audioPlayed = $('sound').value;
      state.error = null;
      $('message').textContent = say(
        `Playing ${audio.src.split('/').pop()}`,
        `正在播放 ${audio.src.split('/').pop()}`,
      );
    } catch {
      state.error = 'audio-unavailable';
      $('message').textContent = say(
        'Audio unavailable or playback blocked.',
        '音频不可用或播放被浏览器阻止。',
      );
    }
  });
  $('wireframe').addEventListener('change', () => {
    material.wireframe = $('wireframe').checked;
  });
  $('reset').addEventListener('click', reset);
  $('theme').addEventListener('click', () => document.documentElement.classList.toggle('light'));
  $('language').addEventListener('click', () => {
    locale = locale === 'en' ? 'zh' : 'en';
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    document.querySelectorAll('[data-en]').forEach((node) => {
      node.textContent = node.dataset[locale];
    });
    $('language').textContent = locale === 'en' ? '中文' : 'English';
    document.title = say('CS:GO asset inspection', 'CS:GO 素材检查');
    $('viewport').setAttribute(
      'aria-label',
      say('Interactive 3D weapon model', '交互式 3D 武器模型'),
    );
    if (state.loaded && !state.error) $('message').textContent = '';
  });
  const observer = new ResizeObserver(() => {
    const { width, height } = $('viewport').parentElement.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    reset();
  });
  observer.observe($('viewport').parentElement);
  const render = () => {
    controls.update();
    scene.background = new THREE.Color(
      document.documentElement.classList.contains('light') ? '#e6e6e0' : '#171b20',
    );
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(render);
  window.advanceTime = () => render();
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : render);
    if (document.hidden) audio.pause();
  });
  window.addEventListener(
    'pagehide',
    () => {
      audio.pause();
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      if (model) dispose(model);
      material.dispose();
      renderer.dispose();
    },
    { once: true },
  );
  await selectModel();
} catch (error) {
  state.error = String(error);
  $('message').textContent = say(
    'Inspection could not start. Check WebGL, the manifest, and network access.',
    '无法启动素材检查。请检查 WebGL、素材清单及网络连接。',
  );
}
