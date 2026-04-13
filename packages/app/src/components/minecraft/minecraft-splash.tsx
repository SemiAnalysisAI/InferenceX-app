'use client';

import { useState, useEffect, useRef } from 'react';

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
 * Minecraft-style splash text — yellow, rotated, bouncing text
 * that appears on the landing page when minecraft mode is active.
 */
export function MinecraftSplash() {
  const [isMinecraft, setIsMinecraft] = useState(false);
  const [splash, setSplash] = useState('');
  const hasInitialized = useRef(false);

  useEffect(() => {
    function check() {
      setIsMinecraft(document.documentElement.classList.contains('minecraft'));
    }
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isMinecraft && !hasInitialized.current) {
      hasInitialized.current = true;
      setSplash(SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
    }
    if (!isMinecraft) {
      hasInitialized.current = false;
    }
  }, [isMinecraft]);

  if (!isMinecraft || !splash) return null;

  return (
    <div className="minecraft-splash-wrapper">
      <span className="minecraft-splash">{splash}</span>
    </div>
  );
}
