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
  'uccl-pollara-degraded': {
    en: "UCCL's CPU-proxy RDMA is functional on the Pollara fabric but ~13x under its upstream-documented bandwidth (~6 GB/s vs 82 GB/s), invariant to GPU-memory registration mode and traffic class — an ionic-driver-level suspect. Numbers at that deficit would misrepresent the SKU.",
    zh: 'UCCL 的 CPU 代理 RDMA 在 Pollara 网络上可运行，但带宽仅为上游文档值的约 1/13（约 6 GB/s 对 82 GB/s），与 GPU 内存注册方式和流量类别无关，疑似 ionic 驱动层问题。该水平的数据无法公正代表此 SKU。',
  },
  'uccl-h200-rdma-recv-ring': {
    en: 'Runs with a deeper RDMA receive ring (1040 tokens, labelled -rdmarecv1040): at the default depth the two-node BF16 prefill dispatch deadlocks (uccl-project/uccl#1110). Decode is unchanged by the deeper ring (within 1%); both phases move about 25 GB/s per rank through the CPU proxy, roughly 4x behind DeepEP V2 at the top of the ladder.',
    zh: '使用更深的 RDMA 接收环（1040 token，标记为 -rdmarecv1040）运行：默认深度下双节点 BF16 prefill 的 dispatch 会死锁（uccl-project/uccl#1110）。更深的接收环对 decode 无影响（差异在 1% 以内）；两个阶段经 CPU 代理每 rank 约 25 GB/s，在梯级顶端约比 DeepEP V2 慢 4 倍。',
  },
  'h100-efa-deepep-decode-only': {
    en: 'Runs over EFA through the NCCL GIN proxy: about 2.2 ms at T=1 and 25 ms at T=512, roughly 9x nccl-ep on the same nodes. Decode only: the prefill ladder at this rate does not finish inside the 90-minute case budget.',
    zh: '经 NCCL GIN 代理在 EFA 上运行：T=1 约 2.2 ms，T=512 约 25 ms，约为同节点 nccl-ep 的 9 倍。仅有 decode：按此速率，prefill 梯级无法在 90 分钟的单用例时限内完成。',
  },
  'h100-efa-nccl-ll-decode-only': {
    en: 'Low-latency EP16 runs over EFA with a ~1.2 ms floor at T=1 (vs ~28 µs on EP8 NVLink) and passes correctness at every rung. Decode only: the prefill ladder does not finish inside the 90-minute case budget.',
    zh: '低延迟 EP16 可在 EFA 上运行，T=1 下限约 1.2 ms（EP8 NVLink 约 28 µs），所有梯级正确性通过。仅有 decode：prefill 梯级无法在 90 分钟的单用例时限内完成。',
  },
  'efa-no-ibgda': {
    en: "DeepEP V2's low-latency path uses the bundled V1 buffer, which needs NVSHMEM IBGDA on Mellanox NICs; EFA has no IBGDA, and every rank segfaults at setup. DeepEP V2.5 drops V1 and could run low-latency over NCCL GIN.",
    zh: 'DeepEP V2 的低延迟路径使用内置的 V1 缓冲，需要 Mellanox 网卡上的 NVSHMEM IBGDA；EFA 不支持 IBGDA，所有 rank 在初始化时段错误。DeepEP V2.5 移除了 V1，可经 NCCL GIN 运行低延迟模式。',
  },
  'h100-efa-uccl-ll': {
    en: 'Low-latency EP16 runs over EFA and passes correctness at every rung, with a ~3.4 ms floor at T=1 and ~5.1 ms at the T=256 top rung (BF16), versus ~0.15 ms at T=1 on H200 InfiniBand.',
    zh: '低延迟 EP16 可在 EFA 上运行，所有梯级正确性通过；T=1 下限约 3.4 ms，梯级顶端 T=256 约 5.1 ms（BF16），而 H200 InfiniBand 上 T=1 约 0.15 ms。',
  },
  'mi355x-ainic-a77': {
    en: 'Blocked on the host network stack: the vLLM v0.32.0 ROCm image builds MoRI v1.2.3.post1 for AINIC 1.117.5-a-77, while these nodes run a-45, so two-node MoRI cannot open its RDMA queue pairs. Single-node runs are unaffected; a host AINIC upgrade is requested.',
    zh: '受主机网络栈限制：vLLM v0.32.0 ROCm 镜像中的 MoRI v1.2.3.post1 针对 AINIC 1.117.5-a-77 构建，而这些节点运行 a-45，因此双节点 MoRI 无法建立 RDMA 队列对。单节点不受影响；已申请升级主机 AINIC。',
  },
  'vllm-mori-ll-inter-node-only': {
    en: 'vLLM runs MoRI low-latency only across nodes (InterNodeV1LL); it has no single-node low-latency kernel, so this configuration is not measured.',
    zh: 'vLLM 仅在跨节点时运行 MoRI 低延迟模式（InterNodeV1LL），没有单节点低延迟 Kernel，因此不测量此配置。',
  },
  'uccl-amd-ll-fp8': {
    en: 'Low-latency EP16 works in BF16 and FP8. FP8 sometimes hangs in its first two-node dispatch on these GPUs (every MI325X attempt so far, one of three on MI300X), so MI325X FP8 has no result yet.',
    zh: '低延迟 EP16 在 BF16 与 FP8 下均可用。FP8 在这些 GPU 上偶尔会在首次双节点 dispatch 时卡住（目前 MI325X 每次尝试均卡住，MI300X 三次中一次），因此 MI325X 的 FP8 尚无结果。',
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
    en: 'NCCL EP v0.2 ships the combine-recv shared-memory fence, resolving the v0.1 race. Low-latency EP8 is enabled on all NVIDIA pools, with EP16 on B200, H100, H200, GB200 and GB300. The full decode ladder is restored, in BF16 and FP8.',
    zh: 'NCCL EP v0.2 已加入 combine-recv 共享内存栅栏，修复 v0.1 的竞争问题。所有 NVIDIA 集群均已启用低延迟 EP8，B200、H100、H200、GB200 和 GB300 另已启用 EP16。完整 decode 测试阶梯已恢复，覆盖 BF16 与 FP8。',
  },
  'nccl-ll-ep16-not-enabled': {
    en: 'NCCL EP low-latency EP16 is not enabled on this pool; v0.2 enables it on B200, H100, H200, GB200 and GB300.',
    zh: '该集群尚未启用 NCCL EP 低延迟 EP16；v0.2 已在 B200、H100、H200、GB200 和 GB300 上启用此配置。',
  },
  'b300-ll-single-node-pin': {
    en: 'Works via a pinned single-node HCA list: the low-latency buffer self-enables IBGDA even single-node, and only the storage-IB rails accept AH/DCT creation (InferenceX#2525); steady-state traffic stays on NVLink.',
    zh: '通过固定的单节点 HCA 列表可用：低延迟缓冲即使单节点也会自启用 IBGDA，而只有存储 IB 通道接受 AH/DCT 创建（InferenceX#2525）；稳态流量仍走 NVLink。',
  },
  'b300-ll-create-ah': {
    en: 'Cross-node IBGDA fails during NVSHMEM setup — re-confirmed on a fresh node pair 2026-08-28: ibv_reg_dmabuf_mr returns a null MR before the downstream ibv_create_ah failure, with nvidia_peermem loaded; the live suspect is the stale libmlx5 in the container image (an image bump, not a host fix).',
    zh: '跨节点 IBGDA 在 NVSHMEM 建立阶段失败——2026-08-28 在新节点对上复验：ibv_reg_dmabuf_mr 返回空 MR，随后才是 ibv_create_ah 失败，且 nvidia_peermem 已加载；当前疑点是容器镜像中过旧的 libmlx5（需镜像升级而非主机修复）。',
  },
  'no-ll-kernels': {
    en: 'The library has no low-latency kernels.',
    zh: '该库没有低延迟 Kernel。',
  },
  'll-ep16-not-enabled': {
    en: 'Low-latency EP16 is not enabled for this library on this pool.',
    zh: '该库的低延迟 EP16 未在该集群上启用。',
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
    'deepep-v2': cell(works, worksWith('h100-efa-deepep-decode-only')),
    mori: off('amd-only'),
    'uccl-ep': bothWork,
    'nccl-ep': cell(works, worksWith('nccl-v02-gin')),
    'flashinfer-ep': off('gb-only'),
  },
  h200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': cell(works, worksWith('uccl-h200-rdma-recv-ring')),
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
    mori: bothWork,
    'uccl-ep': bothWork,
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
  mi325x: {
    'deepep-v2': off('nvidia-only'),
    mori: bothWork,
    'uccl-ep': bothWork,
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
  mi355x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(works, broken('mi355x-ainic-a77')),
    'uccl-ep': cell(works, broken('uccl-pollara-degraded')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('gb-only'),
  },
};

const LOW_LATENCY: KnownMatrix = {
  h100: {
    'deepep-v2': cell(works, broken('efa-no-ibgda')),
    mori: off('amd-only'),
    'uccl-ep': cell(works, worksWith('h100-efa-uccl-ll')),
    'nccl-ep': cell(worksWith('nccl-v02-ll'), worksWith('h100-efa-nccl-ll-decode-only')),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  h200: {
    'deepep-v2': bothWork,
    mori: off('amd-only'),
    'uccl-ep': bothWork,
    'nccl-ep': cell(worksWith('nccl-v02-ll'), worksWith('nccl-v02-ll')),
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
    mori: cell(na('vllm-mori-ll-inter-node-only'), works),
    'uccl-ep': cell(na('ll-ep16-not-enabled'), worksWith('uccl-amd-ll-fp8')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  mi325x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(na('vllm-mori-ll-inter-node-only'), works),
    'uccl-ep': cell(na('ll-ep16-not-enabled'), worksWith('uccl-amd-ll-fp8')),
    'nccl-ep': off('nvidia-only'),
    'flashinfer-ep': off('no-ll-kernels'),
  },
  mi355x: {
    'deepep-v2': off('nvidia-only'),
    mori: cell(na('vllm-mori-ll-inter-node-only'), broken('mi355x-ainic-a77')),
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
