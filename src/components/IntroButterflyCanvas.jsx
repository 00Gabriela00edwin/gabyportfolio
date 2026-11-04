import { Canvas } from '@react-three/fiber';
import ButterflyGuide from './ButterflyGuide';

export default function IntroButterflyCanvas({ audioLevel, reducedMotion }) {
  return (
    <Canvas
      camera={{ position: [0, 5.1, 25.5], fov: 43, near: 0.1, far: 150 }}
      onCreated={({ camera }) => camera.lookAt(0, 2.05, -2.5)}
      gl={{ alpha: true, antialias: true }}
      className="pointer-events-none absolute inset-0 z-[2]"
    >
      <ambientLight intensity={0.7} color="#d9e8ed" />
      <directionalLight position={[-7, 12, 8]} intensity={2.6} color="#ffe4b0" />
      <hemisphereLight args={['#9bcbe0', '#60422e', 0.5]} />
      <ButterflyGuide audioLevel={audioLevel} reducedMotion={reducedMotion} />
    </Canvas>
  );
}
