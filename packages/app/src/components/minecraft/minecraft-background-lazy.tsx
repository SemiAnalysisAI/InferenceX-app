'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const MinecraftBackground = dynamic(
  () => import('./minecraft-background').then((mod) => mod.MinecraftBackground),
  { ssr: false },
);

export function MinecraftBackgroundLazy() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      setActive(document.documentElement.classList.contains('minecraft'));
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return active ? <MinecraftBackground /> : null;
}
