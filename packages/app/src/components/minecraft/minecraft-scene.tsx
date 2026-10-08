import { Canvas } from '@react-three/fiber';
import { FloatingBlocks } from './minecraft-blocks';

// This background has no pointer interaction. Avoid connecting DOM listeners
// after an asynchronous Canvas initialization races with theme removal.
const decorativeEvents = () => ({ enabled: false, priority: 0 });

export default function MinecraftScene() {
  return (
    <Canvas
      events={decorativeEvents}
      dpr={[0.5, 1]}
      camera={{ position: [0, 0, 10], fov: 55 }}
      gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 6, 5]} intensity={0.7} />
      <directionalLight position={[-5, -3, 2]} intensity={0.2} />
      <FloatingBlocks count={60} />
    </Canvas>
  );
}
