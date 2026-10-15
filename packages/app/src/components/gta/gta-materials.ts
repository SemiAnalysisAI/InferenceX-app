import * as T from 'three';

// Physically based city materials. Surface albedo comes from CC0 Poly Haven
// scans; windows, lane markings and crosswalks are procedural so they stay
// crisp at any distance and never repeat visibly.

export const TEXTURES = [
  'asphalt',
  'asphalt_n',
  'pavement',
  'pavement_n',
  'grass',
  'hills',
  'sand',
  'yard',
  'stucco',
  'brick',
  'brick_n',
  'siding',
  'siding_n',
  'concrete',
  'concrete_n',
  'water_n',
  'leaf',
] as const;
export type TextureName = (typeof TEXTURES)[number];
export type TextureSet = Record<TextureName, T.Texture>;

export async function loadTextures(
  base: string,
  signal: AbortSignal,
  anisotropy: number,
): Promise<TextureSet> {
  const out = {} as TextureSet;
  await Promise.all(
    TEXTURES.map(async (name) => {
      const response = await fetch(`${base}tex/${name}.${name === 'leaf' ? 'png' : 'jpg'}`, {
        signal,
      });
      if (!response.ok) throw new Error(`Unable to load texture ${name}`);
      const bitmap = await createImageBitmap(await response.blob(), {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
      });
      const t = new T.Texture(bitmap);
      t.wrapT = T.RepeatWrapping;
      t.wrapS = t.wrapT;
      t.anisotropy = anisotropy;
      t.colorSpace = name.endsWith('_n') ? T.NoColorSpace : T.SRGBColorSpace;
      t.generateMipmaps = true;
      t.minFilter = T.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      out[name] = t;
    }),
  );
  return out;
}

/** Shared uniforms updated once per frame. */
export const SHARED = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uWet: { value: 0 },
};

const NOISE = /* glsl */ `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1, 0)), u.x), mix(gHash(i + vec2(0, 1)), gHash(i + vec2(1, 1)), u.x), u.y);
}
float gFbm(vec2 p) { return gNoise(p) * 0.55 + gNoise(p * 2.3) * 0.3 + gNoise(p * 5.1) * 0.15; }
`;

function worldVarying(shader: T.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
    .replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      vW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #ifdef USE_INSTANCING
        vW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #endif`,
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\nvarying vec3 vW;\n${NOISE}`,
  );
}

/** Terrain: blends ground classes from the 4 m OSM land-cover raster. */
export function terrainMaterial(
  tex: TextureSet,
  ground: T.DataTexture,
  bounds: { x0: number; z0: number; res: number; width: number; height: number },
) {
  const m = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tGround: { value: ground },
      uGround: {
        value: new T.Vector4(bounds.x0, bounds.z0, bounds.res, 0),
      },
      uGroundSize: { value: new T.Vector2(bounds.width, bounds.height) },
      tGrass: { value: tex.grass },
      tHills: { value: tex.hills },
      tSand: { value: tex.sand },
      tYard: { value: tex.yard },
      tPave: { value: tex.pavement },
      tAsph: { value: tex.asphalt },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tGround, tGrass, tHills, tSand, tYard, tPave, tAsph;
        uniform vec4 uGround; uniform vec2 uGroundSize;
        float gClass(vec2 cell) {
          return floor(texture2D(tGround, (cell + 0.5) / uGroundSize).r * 255.0 + 0.5);
        }
        vec4 gAlbedo(float c, vec2 p) {
          // rgb albedo, a roughness
          if (c < 0.5) {
            vec3 y = texture2D(tYard, p / 5.0).rgb;
            vec3 d = texture2D(tSand, p / 7.0).rgb * vec3(0.62, 0.56, 0.5);
            return vec4(mix(y * vec3(0.78, 0.86, 0.66), d, gNoise(p / 23.0) * 0.6), 0.95);
          }
          if (c < 1.5) return vec4(texture2D(tGrass, p / 7.0).rgb * vec3(0.72, 1.02, 0.62), 0.95);
          if (c < 2.5) return vec4(texture2D(tSand, p / 6.0).rgb * 1.08, 0.97);
          if (c < 3.5) return vec4(texture2D(tSand, p / 9.0).rgb * vec3(0.32, 0.36, 0.34), 0.6);
          if (c < 4.5) return vec4(texture2D(tAsph, p / 6.0).rgb * vec3(1.05, 1.02, 0.98), 0.85);
          if (c < 5.5) return vec4(texture2D(tHills, p / 45.0).rgb * vec3(1.08, 0.98, 0.78), 0.97);
          if (c < 6.5) return vec4(texture2D(tGrass, p / 9.0).rgb * vec3(0.42, 0.55, 0.36), 0.97);
          if (c < 7.5) return vec4(texture2D(tPave, p / 2.4).rgb * 1.1, 0.8);
          if (c < 8.5) return vec4(texture2D(tAsph, p / 5.0).rgb * 0.92, 0.82);
          return vec4(texture2D(tPave, p / 1.8).rgb * vec3(1.06, 1.04, 1.0), 0.82);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 gp = (vW.xz - uGround.xy) / uGround.z - 0.5;
        gp += (vec2(gNoise(vW.xz / 3.1), gNoise(vW.zx / 2.7)) - 0.5) * 0.9;
        vec2 gb = floor(gp), gf = fract(gp);
        float c00 = gClass(gb), c10 = gClass(gb + vec2(1, 0)), c01 = gClass(gb + vec2(0, 1)), c11 = gClass(gb + vec2(1, 1));
        vec4 a00 = gAlbedo(c00, vW.xz);
        vec4 acc = a00;
        if (c10 != c00 || c01 != c00 || c11 != c00) {
          vec2 w = smoothstep(0.0, 1.0, gf);
          acc = mix(mix(a00, gAlbedo(c10, vW.xz), w.x), mix(gAlbedo(c01, vW.xz), gAlbedo(c11, vW.xz), w.x), w.y);
        }
        float macro = 0.82 + 0.36 * gFbm(vW.xz / 160.0);
        diffuseColor.rgb = acc.rgb * macro;
        float gRough = acc.a;
        `,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;');
    worldVarying(shader);
  };
  m.customProgramCacheKey = () => 'gta-terrain';
  return m;
}

/**
 * Roads. Attributes: uv (across 0..1, along metres), aRoad (width, lanes,
 * style, oneway), aJunction (signed distance to nearest junction, clear radius).
 */
export function roadMaterial(tex: TextureSet) {
  const m = new T.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    metalness: 0,
    normalMap: tex.asphalt_n,
    normalScale: new T.Vector2(0.6, 0.6),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tAsph: { value: tex.asphalt },
      tPave: { value: tex.pavement },
      uWet: SHARED.uWet,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aRoad; attribute vec2 aJunction;
        varying vec4 vRoad; varying vec2 vJunction; varying vec2 vRUv;`,
      )
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\nvRoad = aRoad; vJunction = aJunction; vRUv = uv;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tAsph, tPave; uniform float uWet;
        varying vec4 vRoad; varying vec2 vJunction; varying vec2 vRUv;
        float gFw = 0.03;
        float line(float x, float c, float w) { return (1.0 - smoothstep(w * 0.5 - gFw, w * 0.5 + gFw, abs(x - c))) * min(1.0, w / max(w, gFw * 2.5)); }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        float W = vRoad.x, lanes = vRoad.y, style = vRoad.z;
        float across = vRUv.x * W;           // metres from left edge
        gFw = max(0.015, fwidth(across) * 0.8);
        float along = vRUv.y;
        vec3 asph = texture2D(tAsph, vW.xz / 6.0).rgb;
        asph *= 0.78 + 0.32 * gFbm(vW.xz / 37.0);
        // Darker oily strips where tyres run in each lane.
        float laneW = W / max(1.0, lanes);
        float inLane = fract(across / laneW);
        float tracks = smoothstep(0.12, 0.0, abs(inLane - 0.3)) + smoothstep(0.12, 0.0, abs(inLane - 0.7));
        asph *= 1.0 - tracks * 0.1;
        vec3 col = asph;
        float paint = 0.0; vec3 paintCol = vec3(0.9);
        float clear = vJunction.x * sign(vJunction.x) - vJunction.y;
        float wear = 0.55 + 0.45 * gNoise(vW.xz * 1.7);
        if (style > 4.5) {
          // Pedestrian streets and paths use concrete pavers.
          col = texture2D(tPave, vW.xz / 2.2).rgb * (style > 5.5 ? 0.95 : 1.12);
        } else if (clear > 0.0) {
          if (style < 0.5 || style > 2.5 && style < 3.5) {
            if (style < 0.5) {
              // Double yellow centre line.
              paint = max(line(across, W * 0.5 - 0.12, 0.11), line(across, W * 0.5 + 0.12, 0.11));
              paintCol = vec3(0.92, 0.72, 0.18);
            }
            // Dashed white lane dividers.
            float halfL = style < 0.5 ? floor(lanes / 2.0) : lanes;
            for (int i = 1; i < 4; i++) {
              float k = float(i);
              if (style < 0.5) {
                if (k < halfL) {
                  float dash = step(fract(along / 12.0), 0.25);
                  paint = max(paint, line(across, W * 0.5 - k * laneW, 0.14) * dash);
                  paint = max(paint, line(across, W * 0.5 + k * laneW, 0.14) * dash);
                }
              } else if (k < lanes) {
                paint = max(paint, line(across, k * laneW, 0.14) * step(fract(along / 12.0), 0.3));
              }
            }
            if (style > 2.5) paint = max(paint, max(line(across, 0.35, 0.15), line(across, W - 0.35, 0.15)));
          } else if (style > 0.5 && style < 1.5) {
            for (int i = 1; i < 4; i++) {
              float k = float(i);
              if (k < lanes) paint = max(paint, line(across, k * laneW, 0.14) * step(fract(along / 12.0), 0.25));
            }
          }
          // Continental crosswalk just outside the junction box, and a stop line.
          if (style < 3.5 && style != 4.0) {
            float cw = step(clear, 3.4) * step(0.4, clear);
            float bars = step(0.5, fract(across / 1.1 + 0.25));
            paint = max(paint, cw * bars * step(0.5, across) * step(across, W - 0.5));
            float stop = step(3.9, clear) * step(clear, 4.35);
            float rightHalf = vJunction.x > 0.0 ? step(W * 0.5, across) : step(across, W * 0.5);
            paint = max(paint, stop * rightHalf);
          }
        }
        col = mix(col, paintCol, paint * wear * 0.92);
        diffuseColor.rgb = col;
        float rRough = mix(0.88, 0.55, paint) * (1.0 - uWet * 0.6);
        `,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = rRough;');
    worldVarying(shader);
  };
  m.customProgramCacheKey = () => 'gta-road';
  return m;
}

/** Raised concrete sidewalks and curbs; world-projected pavement texture. */
export function sidewalkMaterial(tex: TextureSet) {
  const m = new T.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.82,
    normalMap: tex.pavement_n,
    normalScale: new T.Vector2(0.7, 0.7),
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.tPave = { value: tex.pavement };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tPave;')
      .replace(
        '#include <map_fragment>',
        `vec3 pv = texture2D(tPave, vW.xz / 1.8).rgb;
         if (abs(vNormal.y) < 0.5) pv = texture2D(tPave, vec2(vW.x + vW.z, vW.y) / 1.8).rgb * 0.85;
         diffuseColor.rgb = pv * (0.92 + 0.16 * gNoise(vW.xz / 9.0)) * vec3(1.05, 1.03, 1.0);`,
      );
    worldVarying(shader);
  };
  m.customProgramCacheKey = () => 'gta-sidewalk';
  return m;
}

/**
 * Building facades. Attributes: uv (metres along the wall segment, metres above base),
 * aB (segment length, style, seed, building height), color (base paint).
 * Styles: 0 Victorian / Edwardian, 1 masonry commercial, 2 glass tower,
 * 3 warehouse / pier shed, 4 civic stone, 5 office campus, 6 concrete mid-rise,
 * 7 bay window, 8 trim. Style + 20 marks a roof.
 */
export function buildingMaterial(tex: TextureSet) {
  const m = new T.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
    envMapIntensity: 0.75,
  });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tStucco: { value: tex.stucco },
      tBrick: { value: tex.brick },
      tSiding: { value: tex.siding },
      tConcrete: { value: tex.concrete },
      uNight: SHARED.uNight,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aB; varying vec4 vB; varying vec2 vBUv;',
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvB = aB; vBUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tStucco, tBrick, tSiding, tConcrete; uniform float uNight;
        varying vec4 vB; varying vec2 vBUv;
        float box(vec2 p, vec2 lo, vec2 hi) { vec2 s = step(lo, p) * step(p, hi); return s.x * s.y; }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        float style = vB.y, seed = vB.z, H = vB.w, segLen = vB.x;
        float u = vBUv.x, v = vBUv.y;
        vec3 base = vColor.rgb;
        float bRough = 0.88, bMetal = 0.0;
        vec3 bEmit = vec3(0.0);
        if (style > 19.5) {
          // Roof: tar and gravel with drainage stains.
          vec3 r = texture2D(tConcrete, vW.xz / 7.0).rgb * vec3(0.48, 0.47, 0.46);
          r *= 0.75 + 0.4 * gFbm(vW.xz / 6.0);
          if (style > 22.5 && style < 23.5) r = texture2D(tConcrete, vW.xz / 4.0).rgb * vec3(0.55, 0.52, 0.5);
          if (style > 20.5 && style < 21.5 && seed > 0.5) r = mix(r, vec3(0.62, 0.64, 0.66), 0.5);
          if (style < 20.5 && seed > 0.65) r = mix(r, vec3(0.42, 0.3, 0.26), 0.6);
          diffuseColor.rgb = r;
          bRough = 0.95;
        } else {
          float st = style;
          // Many downtown towers are stone or precast, not all-glass.
          if (st > 1.5 && st < 2.5 && seed < 0.42) st = seed < 0.2 ? 4.0 : 5.0;
          float fh = st < 0.5 ? 3.4 : st < 1.5 ? 3.9 : st < 2.5 ? 4.0 : st < 3.5 ? 6.0 : st < 4.5 ? 5.0 : st < 5.5 ? 4.2 : st < 6.5 ? 3.6 : 3.3;
          float sp = st < 0.5 ? 2.3 : st < 1.5 ? 2.9 : st < 2.5 ? 1.55 : st < 3.5 ? 7.0 : st < 4.5 ? 3.6 : st < 5.5 ? 1.8 : st < 6.5 ? 2.4 : 1.05;
          float ground = (st > 0.5 && st < 1.5 || st > 5.5 && st < 6.5) && H > 7.0 ? 4.6 : 0.0;
          // Wall material per style.
          vec3 wall;
          vec2 wuv = vec2(u, v);
          if (st < 0.5 || st > 6.5) wall = texture2D(tSiding, wuv / 2.5).rgb * 1.6;
          else if (st < 1.5) wall = seed > 0.55 ? texture2D(tBrick, wuv / 2.2).rgb * 1.05 : texture2D(tStucco, wuv / 3.0).rgb * 2.0;
          else if (st < 3.5) wall = texture2D(tConcrete, wuv / 4.0).rgb * 1.25;
          else if (st < 4.5) wall = texture2D(tConcrete, wuv / 3.0).rgb * vec3(1.5, 1.45, 1.35);
          else wall = texture2D(tConcrete, wuv / 3.0).rgb * 1.4;
          float lum = dot(wall, vec3(0.333));
          wall = mix(vec3(lum), wall, st > 0.5 && st < 1.5 && seed > 0.55 ? 1.0 : 0.35);
          wall *= base * 1.25;
          // Weathering: vertical rain streaks and darker base.
          float streak = gNoise(vec2(u * 0.9 + seed * 50.0, v * 0.05));
          wall *= 0.86 + 0.18 * streak;
          wall *= mix(0.72, 1.0, smoothstep(0.0, 2.2, v));
          // Window grid centred on each wall segment.
          float cols = max(1.0, floor((segLen - 0.8) / sp));
          float off = (segLen - cols * sp) * 0.5;
          float cu = (u - off) / sp;
          float col = floor(cu);
          float fu = fract(cu);
          float vv = v - ground;
          float row = floor(vv / fh);
          float fv = fract(vv / fh);
          float inCols = step(0.0, cu) * step(cu, cols);
          float win = 0.0, frame = 0.0;
          float topBand = step(H - 0.9, v);
          if (st > 1.5 && st < 2.5) {
            // Curtain wall: glass with thin mullions and spandrel bands.
            float mull = smoothstep(0.03, 0.0, abs(fu - 0.5) - 0.47);
            float spandrel = step(seed > 0.7 ? 0.62 : 0.74, fract(v / fh));
            float fin = step(0.92, fract(u / (sp * 2.0))) * step(0.82, seed);
            mull = max(mull, fin);
            win = (1.0 - spandrel) * (1.0 - mull);
            frame = mull + spandrel;
          } else if (st > 2.5 && st < 3.5) {
            win = box(vec2(fu, fv), vec2(0.15, 0.55), vec2(0.85, 0.88)) * inCols;
            // Roll-up doors at street level.
            float door = box(vec2(fu, v), vec2(0.2, 0.0), vec2(0.8, 4.2)) * step(0.5, gHash(vec2(col, seed)));
            if (door > 0.5) { wall = vec3(0.45, 0.46, 0.47) * (0.85 + 0.15 * step(0.5, fract(v * 3.0))); }
          } else {
            float wW = st < 0.5 ? 0.3 : st > 6.5 ? 0.12 : st < 1.5 ? 0.26 : st < 4.5 ? 0.28 : 0.18;
            float wTop = st < 0.5 ? 0.86 : 0.82;
            float wBot = st < 0.5 ? 0.28 : 0.3;
            win = box(vec2(fu, fv), vec2(wW, wBot), vec2(1.0 - wW, wTop)) * inCols;
            frame = box(vec2(fu, fv), vec2(wW - 0.06, wBot - 0.05), vec2(1.06 - wW, wTop + 0.04)) * inCols - win;
            // Sill shadow below each window.
            wall *= 1.0 - box(vec2(fu, fv), vec2(wW - 0.06, wBot - 0.09), vec2(1.06 - wW, wBot - 0.04)) * inCols * 0.35;
          }
          win *= step(0.0, vv) * (1.0 - topBand);
          frame *= step(0.0, vv) * (1.0 - topBand);
          // Street-level storefronts.
          float shop = 0.0;
          if (ground > 0.0 && v < ground) {
            float su = fract(u / 3.2);
            float pane = box(vec2(su, v), vec2(0.06, 0.45), vec2(0.94, 3.55));
            shop = pane;
            float awn = box(vec2(su, v), vec2(0.0, 3.7), vec2(1.0, 4.25)) * step(0.45, gHash(vec2(floor(u / 9.0), seed)));
            vec3 awnCol = vec3(0.35 + 0.5 * gHash(vec2(seed, 1.0)), 0.18 + 0.3 * gHash(vec2(seed, 2.0)), 0.15 + 0.3 * gHash(vec2(seed, 3.0)));
            wall = mix(wall, awnCol, awn);
            win = 0.0; frame = 0.0;
          }
          // Cornice band at the top of masonry and Victorian walls.
          if (st < 1.5 || st > 6.5) wall = mix(wall, base * 1.35 + 0.08, topBand * 0.8);
          vec3 frameCol = st < 0.5 || st > 6.5 ? vec3(0.92, 0.9, 0.86) : st > 1.5 && st < 2.5 ? mix(vec3(0.3, 0.32, 0.34), base * 0.9 + 0.1, step(0.55, seed)) : base * 0.6;
          // Glass: dark interior with reflections from the environment map.
          float rnd = gHash(vec2(col + seed * 91.0, row + seed * 17.0));
          vec3 tint = seed > 0.86 ? vec3(0.2, 0.16, 0.12) : seed > 0.72 ? vec3(0.12, 0.18, 0.16) : seed > 0.58 ? vec3(0.13, 0.15, 0.17) : vec3(0.1, 0.13, 0.17);
          vec3 glass = st > 1.5 && st < 2.5 ? tint * (0.75 + 0.5 * gHash(vec2(row * 0.37 + col * 0.11, seed))) : vec3(0.04, 0.045, 0.05) + rnd * 0.05;
          float glassMask = max(win, shop);
          vec3 c = mix(wall, frameCol, clamp(frame, 0.0, 1.0));
          c = mix(c, glass, glassMask);
          diffuseColor.rgb = c;
          bRough = mix(mix(0.9, 0.55, clamp(frame, 0.0, 1.0)), st > 1.5 && st < 2.5 ? 0.14 : 0.08, glassMask);
          bMetal = glassMask * (st > 1.5 && st < 2.5 ? 0.4 : 0.25);
          // Lit rooms at night (and some interiors visible by day).
          float lit = step(rnd, mix(0.12, 0.62, uNight)) * glassMask;
          vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.92, 1.0), step(0.6, gHash(vec2(row, col + seed))));
          bEmit = warm * lit * (0.12 + uNight * (1.4 + 1.6 * gHash(vec2(col, row * 3.0 + seed)))) + shop * uNight * vec3(1.2, 0.95, 0.7);
        }
        `,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bEmit;',
      );
    worldVarying(shader);
  };
  m.customProgramCacheKey = () => 'gta-building';
  return m;
}

/** Bay water: animated scrolling normals with environment reflections. */
export function waterMaterial(tex: TextureSet) {
  const n = tex.water_n;
  const m = new T.MeshStandardMaterial({
    color: '#22383b',
    roughness: 0.16,
    metalness: 0,
    normalMap: n,
    normalScale: new T.Vector2(0.35, 0.35),
    envMapIntensity: 1.25,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        `
        vec3 n1 = texture2D(normalMap, vW.xz / 38.0 + vec2(uTime * 0.012, uTime * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vW.xz / 13.0 - vec2(uTime * 0.017, -uTime * 0.011)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(normalMap, vW.xz / 160.0 + vec2(-uTime * 0.004, uTime * 0.003)).xyz * 2.0 - 1.0;
        float wFade = 1.0 - smoothstep(40.0, 450.0, length(vW - cameraPosition));
        vec3 wn = normalize(vec3((n1.xy * (0.4 + 0.6 * wFade) + n2.xy * wFade) * normalScale + n3.xy * 0.25, 1.0));
        normal = normalize((viewMatrix * vec4(wn.x, wn.z, -wn.y, 0.0)).xyz);
        `,
      );
    worldVarying(shader);
  };
  m.customProgramCacheKey = () => 'gta-water';
  return m;
}
