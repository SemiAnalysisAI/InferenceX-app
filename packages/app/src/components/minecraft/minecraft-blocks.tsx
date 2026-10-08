import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const BLOCK_COLORS = [
  '#7FB238', // grass
  '#976D4D', // dirt
  '#707070', // stone
  '#5CDBD5', // diamond
  '#FAE04D', // gold
  '#51D975', // emerald
  '#8B7355', // oak wood
  '#AB1B09', // redstone
  '#14121D', // obsidian
  '#4A80D4', // lapis lazuli
];

interface BlockData {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  scale: number;
  speed: number;
  phase: number;
  colorIndex: number;
}

export function FloatingBlocks({ count = 60 }: { count?: number }) {
  const frameCounter = useRef(0);

  const groups = useMemo(() => {
    const blocks: BlockData[] = Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * 35,
      y: (Math.random() - 0.5) * 22,
      z: -3 - Math.random() * 12,
      rotX: Math.random() * Math.PI * 2,
      rotY: Math.random() * Math.PI * 2,
      scale: 0.25 + Math.random() * 0.65,
      speed: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      colorIndex: Math.floor(Math.random() * BLOCK_COLORS.length),
    }));

    const map = new Map<number, BlockData[]>();
    for (const b of blocks) {
      const arr = map.get(b.colorIndex) ?? [];
      arr.push(b);
      map.set(b.colorIndex, arr);
    }
    return [...map.entries()].map(([ci, bs]) => ({
      color: BLOCK_COLORS[ci],
      blocks: bs,
    }));
  }, [count]);

  return (
    <>
      {groups.map((group) => (
        <BlockGroup
          key={group.color}
          color={group.color}
          blocks={group.blocks}
          frameCounter={frameCounter}
        />
      ))}
    </>
  );
}

function BlockGroup({
  color,
  blocks,
  frameCounter,
}: {
  color: string;
  blocks: BlockData[];
  frameCounter: React.RefObject<number>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    // Throttle to ~20fps for performance
    frameCounter.current = (frameCounter.current ?? 0) + 1;
    if (frameCounter.current % 3 !== 0) return;
    if (!meshRef.current) return;

    const t = clock.elapsedTime;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      dummy.position.set(b.x, b.y + Math.sin(t * b.speed + b.phase) * 0.6, b.z);
      dummy.rotation.set(b.rotX + t * b.speed * 0.15, b.rotY + t * b.speed * 0.1, 0);
      dummy.scale.setScalar(b.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
    </instancedMesh>
  );
}
