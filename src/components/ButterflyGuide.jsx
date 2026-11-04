import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Butterfly from './Butterfly';

const BUTTERFLY_PARTICLE_COUNT = 34;

function ButterflyStardust({ positionRef, reducedMotion }) {
  const particleRefs = useRef([]);
  const elapsedSinceEmission = useRef(0);
  const nextParticle = useRef(0);
  const particleState = useMemo(() => Array.from({ length: BUTTERFLY_PARTICLE_COUNT }, (_, index) => ({
    life: 0.65 + (index % 5) * 0.08,
    velocity: new THREE.Vector3(
      Math.sin(index * 17.13) * 0.65,
      0.35 + (index % 4) * 0.06,
      0.2 + Math.cos(index * 11.71) * 0.38,
    ),
    size: 0.65 + (index % 4) * 0.12,
    warm: index % 2 === 0,
  })), []);
  const ages = useRef(null);
  if (ages.current == null) ages.current = new Float32Array(BUTTERFLY_PARTICLE_COUNT).fill(2);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.14, 7, 6), []);
  const materials = useMemo(() => particleState.map((particle) => new THREE.MeshBasicMaterial({
    color: particle.warm ? '#ffc87a' : '#d9f7ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), [particleState]);

  useEffect(() => () => {
    geometry.dispose();
    materials.forEach((material) => material.dispose());
  }, [geometry, materials]);

  useFrame((_, delta) => {
    if (!reducedMotion && positionRef.current.lengthSq() > 0) {
      elapsedSinceEmission.current += delta;
      if (elapsedSinceEmission.current >= 0.045) {
        elapsedSinceEmission.current = 0;
        const index = nextParticle.current;
        ages.current[index] = 0;
        particleRefs.current[index]?.position.copy(positionRef.current);
        if (particleRefs.current[index]) particleRefs.current[index].visible = true;
        nextParticle.current = (index + 1) % BUTTERFLY_PARTICLE_COUNT;
      }
    }

    particleState.forEach((particle, index) => {
      const mesh = particleRefs.current[index];
      if (!mesh) return;
      if (ages.current[index] < particle.life) {
        ages.current[index] += delta;
        const progress = Math.min(1, ages.current[index] / particle.life);
        const opacity = (1 - progress) ** 1.8;
        mesh.position.addScaledVector(particle.velocity, delta);
        mesh.scale.setScalar(particle.size * (1 - progress * 0.72));
        mesh.material.opacity = opacity * 0.82;
        mesh.visible = true;
      } else {
        mesh.visible = false;
        mesh.material.opacity = 0;
      }
    });
  });

  return (
    <group>
      {particleState.map((particle, index) => (
        <mesh
          key={index}
          ref={(mesh) => { particleRefs.current[index] = mesh; }}
          geometry={geometry}
          material={materials[index]}
          visible={false}
          scale={particle.size}
          renderOrder={2}
        />
      ))}
    </group>
  );
}

export default function ButterflyGuide({ audioLevel, reducedMotion }) {
  const butterflyPosition = useRef(new THREE.Vector3());
  const updateButterflyPosition = useCallback((position) => {
    butterflyPosition.current.copy(position);
  }, []);

  return (
    <>
      <Butterfly
        isEntered
        audioLevel={audioLevel}
        reducedMotion={reducedMotion}
        anchorPosition={[1.1, 2.4, 2.1]}
        cursorFollow
        scaleMultiplier={3.2}
        onPositionUpdate={updateButterflyPosition}
      />
      <ButterflyStardust positionRef={butterflyPosition} reducedMotion={reducedMotion} />
    </>
  );
}
