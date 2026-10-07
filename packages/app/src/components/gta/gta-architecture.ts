import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FOOTPRINTS } from './gta-geography';

type Building = (typeof FOOTPRINTS)[number];
interface Part {
  geometry: T.BufferGeometry;
  material: T.Material | T.Material[];
  matrix: T.Matrix4;
}
export const ARCHITECTURE_ASSET_COUNT = 11;
export async function loadArchitecture(
  root: T.Group,
  base: string,
  signal: AbortSignal,
  onAsset: () => void = () => {},
) {
  const sources: T.Group[] = [];
  const loader = new GLTFLoader();
  for (const name of [
    'modular_urban_apartments_facade',
    'modular_factory_facade',
    'modular_fire_escape',
  ]) {
    const response = await fetch(`${base}${name}.glb`, { signal });
    if (!response.ok) throw new Error(`Architecture: ${response.status}`);
    const gltf = await loader.parseAsync(await response.arrayBuffer(), base);
    gltf.scene.visible = false;
    root.add(gltf.scene);
    signal.throwIfAborted();
    sources.push(gltf.scene);
    onAsset();
  }
  const response = await fetch(`${base}urban_street_04_1k.hdr`, { signal });
  if (!response.ok) throw new Error(`Environment: ${response.status}`);
  const hdr = new RGBELoader().parse(await response.arrayBuffer());
  signal.throwIfAborted();
  const environment = new T.DataTexture(hdr.data, hdr.width, hdr.height, T.RGBAFormat, hdr.type);
  environment.mapping = T.EquirectangularReflectionMapping;
  environment.needsUpdate = true;
  onAsset();
  const textures: T.Texture[] = [];
  try {
    for (const name of [
      'asphalt-Diffuse',
      'asphalt-nor_gl',
      'asphalt-Rough',
      'facade-apartment',
      'facade-factory',
      'facade-glass',
      'jacaranda-canopy.webp',
    ]) {
      const r = await fetch(`${base}${name.includes('.') ? name : `${name}.jpg`}`, { signal });
      if (!r.ok) throw new Error(`Road texture: ${r.status}`);
      const bitmap = await createImageBitmap(await r.blob(), { imageOrientation: 'flipY' });
      const texture = new T.Texture(bitmap);
      texture.needsUpdate = true;
      texture.wrapS = T.RepeatWrapping;
      texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = 4;
      textures.push(texture);
      signal.throwIfAborted();
      onAsset();
    }
  } catch (error) {
    environment.dispose();
    textures.forEach((t) => {
      (t.image as ImageBitmap).close();
      t.dispose();
    });
    throw error;
  }
  textures[0].colorSpace = T.SRGBColorSpace;
  textures.slice(3, 6).forEach((t) => {
    t.colorSpace = T.SRGBColorSpace;
    t.repeat.set(1 / 3.1, 1 / 3.4);
  });
  textures[6].colorSpace = T.SRGBColorSpace;
  textures[6].wrapS = T.ClampToEdgeWrapping;
  textures[6].wrapT = T.ClampToEdgeWrapping;
  const asphalt = new T.MeshStandardMaterial({
    map: textures[0],
    normalMap: textures[1],
    roughnessMap: textures[2],
    roughness: 0.9,
    normalScale: new T.Vector2(0.6, 0.6),
  });
  const nearIds = { value: new Float32Array(6).fill(-1) };
  const nearHeights = { value: new Float32Array(6) };
  const facadeMaterials = ['#ffffff', '#ffffff', '#e3edf0', '#d4d0ca'].map((color, i) => {
    const m = new T.MeshStandardMaterial({
      color,
      map: textures[i === 2 ? 5 : 3 + (i % 2)],
      roughness: i === 2 ? 0.4 : 0.85,
      metalness: i === 2 ? 0.2 : 0.02,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.nearIds = nearIds;
      shader.uniforms.nearHeights = nearHeights;
      shader.vertexShader =
        `attribute float cityBuilding; varying float cityId; varying vec3 cityPosition; varying vec3 cityNormal;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\ncityPosition=position;cityNormal=normal;cityId=cityBuilding;',
        );
      shader.fragmentShader =
        `uniform float nearIds[6];uniform float nearHeights[6];varying float cityId;varying vec3 cityPosition; varying vec3 cityNormal;\n${shader.fragmentShader}`.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          for(int i=0;i<6;i++) {
            if(abs(cityId-nearIds[i])<0.1&&abs(cityNormal.y)<0.5&&cityPosition.y<nearHeights[i])discard;
          }
          if(abs(cityNormal.y)>0.8)diffuseColor.rgb=vec3(0.18,0.20,0.19);
        `,
        );
    };
    return m;
  });
  const cache = new Map<string, Part[]>();
  function parts(kit: number, name: string) {
    const key = `${kit}:${name}`;
    if (cache.has(key)) return cache.get(key)!;
    const source = sources[kit].getObjectByName(name);
    if (!source) throw new Error(`Missing architecture piece: ${name}`);
    const copy = source.clone(true);
    copy.position.set(0, 0, 0);
    copy.updateMatrixWorld(true);
    const result: Part[] = [];
    copy.traverse((n) => {
      const m = n as T.Mesh;
      if (m.isMesh)
        result.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone() });
    });
    cache.set(key, result);
    return result;
  }
  function detailed(b: Building) {
    const group = new T.Group();
    const batches = new Map<string, { part: Part; matrices: T.Matrix4[] }>();
    function piece(
      kit: number,
      name: string,
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx = 1,
      sy = 1,
    ) {
      const placement = new T.Matrix4().compose(
        new T.Vector3(x, y, z),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        new T.Vector3(sx, sy, 1),
      );
      for (const part of parts(kit, name)) {
        const material = Array.isArray(part.material) ? part.material : [part.material];
        const key = `${part.geometry.uuid}:${material.map((m) => m.uuid).join(':')}`;
        if (!batches.has(key)) batches.set(key, { part, matrices: [] });
        batches.get(key)!.matrices.push(placement.clone().multiply(part.matrix));
      }
    }
    const ring = [...b.ring];
    const area = ring.reduce(
      (n, p, i) => n + p.x * ring[(i + 1) % ring.length].z - ring[(i + 1) % ring.length].x * p.z,
      0,
    );
    if (area > 0) ring.reverse();
    const kit = b.style % 2;
    const floors = Math.max(1, Math.min(4, Math.floor(b.h / 3.4)));
    const glass = new T.MeshStandardMaterial({
      color: '#496773',
      metalness: 0.72,
      roughness: 0.17,
      envMapIntensity: 1.2,
    });
    const mullion = new T.MeshStandardMaterial({
      color: '#737b7b',
      metalness: 0.65,
      roughness: 0.4,
    });
    const glassGeometry = new T.PlaneGeometry(1, 1);
    const frameGeometry = new T.BoxGeometry(1, 1, 1);
    const glassMatrices: T.Matrix4[] = [];
    const frameMatrices: T.Matrix4[] = [];
    function glassPiece(
      x: number,
      y: number,
      z: number,
      yaw: number,
      w: number,
      h: number,
      frame = false,
    ) {
      const matrix = new T.Matrix4().compose(
        new T.Vector3(x, y, z),
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        new T.Vector3(w, h, frame ? 0.12 : 1),
      );
      (frame ? frameMatrices : glassMatrices).push(matrix);
    }
    for (let edge = 0; edge < ring.length; edge++) {
      const a = ring[edge],
        c = ring[(edge + 1) % ring.length];
      const dx = c.x - a.x,
        dz = c.z - a.z,
        length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const columns = Math.max(1, Math.round(length / 3.1)),
        yaw = Math.atan2(-dz, dx);
      for (let column = 0; column < columns; column++) {
        const t = (column + 1) / columns,
          x = a.x + dx * t - (dz / length) * 0.35,
          z = a.z + dz * t + (dx / length) * 0.35;
        if (b.h > 45 || b.id.startsWith('south-')) {
          const width = length / columns;
          const midX = x - dx / columns / 2,
            midZ = z - dz / columns / 2;
          for (let floor = 0; floor < floors; floor++) {
            glassPiece(midX, 0.3 + floor * 3.4 + 1.7, midZ, yaw, width - 0.1, 3.25);
            glassPiece(midX, 0.3 + floor * 3.4, midZ, yaw, width, 0.13, true);
          }
          glassPiece(x, 0.3 + floors * 1.7, z, yaw, 0.09, floors * 3.4, true);
          continue;
        }
        for (let floor = 0; floor < floors; floor++) {
          const door = floor === 0 && column === Math.floor(columns / 2);
          piece(
            kit,
            door ? 'wall_door_centered_large_01' : 'wall_window_centered_large_01',
            x,
            floor * 3.4 + 0.3,
            z,
            yaw,
            length / columns / 3,
            3.4 / 3,
          );
          piece(
            kit,
            door ? 'door_centered_large_01' : 'window_centered_large_01',
            x,
            floor * 3.4 + 0.3 + (kit === 0 && !door ? 0.5 : 0),
            z,
            yaw,
            length / columns / 3,
            3.4 / 3,
          );
        }
        if (b.h < 24)
          piece(kit, 'crown_standard_standard_01', x, b.h, z, yaw, length / columns / 3);
      }
      if (
        edge === 0 &&
        b.style % 3 === 0 &&
        length > 8 &&
        b.h <= 45 &&
        !b.id.startsWith('south-')
      ) {
        for (let floor = 1; floor < floors; floor++) {
          const x = (a.x + c.x) / 2 - dz / length,
            z = (a.z + c.z) / 2 + dx / length;
          piece(2, 'modular_fire_escape_platform_middle', x, floor * 3.4, z, yaw);
          if (floor > 1) piece(2, 'modular_fire_escape_stairs', x, floor * 3.4 - 1.3, z, yaw);
        }
      }
    }
    for (const [geometry, material, matrices] of [
      [glassGeometry, glass, glassMatrices],
      [frameGeometry, mullion, frameMatrices],
    ] as const) {
      if (matrices.length === 0) {
        geometry.dispose();
        material.dispose();
        continue;
      }
      const mesh = new T.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.ownedGeometry = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    for (const { part, matrices } of batches.values()) {
      const mesh = new T.InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }
  const entries: { b: Building; id: number; detail?: T.Group }[] = [];
  const farBatches = new Map<string, { geometries: T.BufferGeometry[]; material: T.Material }>();
  const previous = new T.Vector3(Infinity, 0, Infinity);
  return {
    environment,
    asphalt,
    foliage: textures[6],
    building(b: Building) {
      const shape = new T.Shape(b.ring.map((p) => new T.Vector2(p.x, -p.z)));
      const geometry = new T.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false, steps: 1 });
      geometry.rotateX(-Math.PI / 2);
      const positions = geometry.attributes.position,
        normals = geometry.attributes.normal,
        uv = geometry.attributes.uv;
      for (let v = 0; v < positions.count; v++)
        uv.setXY(
          v,
          -positions.getX(v) * normals.getZ(v) + positions.getZ(v) * normals.getX(v),
          positions.getY(v) - 0.3,
        );
      const id = entries.length + 1;
      geometry.setAttribute(
        'cityBuilding',
        new T.BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(id), 1),
      );
      geometry.clearGroups();
      const style = b.h > 45 || b.id.startsWith('south-') ? 2 : b.style % 4,
        key = `${Math.floor(b.x / 180)}:${Math.floor(b.z / 180)}:${style}`;
      if (!farBatches.has(key))
        farBatches.set(key, { geometries: [], material: facadeMaterials[style] });
      farBatches.get(key)!.geometries.push(geometry);
      entries.push({ b, id });
      return b.h;
    },
    update(camera: T.Camera) {
      if (previous.distanceToSquared(camera.position) < 4) return;
      previous.copy(camera.position);
      const nearest = entries
        .filter((e) => e.b.ring.length < 30)
        .map((e) => ({ e, d: Math.hypot(e.b.x - camera.position.x, e.b.z - camera.position.z) }))
        .filter((e) => e.d < 90 && camera.position.y < 100)
        .sort((a, b) => a.d - b.d)
        .slice(0, 6)
        .map((e) => e.e);
      nearIds.value.fill(-1);
      nearHeights.value.fill(0);
      nearest.forEach((e, i) => {
        nearIds.value[i] = e.id;
        nearHeights.value[i] = Math.max(1, Math.min(4, Math.floor(e.b.h / 3.4))) * 3.4 + 0.3;
      });
      for (const e of entries) {
        const visible = nearest.includes(e);
        if (visible && !e.detail) {
          e.detail = detailed(e.b);
          root.add(e.detail);
        }
        if (e.detail) e.detail.visible = visible;
      }
      // Retain only the nearby meshes; the shared source geometry stays resident.
      for (const e of entries)
        if (e.detail && !e.detail.visible) {
          e.detail.traverse((n) => {
            const mesh = n as T.InstancedMesh;
            if (mesh.isInstancedMesh) mesh.dispose();
            if (mesh.userData.ownedGeometry) {
              mesh.geometry.dispose();
              (mesh.material as T.Material).dispose();
            }
          });
          root.remove(e.detail);
          e.detail = undefined;
        }
    },
    finish() {
      for (const batch of farBatches.values()) {
        const mesh = new T.Mesh(mergeGeometries(batch.geometries), batch.material);
        mesh.name = 'city-far-batch';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        batch.geometries.forEach((g) => g.dispose());
      }
      farBatches.clear();
      root.updateMatrixWorld(true);
    },
  };
}
