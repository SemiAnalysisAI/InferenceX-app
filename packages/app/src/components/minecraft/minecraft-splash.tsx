'use client';

import { useState, useEffect } from 'react';

const SPLASHES = [
  'Now with more tokens!',
  'GPU go brrr!',
  'Also try SGLang!',
  'Tensor cores activated!',
  'FP8 is the new FP16!',
  '100% open source!',
  'Benchmarked on real hardware!',
  'Not just vibes!',
  'Tokens per second!',
  'Time to first token!',
  'May contain NaN!',
  'Works on my GPU!',
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
];

/**
 * Splash text — yellow, rotated, bouncing text (Minecraft title screen style)
 * that appears on the landing page in all UI modes.
 */
export function MinecraftSplash() {
  const [splash, setSplash] = useState('');

  useEffect(() => {
    setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  }, []);

  if (!splash) return null;

  return (
    <div className="splash-wrapper">
      <span className="splash-text">{splash}</span>
    </div>
  );
}
