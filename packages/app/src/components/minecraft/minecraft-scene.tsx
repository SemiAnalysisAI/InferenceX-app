import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { FloatingBlocks } from './minecraft-blocks';

const decorativeEvents = () => ({ enabled: false, priority: 0 });

/** Faint background drift does not need 60 fps: ask for a frame 12 times a second, never while hidden. */
const DRIFT_FPS = 12;
function DriftTicker() {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / DRIFT_FPS);
    return () => window.clearInterval(id);
  }, [invalidate]);
  return null;
}

export default function MinecraftScene() {
  return (
    <Canvas
      events={decorativeEvents}
      // R3F gives its wrapper pointer-events:auto; this canvas is decoration only.
      style={{ pointerEvents: 'none' }}
      dpr={[0.5, 1]}
      // Frames only on demand: DriftTicker asks for 12 a second; with reduced motion the blocks
      // are drawn once and hold still.
      frameloop="demand"
      camera={{ position: [0, 0, 10], fov: 55 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 6, 5]} intensity={0.7} />
      <directionalLight position={[-5, -3, 2]} intensity={0.2} />
      <FloatingBlocks count={60} />
      <DriftTicker />
    </Canvas>
  );
}
