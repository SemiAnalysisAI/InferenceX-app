import * as THREE from 'three';
import { decodeRgbExp } from './lightmap-data.mjs';

async function uncompressed(path) {
  const response = await fetch(path);
  if (!response.ok || !response.body) throw new Error(`Missing baked lighting: ${path}`);
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export async function loadWorldLighting() {
  const response = await fetch('lighting/world.json');
  if (!response.ok) throw new Error('Missing baked-lighting metadata');
  const metadata = await response.json();
  const [geometryBytes, textureBytes] = await Promise.all([
    uncompressed('lighting/world.bin.gz'),
    uncompressed('lighting/atlas.rgbe.gz'),
  ]);
  const values = new Float32Array(geometryBytes);
  if (
    values.length !== metadata.vertices * 7 ||
    textureBytes.byteLength !== metadata.atlasWidth * metadata.atlasHeight * 4
  ) {
    throw new Error('Baked-lighting data length mismatch');
  }
  const pixels = decodeRgbExp(
    new Uint8Array(textureBytes),
    new Uint16Array(textureBytes.byteLength),
    THREE.DataUtils.toHalfFloat,
  );
  const texture = new THREE.DataTexture(
    pixels,
    metadata.atlasWidth,
    metadata.atlasHeight,
    THREE.RGBAFormat,
    THREE.HalfFloatType,
  );
  texture.channel = 1;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const geometries = new Map();
  for (const group of metadata.groups) {
    const geometry = new THREE.BufferGeometry();
    const data = new THREE.InterleavedBuffer(
      values.slice(group.offset * 7, (group.offset + group.count) * 7),
      7,
    );
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));
    geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(data, 2, 3));
    geometry.setAttribute('uv1', new THREE.InterleavedBufferAttribute(data, 2, 5));
    geometry.computeBoundingSphere();
    geometries.set(group.material, geometry);
  }
  return { texture, geometries, metadata };
}
export function isWorldBrush(object) {
  for (let node = object; node; node = node.parent) {
    if (node.name === 'world_geometry') return true;
  }
  return false;
}
