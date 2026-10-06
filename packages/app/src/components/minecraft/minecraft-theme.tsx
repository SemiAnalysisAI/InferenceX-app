'use client';

import { MinecraftBackground } from './minecraft-background';
import { MinecraftDecorations } from './minecraft-decorations';
import './minecraft-theme.css';

export default function MinecraftTheme() {
  return (
    <>
      <MinecraftBackground />
      <MinecraftDecorations />
    </>
  );
}
