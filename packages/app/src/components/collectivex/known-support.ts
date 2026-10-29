export type CollectiveXKnownStatus = 'works' | 'broken' | 'na';

export interface CollectiveXKnownEp {
  status: CollectiveXKnownStatus;
  note?: string;
}

export interface CollectiveXKnownCell {
  ep8: CollectiveXKnownEp;
  ep16: CollectiveXKnownEp;
}

export const COLLECTIVEX_KNOWN_SKUS = [
  'h100',
  'h200',
  'b200',
  'b300',
  'gb200',
  'gb300',
  'mi300x',
  'mi325x',
  'mi355x',
] as const;

export const COLLECTIVEX_KNOWN_LIBRARIES = [
  'deepep-v2',
  'mori',
  'uccl-ep',
  'nccl-ep',
  'flashinfer-ep',
] as const;

export type CollectiveXKnownSku = (typeof COLLECTIVEX_KNOWN_SKUS)[number];
export type CollectiveXKnownLibrary = (typeof COLLECTIVEX_KNOWN_LIBRARIES)[number];

export interface CollectiveXKnownFootnote {
  en: string;
  zh: string;
}

export const COLLECTIVEX_KNOWN_FOOTNOTES: Record<string, CollectiveXKnownFootnote> = {
  'nvidia-only': {
    en: 'NVIDIA-only library (CUDA/NVSHMEM); no ROCm path exists.',
    zh: '仅支持 NVIDIA 的库（CUDA/NVSHMEM），不存在 ROCm 路径。',
  },
  'amd-only': {
    en: 'ROCm-only library; no CUDA path exists.',
    zh: '仅支持 ROCm 的库，不存在 CUDA 路径。',
  },
  'gb-only': {
    en: 'Requires an MNNVL one-sided NVLink domain; only the GB rack-scale SKUs have one.',
    zh: '需要 MNNVL 单边 NVLink 域，仅 GB 机柜级 SKU 具备。',
  },
  'mori-inter-node-corruption': {
    en: 'MoRI InterNodeV1 combine returns stochastically wrong aggregates above ~128 tokens/rank on the Pollara/ionic fabric (ROCm/mori#610; the earlier caller-side routing bug from #475 is fixed via #546, but this residual survives; the ionic driver 25.11-vs-26.03 delta is the open lead).',
    zh: 'MoRI InterNodeV1 的 combine 在 Pollara/ionic 网络上、每 rank 约 128 token 以上时随机返回错误聚合结果（ROCm/mori#610；#475 的调用方路由 bug 已由 #546 修复，但残留问题仍在；ionic 驱动 25.11 与 26.03 的差异是当前线索）。',
  },
  'tw-no-fabric': {
    en: 'This pool has no inter-node GPU RDMA fabric (the shared subnet is management-only); cross-node EP is structurally impossible until the fabric exists.',
    zh: '该集群没有跨节点 GPU RDMA 网络（共享子网仅用于管理），在网络就位前跨节点 EP 在结构上不可行。',
  },
  'uccl-pollara-degraded': {
    en: "UCCL's CPU-proxy RDMA is functional on the Pollara fabric but ~13x under its upstream-documented bandwidth (~6 GB/s vs 82 GB/s), invariant to GPU-memory registration mode and traffic class — an ionic-driver-level suspect. Numbers at that deficit would misrepresent the SKU.",
    zh: 'UCCL 的 CPU 代理 RDMA 在 Pollara 网络上可运行，但带宽仅为上游文档值的约 1/13（约 6 GB/s 对 82 GB/s），与 GPU 内存注册方式和流量类别无关，疑似 ionic 驱动层问题。该水平的数据无法公正代表此 SKU。',
  },
  'uccl-h100-init-crash': {
    en: 'Crashes at NCCL communicator setup on this pool (unhandled CUDA error, 4/4 attempts on 2026-08-28) while deepep-v2 EP16 ran green concurrently — uccl-specific here, under investigation; the earlier wall-clock rationale is superseded.',
    zh: '在该集群上于 NCCL 通信器建立阶段崩溃（unhandled CUDA error，2026-08-28 四次尝试全部失败），而同期 deepep-v2 EP16 正常通过——为该集群上 uccl 特有问题，调查中；早先的超时说法已被取代。',
  },
  'uccl-hseries-topend': {
    en: 'Works and passes correctness at every rung (audited 2026-08-28); top-of-ladder periods run ~2–3.7x slower than bare-metal B200 — the CPU proxy on this virtualized IB — at parity through T=16.',
    zh: '可用且所有梯级正确性通过（2026-08-28 审计）；梯级顶端周期比裸金属 B200 慢约 2–3.7 倍（虚拟化 IB 上的 CPU 代理），T≤16 时与其持平。',
  },
  'uccl-not-brought-up': {
    en: 'Not brought up on this pool (untested compute capability or no scale-out NIC path for the CPU proxy).',
    zh: '未在该集群上启用（计算架构未经测试，或 CPU 代理没有可用的横向扩展网卡路径）。',
  },
  'uccl-amd-ll-kernel': {
    en: "UCCL's low-latency kernel asserts on AMD CU counts (kNumMaxTopK+1 exceeds the warp-group budget) — an upstream kernel limitation, not an integration gap.",
    zh: 'UCCL 低延迟 Kernel 在 AMD 的 CU 数量下触发断言（kNumMaxTopK+1 超出 warp 组预算），为上游 Kernel 限制而非集成问题。',
  },
  'nccl-v02-gin': {
    en: 'NCCL EP v0.2 fixes the v0.1 cross-node GIN failure. Throughput EP16 has been revalidated on B200, B300, H100 and H200; GB200/GB300 use MNNVL. Qualification is BF16 only.',
    zh: 'NCCL EP v0.2 已修复 v0.1 的跨节点 GIN 故障。吞吐量 EP16 已在 B200、B300、H100 和 H200 上复验通过；GB200/GB300 使用 MNNVL。当前仅验证 BF16。',
  },
  'nccl-v02-ll': {
    en: 'NCCL EP v0.2 ships the combine-recv shared-memory fence, resolving the v0.1 race. Low-latency EP8 is enabled on all NVIDIA pools, with EP16 enabled on B200/GB200/GB300. The full decode ladder is restored; qualification is BF16 only.',
    zh: 'NCCL EP v0.2 已加入 combine-recv 共享内存栅栏，修复 v0.1 的竞争问题。所有 NVIDIA 集群均已启用低延迟 EP8，B200/GB200/GB300 另已启用 EP16。完整 decode 测试阶梯已恢复；当前仅验证 BF16。',
  },
  'nccl-ll-ep16-not-enabled': {
    en: 'NCCL EP low-latency EP16 is not enabled on this pool; it is enabled on B200/GB200/GB300 with v0.2.',
    zh: '该集群尚未启用 NCCL EP 低延迟 EP16；v0.2 已在 B200/GB200/GB300 上启用此配置。',
  },
  'hseries-ll-gdr': {
    en: 'Functional and numerically correct, but the IBGDA send path runs 2.3–26x slower than bare-metal references in these virtualized pods (gdrcopy present but insufficient); held until the platform GDR question is resolved.',
    zh: '功能与数值均正确，但在这些虚拟化节点上 IBGDA 发送路径比裸金属参考慢 2.3–26 倍（已装 gdrcopy 仍不足）；在平台 GDR 问题解决前暂不发布。',
  },
  'b300-ll-single-node-pin': {
    en: 'Works via a pinned single-node HCA list: the low-latency buffer self-enables IBGDA even single-node, and only the storage-IB rails accept AH/DCT creation (InferenceX#2525); steady-state traffic stays on NVLink.',
    zh: '通过固定的单节点 HCA 列表可用：低延迟缓冲即使单节点也会自启用 IBGDA，而只有存储 IB 通道接受 AH/DCT 创建（InferenceX#2525）；稳态流量仍走 NVLink。',
  },
  'b300-ll-create-ah': {
    en: 'Cross-node IBGDA fails during NVSHMEM setup — re-confirmed on a fresh node pair 2026-08-28: ibv_reg_dmabuf_mr returns a null MR before the downstream ibv_create_ah failure, with nvidia_peermem loaded; the live suspect is the stale libmlx5 in the container image (an image bump, not a host fix).',
    zh: '跨节点 IBGDA 在 NVSHMEM 建立阶段失败——2026-08-28 在新节点对上复验：ibv_reg_dmabuf_mr 返回空 MR，随后才是 ibv_create_ah 失败，且 nvidia_peermem 已加载；当前疑点是容器镜像中过旧的 libmlx5（需镜像升级而非主机修复）。',
  },
  'mori-ll-scale-up-only': {
    en: 'MoRI low-latency measures AsyncLL split-phase (the kernel SGLang deploys); the benchmark keeps it scale-up EP8 only.',
    zh: 'MoRI 低延迟测量 AsyncLL 分阶段路径（即 SGLang 实际部署的 Kernel）；基准仅覆盖节点内 EP8。',
  },
  'mori-asyncll-topk6': {
    en: "AsyncLL (the deployed low-latency kernel) hits a device-side assert whenever top-k does not divide the 64-lane warp — the DeepSeek-V4-Pro workload's top-k 6 crashes where top-k 8 passes (bisected on-metal, pure mori API). Fixed upstream in ROCm/mori#505 (2026-07-31); red until the mi35x images ship a mori containing it (newest tag is mori-0706).",
    zh: 'AsyncLL（实际部署的低延迟 Kernel）在 top-k 无法整除 64 lane warp 时触发设备端断言——DeepSeek-V4-Pro 工作负载的 top-k 6 崩溃而 top-k 8 通过（裸金属上用纯 mori API 二分定位）。上游已在 ROCm/mori#505（2026-07-31）修复；在 mi35x 镜像包含该修复前（最新标签为 mori-0706）保持红色。',
  },
  'no-ll-kernels': {
    en: 'The library has no low-latency kernels.',
    zh: '该库没有低延迟 Kernel。',
  },
  'll-ep16-not-enabled': {
    en: 'Low-latency EP16 is not enabled for this library on any pool.',
    zh: '该库的低延迟 EP16 未在任何集群上启用。',
  },
};

const works: CollectiveXKnownEp = { status: 'works' };
const worksWith = (note: string): CollectiveXKnownEp => ({ status: 'works', note });
const broken = (note: string): CollectiveXKnownEp => ({ status: 'broken', note });
const na = (note: string): CollectiveXKnownEp => ({ status: 'na', note });

const bothWork: CollectiveXKnownCell = { ep8: works, ep16: works };
const cell = (ep8: CollectiveXKnownEp, ep16: CollectiveXKnownEp): CollectiveXKnownCell => ({
  ep8,
  ep16,
});
const off = (note: string): CollectiveXKnownCell => cell(na(note), na(note));

type KnownMatrix = Record<
  CollectiveXKnownSku,
  Record<CollectiveXKnownLibrary, CollectiveXKnownCell>
>;

const NORMAL: KnownMatrix = {
  h100: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': cell(works, broken('uccl-h100-init-crash')),
    'nccl-ep': cell(works, worksWith('nccl-v02-gin')),
    'flashinfer-ep': off('gb-only'),
  },
  h200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': cell(works, worksWith('uccl-hseries-topend')),
    'nccl-ep': cell(works, worksWith('nccl-v02-gin')),
    'flashinfer-ep': off('gb-only'),
  },
  b200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': bothWork,
    'nccl-ep': cell(works, worksWith('nccl-v02-gin')),
    'flashinfer-ep': off('gb-only'),
  },
  b300: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': cell(works, worksWith('nccl-v02-gin')),
    'flashinfer-ep': off('gb-only'),
  },
  gb200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': bothWork,
    'flashinfer-ep': bothWork,
  },
  gb300: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': bothWork,
    'flashinfer-ep': bothWork,
  },
  mi300x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(works, broken('tw-no-fabric')),
    'uccl-ep': cell(works, broken('tw-no-fabric')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
  mi325x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(works, broken('tw-no-fabric')),
    'uccl-ep': cell(works, broken('tw-no-fabric')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
  mi355x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(works, broken('mori-inter-node-corruption')),
    'uccl-ep': cell(works, broken('uccl-pollara-degraded')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
};

const LOW_LATENCY: KnownMatrix = {
  h100: {
    'deepep-v2': cell(works, broken('hseries-ll-gdr')),
    mori: off('amd-only'),
    'uccl-ep': cell(works, na('ll-ep16-not-enabled')),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), na('nccl-ll-ep16-not-enabled')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  h200: {
    'deepep-v2': cell(works, broken('hseries-ll-gdr')),
    mori: off('amd-only'),
    'uccl-ep': cell(works, na('ll-ep16-not-enabled')),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), na('nccl-ll-ep16-not-enabled')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  b200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': cell(works, na('ll-ep16-not-enabled')),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), worksWith('nccl-v02-ll')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  b300: {
    'deepep-v2': cell(worksWith('b300-ll-single-node-pin'), broken('b300-ll-create-ah')),
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), na('nccl-ll-ep16-not-enabled')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  gb200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), worksWith('nccl-v02-ll')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  gb300: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': off('uccl-not-brought-up'),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), worksWith('nccl-v02-ll')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  mi300x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(broken('mori-asyncll-topk6'), na('mori-ll-scale-up-only')),
    'uccl-ep': cell(broken('uccl-amd-ll-kernel'), broken('uccl-amd-ll-kernel')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  mi325x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(broken('mori-asyncll-topk6'), na('mori-ll-scale-up-only')),
    'uccl-ep': cell(broken('uccl-amd-ll-kernel'), broken('uccl-amd-ll-kernel')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  mi355x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(broken('mori-asyncll-topk6'), na('mori-ll-scale-up-only')),
    'uccl-ep': cell(broken('uccl-amd-ll-kernel'), broken('uccl-amd-ll-kernel')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('no-ll-kernels'),
  },
};

export const COLLECTIVEX_KNOWN_SUPPORT: Record<'normal' | 'low-latency', KnownMatrix> = {
  normal: NORMAL,
  'low-latency': LOW_LATENCY,
};

export function collectiveXKnownFootnoteOrder(mode: 'normal' | 'low-latency'): string[] {
  const seen: string[] = [];
  for (const sku of COLLECTIVEX_KNOWN_SKUS) {
    for (const library of COLLECTIVEX_KNOWN_LIBRARIES) {
      const kase = COLLECTIVEX_KNOWN_SUPPORT[mode][sku][library];
      for (const ep of [kase.ep8, kase.ep16]) {
        if (ep.note && !seen.includes(ep.note)) seen.push(ep.note);
      }
    }
  }
  return seen;
}

/** The fields of a measured series the matrix reads its backend versions from. */
export interface CollectiveXVersionedSeries {
  mode: 'normal' | 'low-latency';
  backend: string;
  library_version?: string | null;
  system: { sku: string };
}

/** The matrix row of a pool: `h100-dgxc` and `b200-nscale` are the H100 and B200 rows. */
export function collectiveXKnownSkuOf(poolSku: string): CollectiveXKnownSku | null {
  const sku = poolSku.toLowerCase().split('-')[0];
  return (COLLECTIVEX_KNOWN_SKUS as readonly string[]).includes(sku)
    ? (sku as CollectiveXKnownSku)
    : null;
}

/**
 * The cell's label for a recorded version: the first token (uccl appends its build flags), with
 * any commit hash cut to seven characters.
 */
export function collectiveXShortLibraryVersion(version: string): string {
  const head = version.trim().split(/\s+/)[0] ?? '';
  return head.replaceAll(/[0-9a-f]{12,40}/g, (hash) => hash.slice(0, 7));
}

/** The distinct recorded versions of each `mode/sku/library` cell, sorted. */
export function collectiveXKnownVersions(
  series: readonly CollectiveXVersionedSeries[],
): Map<string, string[]> {
  const versions = new Map<string, Set<string>>();
  for (const item of series) {
    const sku = collectiveXKnownSkuOf(item.system.sku);
    const version = item.library_version?.trim();
    if (!sku || !version) continue;
    const key = `${item.mode}/${sku}/${item.backend}`;
    const recorded = versions.get(key) ?? new Set<string>();
    recorded.add(version);
    versions.set(key, recorded);
  }
  return new Map([...versions].map(([key, recorded]) => [key, [...recorded].toSorted()]));
}
