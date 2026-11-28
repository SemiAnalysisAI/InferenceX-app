'use client';

import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

export const SPLASHES = [
  'Now with more tokens!',
  'Chip go brrr!',
  'Also try SGLang!',
  'Tensor cores activated!',
  'FP8 is the new FP16!',
  '100% open source!',
  'Benchmarked on real hardware!',
  'Not just vibes!',
  'Tokens per second!',
  'Time to first token!',
  'May contain NaN!',
  'Works on my Chip!',
  'DeepSeek approved!',
  'Lower latency!',
  'Higher throughput!',
  'Runs on a single node!',
  'NVLink go brrr!',
  'Attention is all you need!',
  'Powered by CUDA!',
  'Batch size = 1!',
  'No synthetic benchmarks!',
  'Real-world workloads!',
  'Out of VRAM!',
  'KV cache optimized!',
  'Prefill gang!',
  'Disagg or no disagg?',
  'GB200 NVL72!',
  'More flops!',
  'PCIe bottleneck!',
  'Roofline analysis!',
  'As a child, I yearned for the GPUs!',
  'Never dig straight down the Pareto frontier!',
  'Removed Herobrine!',
  'Chicken jockey at concurrency 512!',
  'Flint and steel!',
  'Creeper? Aw man, so we back in the queue!',
  'This… is a KV cache!',
  // Official splashes, verbatim (minecraft.wiki/w/Splash). The game shows them in English in
  // every language, so the zh list carries them too.
  'Also try Terraria!',
  'Aww man!',
  'Exploding creepers!',
  'Made by Jeb!',
];

export const SPLASHES_ZH = [
  '现在有更多令牌！',
  '芯片冲冲冲！',
  '也试试 SGLang！',
  '张量核心已激活！',
  'FP8 就是新的 FP16！',
  '百分百开源！',
  '在真实硬件上测试！',
  '不只是感觉！',
  '每秒令牌数！',
  '首个令牌时间！',
  '可能含有 NaN！',
  '在我的芯片上能跑！',
  '更低延迟！',
  '更高吞吐！',
  'NVLink 冲冲冲！',
  '注意力就是你所需要的一切！',
  '显存不足！',
  'KV 缓存已优化！',
  '预填充小队！',
  '要不要分离式推理？',
  '更多算力！',
  '屋顶线分析！',
  '苦力怕在看你的图表！',
  '挖矿中……',
  '小时候，我向往 GPU！',
  '永远不要沿帕累托前沿垂直向下挖！',
  '移除了 Herobrine！',
  '并发 512 的鸡骑士！',
  '打火石！',
  '苦力怕？完了，又回到队列里！',
  '这……是 KV 缓存！',
  'Also try Terraria!',
  'Aww man!',
  'Exploding creepers!',
  'Made by Jeb!',
];

export function pickSplash(locale: 'en' | 'zh'): string {
  const list = locale === 'zh' ? SPLASHES_ZH : SPLASHES;
  return list[Math.floor(Math.random() * list.length)];
}

export default function MinecraftSplashText() {
  const locale = useLocale();
  const [index] = useState(() => Math.random());
  const list = locale === 'zh' ? SPLASHES_ZH : SPLASHES;
  return list[Math.floor(index * list.length)];
}
