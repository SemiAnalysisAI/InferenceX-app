import type { ConfigParams } from './config-cache';
import type { BenchmarkPointBackfill } from './run-overrides';

function singleNodeMtpConfig(
  hardware: string,
  framework: string,
  model: string,
  tp: number,
): ConfigParams {
  return {
    hardware,
    framework,
    model,
    precision: 'fp4',
    specMethod: 'mtp',
    disagg: false,
    isMultinode: false,
    prefillTp: tp,
    prefillEp: 1,
    prefillDpAttn: false,
    prefillNumWorkers: 0,
    decodeTp: tp,
    decodeEp: 1,
    decodeDpAttn: false,
    decodeNumWorkers: 0,
    numPrefillGpu: tp,
    numDecodeGpu: tp,
  };
}

const KIMI3_B300_VLLM = singleNodeMtpConfig('b300', 'vllm', 'kimik3', 8);
const KIMI3_MI355X_ATOM = singleNodeMtpConfig('mi355x', 'atom', 'kimik3', 8);
const KIMI3_MI355X_VLLM = singleNodeMtpConfig('mi355x', 'vllm', 'kimik3', 8);
const MINIMAXM3_MI355X_ATOM = singleNodeMtpConfig('mi355x', 'atom', 'minimaxm3', 4);

interface SpecMethodGroup {
  githubRunId: number;
  runAttempt: number;
  productionConfigId: number;
  config: ConfigParams;
  // [production benchmark ID, concurrency, recipe fingerprint]
  points: readonly (readonly [number, number, string])[];
}

const GROUPS: readonly SpecMethodGroup[] = [
  {
    githubRunId: 31893747354,
    runAttempt: 2,
    productionConfigId: 2182,
    config: KIMI3_B300_VLLM,
    points: [
      [439934, 24, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
      [439940, 32, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
      [439939, 40, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
      [439933, 48, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
      [439942, 56, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
      [439937, 70, '61ba8917bcdef3e354ba09a889270595338d97885bd465fedd01c9dbe7e9beaa'],
    ],
  },
  {
    githubRunId: 32912909255,
    runAttempt: 1,
    productionConfigId: 2409,
    config: KIMI3_MI355X_ATOM,
    points: [
      [440464, 32, '402f9b2bced7bd9126e991d0ff17d3d9199003090549800e1ff3a3cdcefac64c'],
      [440468, 40, '402f9b2bced7bd9126e991d0ff17d3d9199003090549800e1ff3a3cdcefac64c'],
      [440469, 56, '402f9b2bced7bd9126e991d0ff17d3d9199003090549800e1ff3a3cdcefac64c'],
    ],
  },
  {
    githubRunId: 33773561410,
    runAttempt: 2,
    productionConfigId: 2313,
    config: KIMI3_MI355X_VLLM,
    points: [
      [441048, 44, '1648107f8ab5649e500048e1993d61cf456849515ac19d7a36031cb920736022'],
      [441051, 48, '1648107f8ab5649e500048e1993d61cf456849515ac19d7a36031cb920736022'],
      [441047, 52, '1648107f8ab5649e500048e1993d61cf456849515ac19d7a36031cb920736022'],
    ],
  },
  {
    githubRunId: 34332168553,
    runAttempt: 3,
    productionConfigId: 2313,
    config: KIMI3_MI355X_VLLM,
    points: [
      [441370, 44, '3429b37ecba288bab08ac5e07a36fd6501955b170c284f777c45100ccfb0cc85'],
      [441373, 48, '3429b37ecba288bab08ac5e07a36fd6501955b170c284f777c45100ccfb0cc85'],
    ],
  },
  {
    githubRunId: 34349642428,
    runAttempt: 1,
    productionConfigId: 2409,
    config: KIMI3_MI355X_ATOM,
    points: [
      [441389, 32, 'ca4d3493cff9595083ff02630955db50421aaec3bb57d33d94e51298dcd58ff7'],
      [441390, 40, 'ca4d3493cff9595083ff02630955db50421aaec3bb57d33d94e51298dcd58ff7'],
      [441394, 56, '8715c5b117a1e361b592dbe4c88adb645dd55bcb50ea191950366b7ca6e586c2'],
      [441391, 64, '8715c5b117a1e361b592dbe4c88adb645dd55bcb50ea191950366b7ca6e586c2'],
    ],
  },
  {
    githubRunId: 34834280359,
    runAttempt: 2,
    productionConfigId: 1743,
    config: MINIMAXM3_MI355X_ATOM,
    points: [
      [442141, 40, '3b6bfdad1c8d3bf1130cdd63abcd841da7a34ed2b20e6ec017e43e2708ed2c03'],
      [442150, 48, '3b6bfdad1c8d3bf1130cdd63abcd841da7a34ed2b20e6ec017e43e2708ed2c03'],
    ],
  },
  {
    githubRunId: 35157825655,
    runAttempt: 1,
    productionConfigId: 2313,
    config: KIMI3_MI355X_VLLM,
    points: [
      [442407, 44, '079d6e5ead535e8c5fb8a9775f87ddff13383f4b3f7ae89120d0e4908a189748'],
      [442408, 48, '079d6e5ead535e8c5fb8a9775f87ddff13383f4b3f7ae89120d0e4908a189748'],
      [442405, 70, '079d6e5ead535e8c5fb8a9775f87ddff13383f4b3f7ae89120d0e4908a189748'],
    ],
  },
  {
    githubRunId: 35487769456,
    runAttempt: 2,
    productionConfigId: 2409,
    config: KIMI3_MI355X_ATOM,
    points: [
      [442812, 48, '6db8d0ba4f6b0505cb29337beec050574a23892137a3ad54001167c51f688e9b'],
      [442810, 56, '289f5e136e3417c6d9b592d6427a9719efabe5e8195585f2d36b6c722dd2c3d2'],
      [442813, 72, '289f5e136e3417c6d9b592d6427a9719efabe5e8195585f2d36b6c722dd2c3d2'],
    ],
  },
  {
    githubRunId: 36082123873,
    runAttempt: 2,
    productionConfigId: 2313,
    config: KIMI3_MI355X_VLLM,
    points: [
      [443223, 44, 'f952fad1a27a59edbe0a0584bfd92f611b7f4030eb0d79f0328757052ab709cd'],
      [443221, 48, 'f952fad1a27a59edbe0a0584bfd92f611b7f4030eb0d79f0328757052ab709cd'],
      [443226, 70, 'f952fad1a27a59edbe0a0584bfd92f611b7f4030eb0d79f0328757052ab709cd'],
    ],
  },
  {
    githubRunId: 36493779111,
    runAttempt: 3,
    productionConfigId: 2409,
    config: KIMI3_MI355X_ATOM,
    points: [
      [443595, 48, 'e25c25908be0db07eccc10dcb4c8f057b038dc9d68f7a0e0835f1a4fb672378e'],
      [443597, 56, '1f1fc281d6adba17c0cb12a19139bc535c8a9147c90476b84b01b27760328131'],
      [443593, 72, '1f1fc281d6adba17c0cb12a19139bc535c8a9147c90476b84b01b27760328131'],
    ],
  },
  {
    githubRunId: 36611233046,
    runAttempt: 2,
    productionConfigId: 2313,
    config: KIMI3_MI355X_VLLM,
    points: [
      [443692, 44, '728f5a8119b3e9bc33f2dbc2426c41695ccf077e3b0f062d5a03bbe486560bd5'],
      [443687, 48, '728f5a8119b3e9bc33f2dbc2426c41695ccf077e3b0f062d5a03bbe486560bd5'],
      [443688, 70, '728f5a8119b3e9bc33f2dbc2426c41695ccf077e3b0f062d5a03bbe486560bd5'],
    ],
  },
];

export const SPEC_METHOD_BACKFILLS: readonly BenchmarkPointBackfill[] = GROUPS.flatMap((group) =>
  group.points.map(([productionBenchmarkId, conc, recipeFingerprint]) => ({
    id: `run-${group.githubRunId}-${group.config.model}-${group.config.hardware}-${group.config.framework}-conc-${conc}-spec-none`,
    reason:
      'The matrix labeled this AgentX point mtp, but the recipe did not draft at this concurrency: the stored server log shows no speculative config.',
    githubRunId: group.githubRunId,
    runAttempt: group.runAttempt,
    productionConfigId: group.productionConfigId,
    productionBenchmarkId,
    config: group.config,
    benchmarkType: 'agentic_traces',
    isl: null,
    osl: null,
    conc,
    offloadMode: 'on',
    recipeFingerprint,
    set: { specMethod: 'none' },
  })),
);
