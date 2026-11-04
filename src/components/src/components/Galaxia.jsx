import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer } from '@react-three/postprocessing';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  PlaneGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';
import { useAppAudio } from '../../../audio/AudioContext';
import Butterfly from '../../Butterfly';

const CHROMATIC_ABERRATION_OFFSET = new Vector2(0.00025, 0.00025);
const PROJECTS = [
  {
    title: 'Nowin Especias',
    category: 'E-commerce',
    contribution: 'Frontend · comercio digital.',
    description: 'Plataforma e-commerce y panel administrativo para la gestión de ventas e inventario.',
    technologies: ['React', 'Vite', 'Tailwind CSS', 'Firebase'],
    url: 'https://nowinespecias.com',
    accent: '#00f2fe',
  },
  {
    title: 'Artes del Fuego',
    category: 'Gestión & cerámica',
    contribution: 'Administración y coordinación operativa.',
    description: 'Sistema de inventario y gestión de stock para materiales cerámicos, hornos y herramientas del taller.',
    technologies: ['React', 'Vite', 'Tailwind CSS', 'Firebase'],
    url: 'https://artesdelfuego.vercel.app',
    accent: '#ff9b70',
  },
  {
    title: 'Interfaces & Dashboards',
    category: 'Diseño UI/UX',
    contribution: 'Diseño UI/UX · prototipado interactivo.',
    description: 'Prototipos interactivos y componentes animados inspirados en la astronomía y la observación estelar.',
    technologies: ['Figma', 'Framer Motion', 'GSAP'],
    accent: '#c084fc',
  },
];
const staggerContainerVariants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.06, staggerChildren: 0.075 } },
};

function createProjectOrbitTexture(project, index) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la textura de la tarjeta de proyecto.');

  context.fillStyle = '#07101d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `${project.accent}bb`;
  context.lineWidth = 3;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  context.fillStyle = `${project.accent}22`;
  context.fillRect(16, 16, canvas.width - 32, 52);
  context.fillStyle = project.accent;
  context.font = 'bold 18px monospace';
  context.fillText(`PROYECTO  /  0${index + 1}`, 30, 48);
  context.fillStyle = '#f8fafc';
  context.font = 'bold 32px sans-serif';
  context.fillText(project.title, 30, 132, 445);
  context.fillStyle = '#b8c7d9';
  context.font = '20px monospace';
  context.fillText(project.category.toUpperCase(), 32, 174, 440);
  context.fillStyle = '#cbd5e1';
  context.font = '17px sans-serif';
  context.fillText(project.technologies.slice(0, 3).join('  ·  '), 32, 270, 440);
  context.fillStyle = project.accent;
  context.fillRect(32, 292, 120, 3);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function ProjectOrbitCards({ paused, onSelect, onPointerOver, onPointerOut }) {
  const orbitRef = useRef(null);
  const cards = useMemo(() => PROJECTS.map((project, index) => {
    const geometry = new PlaneGeometry(1.35, 0.88, 16, 8);
    const positions = geometry.attributes.position;
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const x = positions.getX(vertex);
      positions.setZ(vertex, 0.07 * (1 - (x / 0.675) ** 2));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return { geometry, texture: createProjectOrbitTexture(project, index) };
  }), []);

  useEffect(() => () => {
    cards.forEach(({ geometry, texture }) => {
      geometry.dispose();
      texture.dispose();
    });
  }, [cards]);

  useFrame((_, delta) => {
    if (orbitRef.current && !paused) orbitRef.current.rotation.z += delta * 0.12;
  });

  return (
    <group ref={orbitRef}>
      {cards.map(({ geometry, texture }, index) => {
        const angle = (index / cards.length) * Math.PI * 2;
        return (
          <Billboard
            key={PROJECTS[index].title}
            position={[Math.cos(angle) * 2.2, Math.sin(angle) * 2.2, 0.05]}
            follow
          >
            <mesh
              geometry={geometry}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(index);
              }}
              onPointerOver={onPointerOver}
              onPointerOut={onPointerOut}
            >
              <meshBasicMaterial
                map={texture}
                color="#ffffff"
                side={DoubleSide}
                transparent
                opacity={0.96}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </Billboard>
        );
      })}
    </group>
  );
}

function CommunicationSatellite() {
  return (
    <group>
      <mesh>
        <octahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial
          color="#b9f7ff"
          emissive="#42d8f4"
          emissiveIntensity={1.1}
          metalness={0.65}
          roughness={0.25}
        />
      </mesh>
      {[-1, 1].map((direction) => (
        <group key={direction} position={[direction * 0.52, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.48, 0.28, 0.035]} />
            <meshStandardMaterial
              color="#5e9cc4"
              emissive="#1a6b9a"
              emissiveIntensity={0.55}
              metalness={0.5}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0, 0.025]}>
            <planeGeometry args={[0.4, 0.21]} />
            <meshBasicMaterial color="#8deaff" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.38, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.32, 8]} />
        <meshStandardMaterial color="#d7e9ff" emissive="#8deaff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshBasicMaterial color="#fff4c2" toneMapped={false} />
      </mesh>
      <pointLight color="#61e6ff" intensity={0.8} distance={2.2} />
    </group>
  );
}
const staggerItemVariants = {
  hidden: { opacity: 0, y: 9 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

function SceneReady({ onReady }) {
  const hasReportedReady = useRef(false);

  useFrame(() => {
    if (hasReportedReady.current) return;
    hasReportedReady.current = true;
    onReady();
  });

  return null;
}

function cloneSRGBTexture(texture) {
  const clone = texture.clone();
  clone.colorSpace = SRGBColorSpace;
  return clone;
}

function SpatialAudioListener({ updateAudioListener }) {
  const forward = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    camera.getWorldDirection(forward);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    updateAudioListener(camera.position, forward, up);
  });

  return null;
}

function CinematicExit({ active, canvasRef, onBloomChange, onComplete, reducedMotion }) {
  const { camera } = useThree();

  useEffect(() => {
    if (!active) return undefined;

    const bloom = { intensity: 0.42 };
    const timeline = gsap.timeline({ onComplete });
    timeline
      .to(camera.position, {
        z: camera.position.z + 18,
        duration: reducedMotion ? 0 : 2.15,
        ease: 'power2.inOut',
      }, 0)
      .to(bloom, {
        intensity: 2.8,
        duration: reducedMotion ? 0 : 0.45,
        ease: 'power3.in',
        onUpdate: () => onBloomChange(bloom.intensity),
      }, 0.08)
      .to(bloom, {
        intensity: 0.42,
        duration: reducedMotion ? 0 : 0.9,
        ease: 'power2.out',
        onUpdate: () => onBloomChange(bloom.intensity),
      }, 0.56)
      .to(canvasRef.current, {
        opacity: 0,
        duration: reducedMotion ? 0 : 1.3,
        ease: 'power2.in',
      }, 0.82);

    return () => timeline.kill();
  }, [active, camera, canvasRef, onBloomChange, onComplete, reducedMotion]);

  return null;
}

function createGoldenBurstGeometry() {
  const positions = [];
  for (let index = 0; index < 220; index += 1) {
    const angle = index * 2.399963;
    const vertical = 1 - (index / 219) * 2;
    const ringRadius = Math.sqrt(1 - vertical * vertical);
    const radius = 1.2 + ((index * 37) % 100) / 100 * 5.5;
    positions.push(
      Math.cos(angle) * ringRadius * radius,
      vertical * radius,
      Math.sin(angle) * ringRadius * radius,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

function GoldenSecretParticles({ active, paused }) {
  const pointsRef = useRef(null);
  const materialRef = useRef(null);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => createGoldenBurstGeometry(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (active) elapsedRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || paused) return;
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;
    const progress = Math.min(1, Math.max(0, elapsed / 2.6));
    if (pointsRef.current) {
      pointsRef.current.scale.setScalar(0.28 + progress * 1.65);
      pointsRef.current.rotation.y = elapsed * 0.28;
      pointsRef.current.rotation.x = elapsed * 0.12;
    }
    if (materialRef.current) materialRef.current.opacity = Math.max(0, 1 - progress);
  });

  return (
    <points ref={pointsRef} geometry={geometry} visible={active}>
      <pointsMaterial
        ref={materialRef}
        color="#ffd879"
        size={0.14}
        sizeAttenuation
        transparent
        opacity={1}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

function Earth({ paused }) {
  const earthRef = useRef(null);
  const cloudsRef = useRef(null);
  const [surfaceTexture, cloudsMap] = useLoader(TextureLoader, [
    '/textures/celestial/earth_atmos_2048.jpg',
    '/textures/celestial/earth_clouds_1024.png',
  ]);
  const surfaceMap = useMemo(() => cloneSRGBTexture(surfaceTexture), [surfaceTexture]);
  useEffect(() => () => surfaceMap.dispose(), [surfaceMap]);

  useFrame((_, delta) => {
    if (paused) return;
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.018;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.022;
  });

  return (
    <group>
      <directionalLight position={[5, 3, 7]} color="#dcecff" intensity={2.2} />
      <mesh ref={earthRef}>
        <sphereGeometry args={[1.28, 96, 96]} />
        <meshStandardMaterial map={surfaceMap} roughness={0.88} metalness={0.02} />
      </mesh>
      <mesh ref={cloudsRef} scale={1.012}>
        <sphereGeometry args={[1.28, 64, 64]} />
        <meshStandardMaterial
          alphaMap={cloudsMap}
          color="#ffffff"
          transparent
          opacity={0.48}
          depthWrite={false}
          roughness={1}
        />
      </mesh>
      <mesh scale={1.055}>
        <sphereGeometry args={[1.28, 64, 64]} />
        <meshBasicMaterial
          color="#58aaff"
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          opacity={0.18}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function OrbitingMoon({ paused, focusRef, onSelect, onPointerOver, onPointerOut }) {
  const orbitRef = useRef(null);
  const moonRef = useRef(null);
  const [surfaceTexture] = useLoader(TextureLoader, ['/textures/celestial/moon_1024.jpg']);
  const surfaceMap = useMemo(() => cloneSRGBTexture(surfaceTexture), [surfaceTexture]);
  useEffect(() => () => surfaceMap.dispose(), [surfaceMap]);

  useFrame((_, delta) => {
    if (paused) return;
    if (orbitRef.current) orbitRef.current.rotation.y += delta * 0.14;
    if (moonRef.current) moonRef.current.rotation.y += delta * 0.035;
  });

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.75, 3.77, 96]} />
        <meshBasicMaterial color="#b9d8ff" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <group ref={orbitRef}>
        <group
          ref={focusRef}
          position={[3.76, 0, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        >
          <mesh ref={moonRef}>
            <sphereGeometry args={[0.42, 48, 48]} />
            <meshStandardMaterial map={surfaceMap} roughness={0.96} metalness={0} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function createGalaxyGeometry() {
  const positions = [];
  const colors = [];
  const armPalette = ['#315aa8', '#8d459e', '#2f75aa', '#bd8c46'];
  const armCount = 4;
  const pointsPerArm = 1100;

  for (let arm = 0; arm < armCount; arm += 1) {
    for (let index = 0; index < pointsPerArm; index += 1) {
      const progress = index / (pointsPerArm - 1);
      const radius = 2.3 + progress * 25;
      const angle = (arm / armCount) * Math.PI * 2 + progress * 7.4;
      const spread = 0.12 + progress * 0.5;
      const seed = index * 17.13 + arm * 91.7;
      const offsetX = Math.sin(seed) * spread;
      const offsetY = Math.cos(seed * 1.73) * spread;
      positions.push(
        Math.cos(angle) * radius + offsetX,
        Math.sin(angle) * radius + offsetY,
        Math.sin(seed * 0.39) * (0.12 + progress * 1.3),
      );

      const color = new Color(armPalette[arm]);
      color.lerp(new Color('#d9d7e8'), (Math.sin(index * 0.17 + arm) + 1) * 0.09);
      if (progress < 0.14) color.lerp(new Color('#f5d28b'), (0.14 - progress) * 1.8);
      colors.push(color.r, color.g, color.b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function createStarSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la textura difusa de las estrellas.');

  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  glow.addColorStop(0.16, 'rgba(255, 255, 255, 0.58)');
  glow.addColorStop(0.42, 'rgba(255, 255, 255, 0.18)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function seededUnit(index, seed) {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createClusterGeometry(center, spread, count, seed, baseColor) {
  const positions = [];
  const colors = [];
  const tint = new Color(baseColor);

  for (let index = 0; index < count; index += 1) {
    const x = (seededUnit(index, seed) + seededUnit(index, seed + 2) + seededUnit(index, seed + 4) - 1.5) * 2;
    const y = (seededUnit(index, seed + 6) + seededUnit(index, seed + 8) + seededUnit(index, seed + 10) - 1.5) * 2;
    const z = (seededUnit(index, seed + 12) + seededUnit(index, seed + 14) + seededUnit(index, seed + 16) - 1.5) * 2;
    positions.push(
      center[0] + x * spread[0],
      center[1] + y * spread[1],
      center[2] + z * spread[2],
    );
    const color = tint.clone().lerp(new Color('#d8e7ff'), seededUnit(index, seed + 18) * 0.28);
    colors.push(color.r, color.g, color.b);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

function CosmicBackdrop({ paused }) {
  const groupRef = useRef(null);
  const layers = useMemo(() => ({
    galaxy: createGalaxyGeometry(),
    starSprite: createStarSpriteTexture(),
    clusters: [
      createClusterGeometry([-29, 15, -32], [12, 8, 9], 1000, 7, '#3f68db'),
      createClusterGeometry([31, -12, -42], [15, 10, 12], 1100, 23, '#a444bd'),
      createClusterGeometry([-8, -25, -58], [18, 11, 14], 1250, 51, '#274fa8'),
    ],
  }), []);

  useEffect(() => () => {
    layers.galaxy.dispose();
    layers.starSprite.dispose();
    layers.clusters.forEach((geometry) => geometry.dispose());
  }, [layers]);

  useFrame((_, delta) => {
    if (groupRef.current && !paused) groupRef.current.rotation.y += delta * 0.003;
  });

  return (
    <group ref={groupRef}>
      <points geometry={layers.galaxy} rotation={[0.34, 0.05, 0]}>
        <pointsMaterial
          map={layers.starSprite}
          size={0.16}
          sizeAttenuation
          vertexColors
          transparent
          opacity={0.55}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      {layers.clusters.map((geometry, index) => (
        <points key={index} geometry={geometry}>
          <pointsMaterial
            map={layers.starSprite}
            size={0.24 + index * 0.035}
            sizeAttenuation
            vertexColors
            transparent
            opacity={0.36}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </points>
      ))}
    </group>
  );
}

function createPortalPreviewTexture(form, accentColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo crear la miniatura holográfica del portal.');
  }
  context.scale(2, 2);

  context.fillStyle = '#07101d';
  context.fillRect(0, 0, 512, 320);
  context.strokeStyle = `${accentColor}55`;
  context.lineWidth = 2;
  context.strokeRect(10, 10, 492, 300);
  context.fillStyle = '#0d1a2b';
  context.fillRect(20, 20, 472, 38);
  context.fillStyle = accentColor;
  context.font = 'bold 15px monospace';
  context.fillText('GABY EDWIN  /  PORTAL', 34, 45);
  context.fillStyle = '#7890a8';
  context.font = '11px monospace';
  context.fillText('LIVE PREVIEW  •  01', 370, 44);

  if (form === 'pod') {
    context.fillStyle = '#f1a44d';
    context.font = 'bold 27px sans-serif';
    context.fillText('NOWIN', 36, 103);
    context.fillStyle = '#b6c7d8';
    context.font = '13px sans-serif';
    context.fillText('ESPECIAS  /  E-COMMERCE', 37, 125);
    context.fillStyle = '#10243a';
    context.fillRect(34, 145, 285, 135);
    ['Pimentón ahumado', 'Mix de especias', 'Canela en rama'].forEach((name, index) => {
      const y = 172 + index * 34;
      context.fillStyle = ['#e97145', '#63c4cf', '#d2a84e'][index];
      context.fillRect(48, y - 10, 20, 20);
      context.fillStyle = '#dbe8ef';
      context.font = '12px sans-serif';
      context.fillText(name, 80, y + 4);
      context.fillStyle = '#29415b';
      context.fillRect(223, y - 6, 72, 8);
    });
    context.fillStyle = '#172b40';
    context.fillRect(337, 145, 136, 135);
    context.fillStyle = '#65d9df';
    context.font = '12px monospace';
    context.fillText('VENTAS', 354, 172);
    context.fillStyle = '#ffbb61';
    context.font = 'bold 16px monospace';
    context.fillText('RESUMEN', 354, 204);
    context.strokeStyle = '#62d5dd';
    context.beginPath();
    context.moveTo(350, 253);
    context.lineTo(376, 229);
    context.lineTo(399, 240);
    context.lineTo(424, 211);
    context.lineTo(458, 221);
    context.stroke();
  } else if (form === 'ceramic') {
    context.fillStyle = '#f4a383';
    context.font = 'bold 23px sans-serif';
    context.fillText('ARTES DEL FUEGO', 34, 100);
    context.fillStyle = '#b6c7d8';
    context.font = '12px monospace';
    context.fillText('INVENTARIO  /  GRES', 36, 122);
    context.fillStyle = '#132337';
    context.fillRect(34, 143, 286, 137);
    ['Piezas en stock', 'Talleres activos', 'Arcilla gres'].forEach((label, index) => {
      const y = 169 + index * 34;
      context.fillStyle = '#d9e1e8';
      context.font = '12px sans-serif';
      context.fillText(label, 49, y);
      context.fillStyle = ['#f19a79', '#66cbd0', '#e8c16d'][index];
      context.fillRect(205, y - 12, [72, 48, 96][index], 9);
    });
    context.fillStyle = '#c77456';
    context.beginPath();
    context.moveTo(369, 254);
    context.lineTo(375, 178);
    context.quadraticCurveTo(401, 150, 427, 178);
    context.lineTo(433, 254);
    context.closePath();
    context.fill();
    context.strokeStyle = '#f3ba84';
    context.lineWidth = 4;
    context.beginPath();
    context.ellipse(401, 178, 26, 8, 0, 0, Math.PI * 2);
    context.stroke();
  } else if (form === 'crystal') {
    context.fillStyle = '#d6a5ff';
    context.font = 'bold 23px sans-serif';
    context.fillText('UNIVERSO PERSONAL', 34, 100);
    context.fillStyle = '#b6c7d8';
    context.font = '12px monospace';
    context.fillText('ASTRONOMÍA  /  LSA  /  ARTE', 36, 122);
    context.fillStyle = '#0c192a';
    context.fillRect(34, 143, 438, 137);
    context.strokeStyle = '#745db2';
    context.lineWidth = 1;
    for (let index = 0; index < 40; index += 1) {
      const x = 45 + ((index * 83) % 410);
      const y = 151 + ((index * 47) % 112);
      context.fillStyle = index % 5 === 0 ? '#78edff' : '#d8d2ff';
      context.globalAlpha = index % 5 === 0 ? 0.95 : 0.65;
      context.fillRect(x, y, index % 5 === 0 ? 3 : 2, index % 5 === 0 ? 3 : 2);
    }
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(255, 208, 37, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(255, 208, 25, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#f3d67c';
    context.beginPath();
    context.arc(255, 208, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8bb6d8';
    context.font = '11px monospace';
    context.fillText('POSADAS 27°', 365, 264);
  } else if (form === 'credentials') {
    context.fillStyle = '#ffd078';
    context.font = 'bold 24px sans-serif';
    context.fillText('ARCHIVO ESTELAR', 36, 103);
    context.fillStyle = '#b6c7d8';
    context.font = '12px monospace';
    context.fillText('TÍTULOS  /  FORMACIÓN  /  LSA', 38, 128);
    context.fillStyle = '#102238';
    context.fillRect(36, 151, 428, 130);
    [
      'Lic. Arte Digital · TECH',
      'Máster IA en Diseño · TECH',
      'Web · React · JavaScript · Coderhouse',
      'Intérprete LSA · UNaM Humanidades',
    ].forEach((line, index) => {
      const y = 174 + index * 27;
      context.fillStyle = ['#ffd078', '#84e8ff', '#f5a7d5', '#bda2ff'][index];
      context.beginPath();
      context.arc(52, y - 4, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e5edf7';
      context.font = '12px sans-serif';
      context.fillText(line, 66, y);
    });
  } else {
    context.fillStyle = '#ffd078';
    context.font = 'bold 25px sans-serif';
    context.fillText('GABY EDWIN', 36, 106);
    context.fillStyle = '#b6c7d8';
    context.font = '13px monospace';
    context.fillText('ARTE DIGITAL  /  FRONTEND  /  IA', 38, 130);
    context.fillStyle = '#102238';
    context.fillRect(36, 155, 276, 118);
    context.fillStyle = '#77dce4';
    context.font = '12px monospace';
    context.fillText('FORMACIÓN', 52, 180);
    context.fillStyle = '#d7e2ed';
    context.font = '12px sans-serif';
    context.fillText('Arte Digital & Multimedia', 52, 207);
    context.fillText('Inteligencia Artificial en Diseño', 52, 232);
    context.fillStyle = '#e8a35f';
    context.fillRect(336, 162, 128, 100);
    context.fillStyle = '#ffe0a8';
    context.font = 'bold 17px monospace';
    context.fillText('UI / UX', 363, 204);
    context.fillText('AI', 382, 234);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createCurvedPanelGeometry(width, height, sphereRadius, offset) {
  const surfaceRadius = sphereRadius + offset;
  const geometry = new PlaneGeometry(width, height, 16, 16);
  const positions = geometry.attributes.position;

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    positions.setZ(index, Math.sqrt(Math.max(0, surfaceRadius ** 2 - x ** 2 - y ** 2)));
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function InteriorDiorama({ radius, color, form, paused }) {
  const hologramRef = useRef(null);
  const materialRef = useRef(null);
  const texture = useMemo(() => createPortalPreviewTexture(form, color), [form, color]);
  const panelGeometry = useMemo(
    () => createCurvedPanelGeometry(radius * 1.12, radius * 0.7, radius, radius * 0.025),
    [radius],
  );
  const frameGeometry = useMemo(
    () => createCurvedPanelGeometry(radius * 1.16, radius * 0.74, radius, radius * 0.045),
    [radius],
  );

  useEffect(() => () => {
    texture.dispose();
    panelGeometry.dispose();
    frameGeometry.dispose();
  }, [frameGeometry, panelGeometry, texture]);

  useFrame(({ clock }) => {
    if (paused || !hologramRef.current || !materialRef.current) return;
    const elapsed = clock.elapsedTime;
    hologramRef.current.position.y = Math.sin(elapsed * 1.2 + radius) * radius * 0.025;
    hologramRef.current.rotation.y = Math.sin(elapsed * 0.45 + radius) * 0.035;
    materialRef.current.emissiveIntensity = 0.42 + (Math.sin(elapsed * 2 + radius) + 1) * 0.12;
  });

  return (
    <group ref={hologramRef}>
      <mesh geometry={panelGeometry}>
        <meshStandardMaterial
          map={texture}
          color="#ffffff"
          emissive={color}
          emissiveIntensity={0.28}
          toneMapped={false}
          side={DoubleSide}
          transparent
          opacity={0.96}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={frameGeometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.55}
          side={DoubleSide}
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function OrbitingPortal({ position, speed, paused, focusRef, onClick, onPointerOver, onPointerOut, spiralAmplitude = 0.12, spiralPhase = 0, children }) {
  const orbitRef = useRef(null);
  const planetPositionRef = useRef(null);
  const radius = Math.hypot(position[0], position[1]);
  const initialAngle = Math.atan2(position[1], position[0]);

  useFrame((_, delta) => {
    if (orbitRef.current && !paused) {
      orbitRef.current.rotation.z += delta * speed;
      if (planetPositionRef.current) {
        planetPositionRef.current.position.x =
          radius + spiralAmplitude * Math.sin(orbitRef.current.rotation.z - initialAngle + spiralPhase);
      }
    }
  });

  return (
    <group ref={orbitRef} rotation={[0, 0, initialAngle]}>
      <group
        ref={planetPositionRef}
        position={[radius, 0, position[2]]}
      >
        <group
          ref={focusRef}
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerOut={onPointerOut}
        >
          {children}
        </group>
      </group>
    </group>
  );
}

function Planet({ color, radius, emissiveIntensity, seed, form = 'sphere', paused }) {
  const ringsRef = useRef(null);
  const planetRef = useRef(null);
  const materialRef = useRef(null);
  const hoveredRef = useRef(false);
  const rotationSpeedRef = useRef(1);
  const handlePointerOver = () => {
    hoveredRef.current = true;
  };
  const handlePointerOut = () => {
    hoveredRef.current = false;
  };

  useFrame((_, delta) => {
    if (paused) return;

    const speedSmoothing = 1 - Math.exp(-delta * 6);
    const targetSpeed = hoveredRef.current ? 0 : 1;
    rotationSpeedRef.current += (targetSpeed - rotationSpeedRef.current) * speedSmoothing;
    if (hoveredRef.current && rotationSpeedRef.current < 0.005) {
      rotationSpeedRef.current = 0;
    }

    if (planetRef.current) {
      const spinDirection = seed % 2 === 0 ? -1 : 1;
      const spinSpeed = 0.075 + (seed % 5) * 0.021;
      planetRef.current.rotation.y += delta * spinSpeed * spinDirection * rotationSpeedRef.current;
    }
    if (materialRef.current) {
      const targetIntensity = emissiveIntensity * 0.22 * (hoveredRef.current ? 1.65 : 1);
      materialRef.current.emissiveIntensity +=
        (targetIntensity - materialRef.current.emissiveIntensity) * (1 - Math.exp(-delta * 5));
    }
    if (ringsRef.current) {
      ringsRef.current.rotation.y += delta * 0.16 * rotationSpeedRef.current;
      if (!hoveredRef.current) {
        ringsRef.current.rotation.x = Math.sin(performance.now() * 0.00015) * 0.035;
      }
    }
  });

  return (
    <group>
      <group
        ref={planetRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <group>
          <InteriorDiorama radius={radius} color={color} form={form} paused={paused} />
          <mesh>
            <sphereGeometry args={[radius, 64, 64]} />
            <meshPhysicalMaterial
              ref={materialRef}
              color={color}
              emissive={color}
              emissiveIntensity={emissiveIntensity * 0.06}
              transparent
              opacity={0.24}
              depthWrite={false}
              roughness={0.1}
              metalness={0.08}
              transmission={0.9}
              thickness={1.2}
              ior={1.42}
              flatShading={form === 'crystal'}
            />
          </mesh>
          <mesh scale={1.14}>
            <sphereGeometry args={[radius, 48, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
          </mesh>
          <mesh scale={1.3}>
            <sphereGeometry args={[radius, 40, 40]} />
            <meshBasicMaterial color={color} transparent opacity={0.025} depthWrite={false} />
          </mesh>
        </group>
      </group>
      <group ref={ringsRef}>
        <mesh rotation={[Math.PI / 2.7, 0.18, 0]}>
          <torusGeometry args={[radius * 1.52, radius * 0.018, 8, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.58} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2.35, -0.22, 0.08]}>
          <torusGeometry args={[radius * 1.72, radius * 0.008, 8, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function ProjectTitlePreview({ title, role, category, accent, index, technologies }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { playSound } = useAppAudio();

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPreviewOpen(true)}
      onMouseLeave={() => setIsPreviewOpen(false)}
      onFocus={() => setIsPreviewOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPreviewOpen(false);
      }}
    >
      <h2 className="mb-2 text-3xl font-semibold leading-[0.98] tracking-[-0.06em] text-white sm:text-4xl">
        <button
          type="button"
          aria-expanded={isPreviewOpen}
          onClick={() => {
            setIsPreviewOpen(true);
            playSound('open');
          }}
          className="text-left transition-colors hover:text-white/75 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/70"
        >
          {title}
        </button>
      </h2>
      <p className="mb-4 text-[9px] uppercase tracking-[0.16em]" style={{ color: accent }}>
        {role}
      </p>
      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="absolute right-0 top-full z-50 w-full border border-white/15 bg-[#060914]/95 p-3 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          >
            <div
              className="relative mb-3 min-h-32 overflow-hidden border border-white/10 p-3"
              style={{ background: `linear-gradient(135deg, ${accent}20, #080b17 55%, ${accent}0a)` }}
            >
              <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-2 text-[8px] uppercase tracking-[0.2em] text-white/50">
                <span>{category}</span>
                <span>{index}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.2em]" style={{ color: accent }}>
                    {role}
                  </p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-white">{title}</p>
                </div>
                <span className="text-2xl leading-none" style={{ color: accent }} aria-hidden="true">↗</span>
              </div>
              <div className="absolute bottom-3 left-3 right-3 h-px bg-white/10" />
              <div className="absolute bottom-3 left-3 h-px w-1/3" style={{ backgroundColor: accent }} />
            </div>
            <p className="mb-2 text-[8px] uppercase tracking-[0.18em] text-white/45">Stack / enfoque</p>
            <motion.div
              variants={staggerContainerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-1.5"
            >
              {technologies.map((technology) => (
                <motion.span key={technology} variants={staggerItemVariants} className="border border-white/10 px-2 py-1 text-[9px] text-white/75">
                  {technology}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CameraFlight({
  activeModule,
  initialFocus,
  ready,
  resetKey,
  controlsRef,
  focusRefs,
  onFlightComplete,
  reducedMotion,
}) {
  const destinationRef = useRef(null);

  useEffect(() => {
    if (!ready) return;
    const focusKey = activeModule ?? initialFocus;
    const focusRef = focusRefs[focusKey];
    const target = new Vector3();
    const position = new Vector3();

    if (focusRef?.current) {
      focusRef.current.getWorldPosition(target);
      const isCore = focusKey === 'NUCLEO';
      const portalDistance = isCore ? 4.2 : 2.5;
      position.set(
        target.x,
        target.y + (isCore ? 0.7 : 0.35),
        target.z + portalDistance,
      );
    } else if (focusKey === 'NUCLEO') {
      target.set(0, 0, 0);
      position.set(0, 0.7, 4.2);
    } else {
      target.set(0, 0, 0);
      position.set(0, 6, 16);
    }

    destinationRef.current = { position, target };
  }, [activeModule, focusRefs, initialFocus, ready, resetKey]);

  useFrame(({ camera }, delta) => {
    const destination = destinationRef.current;
    const controls = controlsRef.current;
    if (!destination || !controls) return;

    if (reducedMotion) {
      camera.position.copy(destination.position);
      controls.target.copy(destination.target);
      controls.update();
      destinationRef.current = null;
      onFlightComplete(activeModule);
      return;
    }

    const smoothing = 1 - Math.exp(-delta * (initialFocus && !activeModule ? 5 : 2.5));
    camera.position.lerp(destination.position, smoothing);
    controls.target.lerp(destination.target, smoothing);
    controls.update();

    if (
      camera.position.distanceToSquared(destination.position) < 0.001 &&
      controls.target.distanceToSquared(destination.target) < 0.001
    ) {
      camera.position.copy(destination.position);
      controls.target.copy(destination.target);
      controls.update();
      destinationRef.current = null;
      onFlightComplete(activeModule);
    }
  });

  return null;
}

function ProjectCarousel({ selectedIndex, onSelect, children }) {
  const touchStartX = useRef(null);

  const selectRelative = (offset) => {
    onSelect((selectedIndex + offset + PROJECTS.length) % PROJECTS.length);
  };

  return (
    <section
      tabIndex={0}
      aria-label="Carrusel de proyectos. Usa las flechas izquierda y derecha para navegar."
      aria-roledescription="carrusel"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          selectRelative(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          selectRelative(1);
        } else if (event.key === 'Home') {
          event.preventDefault();
          onSelect(0);
        } else if (event.key === 'End') {
          event.preventDefault();
          onSelect(PROJECTS.length - 1);
        }
      }}
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current === null) return;
        const endX = event.changedTouches[0]?.clientX;
        if (endX === undefined) return;
        const distance = endX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(distance) < 45) return;
        selectRelative(distance < 0 ? 1 : -1);
      }}
      onTouchCancel={() => { touchStartX.current = null; }}
      className="touch-pan-y space-y-5 outline-none focus-visible:ring-2 focus-visible:ring-purple-200/70 focus-visible:ring-offset-4 focus-visible:ring-offset-[#070a14]"
    >
      {children}
    </section>
  );
}

export default function Galaxia({ isIntro = false, isEntered = false, style, onExitToRealWorld }) {
  const [activeModule, setActiveModule] = useState(null);
  const [flightModule, setFlightModule] = useState(null);
  const [isFlying, setIsFlying] = useState(isEntered);
  const [isOrbitPaused, setIsOrbitPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [showNavigationToast, setShowNavigationToast] = useState(false);
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCinematicExit, setIsCinematicExit] = useState(false);
  const [bloomIntensity, setBloomIntensity] = useState(0.42);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [dpr, setDpr] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1 : 1.5,
  );
  const [isPerformanceLow, setIsPerformanceLow] = useState(false);
  const {
    audioEnabled,
    audioError,
    audioLevel,
    playSound,
    toggleAudio,
    updateAudioListener,
  } = useAppAudio();
  const controlsRef = useRef(null);
  const canvasShellRef = useRef(null);
  const indexToggleRef = useRef(null);
  const dialogRef = useRef(null);
  const dialogCloseRef = useRef(null);
  const dialogTriggerRef = useRef(null);
  const toastDismissedRef = useRef(false);
  const secretClickRef = useRef({ count: 0, lastClick: 0 });
  const secretTimeoutRef = useRef(null);
  const coreRef = useRef(null);
  const moonRef = useRef(null);
  const projectsRef = useRef(null);
  const credentialsRef = useRef(null);
  const contactRef = useRef(null);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const focusRefs = useMemo(() => ({
    NUCLEO: coreRef,
    ASTROFOTOS: moonRef,
    PROYECTOS: projectsRef,
    CREDENCIALES: credentialsRef,
    CONTACTO: contactRef,
  }), []);
  const [isSecretActive, setIsSecretActive] = useState(false);
  const [emailCopyStatus, setEmailCopyStatus] = useState('');
  const areOrbitsPaused = isOrbitPaused || prefersReducedMotion;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  const registerSecretClick = useCallback(() => {
    const now = performance.now();
    const sequence = secretClickRef.current;
    if (now - sequence.lastClick > 900) sequence.count = 0;
    sequence.count += 1;
    sequence.lastClick = now;

    if (sequence.count < 3) return false;
    sequence.count = 0;
    if (secretTimeoutRef.current !== null) window.clearTimeout(secretTimeoutRef.current);
    setIsSecretActive(true);
    secretTimeoutRef.current = window.setTimeout(() => {
      setIsSecretActive(false);
      secretTimeoutRef.current = null;
    }, 4500);
    return true;
  }, []);

  const handleButterflySecretClick = useCallback(() => {
    registerSecretClick();
  }, [registerSecretClick]);

  useEffect(() => () => {
    if (secretTimeoutRef.current !== null) window.clearTimeout(secretTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (isIntro || toastDismissedRef.current) return undefined;

    setShowNavigationToast(true);
    const timeout = window.setTimeout(() => {
      toastDismissedRef.current = true;
      setShowNavigationToast(false);
    }, 7000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isIntro]);

  useEffect(() => {
    if (sceneReady) {
      const timeout = window.setTimeout(() => setIsLoading(false), 650);
      return () => window.clearTimeout(timeout);
    }

    const interval = window.setInterval(() => {
      setLoadingProgress((progress) => Math.min(94, progress + Math.max(1, (94 - progress) * 0.035)));
    }, 35);
    return () => window.clearInterval(interval);
  }, [sceneReady]);

  const openModule = useCallback((module) => {
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogTriggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    setEmailCopyStatus('');
    playSound('open');
    setActiveModule(null);
    setFlightModule(module);
    setIsFlying(true);
  }, [playSound]);
  const openIndexedModule = useCallback((module, projectIndex) => {
    if (typeof projectIndex === 'number') setSelectedProjectIndex(projectIndex);
    setIsIndexOpen(false);
    openModule(module);
    dialogTriggerRef.current = indexToggleRef.current;
  }, [openModule]);
  const finishSolarExit = useCallback(() => {
    onExitToRealWorld?.();
  }, [onExitToRealWorld]);
  const handleSunClick = useCallback((event) => {
    event.stopPropagation();
    setIsCinematicExit(true);
    setIsFlying(true);
  }, []);
  const handleObjectHover = (event) => {
    event?.stopPropagation();
    window.dispatchEvent(new CustomEvent('app:world-cursor', {
      detail: { active: true, x: event?.nativeEvent?.clientX, y: event?.nativeEvent?.clientY },
    }));
    playSound('hover');
  };
  const handleObjectPointerOut = () => {
    window.dispatchEvent(new CustomEvent('app:world-cursor', { detail: { active: false } }));
  };
  const closeModule = useCallback(() => {
    playSound('close');
    setActiveModule(null);
    setFlightModule(null);
    setIsFlying(true);
    window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
  }, [playSound]);
  const copyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText('00gabrielaedwin00@gmail.com');
      setEmailCopyStatus('Correo copiado al portapapeles.');
    } catch {
      setEmailCopyStatus('No se pudo copiar. Puedes seleccionar el correo y copiarlo manualmente.');
    }
  }, []);

  useEffect(() => {
    if (activeModule) dialogCloseRef.current?.focus();
  }, [activeModule]);
  const centerGalaxy = useCallback(() => {
    setIsIndexOpen(false);
    setActiveModule(null);
    setFlightModule(null);
    setIsFlying(true);
    setCameraResetKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      );
      if (isEditing || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (!prefersReducedMotion) setIsOrbitPaused((paused) => !paused);
      } else if (event.key.toLowerCase() === 'm') {
        toggleAudio();
      } else if (event.key === 'Escape') {
        if (activeModule || flightModule) closeModule();
        else if (isIndexOpen) setIsIndexOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModule, closeModule, flightModule, isIndexOpen, prefersReducedMotion, toggleAudio]);
  const handleFlightComplete = (module) => {
    if (module) {
      setActiveModule(module);
    }
    setIsFlying(false);
  };
  const displayedProgress = sceneReady ? 100 : loadingProgress;
  const handlePerformanceDecline = useCallback(() => {
    setDpr(1);
    setIsPerformanceLow(true);
  }, []);
  const handlePerformanceIncline = useCallback(() => {
    setDpr(window.matchMedia('(pointer: coarse)').matches ? 1.25 : 1.75);
    setIsPerformanceLow(false);
  }, []);

  return (
    <div
      style={style}
      className={`relative h-screen w-full select-none overflow-hidden ${isIntro ? 'bg-transparent' : 'bg-[#030008]'}`}
    >

      {/* Canvas 3D de la Galaxia */}
      <div
        ref={canvasShellRef}
        className="absolute inset-0"
        style={{ pointerEvents: isCinematicExit ? 'none' : 'auto' }}
      >
      <Canvas dpr={dpr} camera={{ position: [0, 6, 16], fov: 60 }}>
        <PerformanceMonitor
          flipflops={3}
          onDecline={handlePerformanceDecline}
          onIncline={handlePerformanceIncline}
        />
        <SpatialAudioListener updateAudioListener={updateAudioListener} />
        <CameraFlight
          activeModule={flightModule}
          initialFocus={isEntered ? 'NUCLEO' : null}
          ready={sceneReady}
          resetKey={cameraResetKey}
          controlsRef={controlsRef}
          focusRefs={focusRefs}
          onFlightComplete={handleFlightComplete}
          reducedMotion={prefersReducedMotion}
        />
        <CinematicExit
          active={isCinematicExit}
          canvasRef={canvasShellRef}
          onBloomChange={setBloomIntensity}
          onComplete={finishSolarExit}
          reducedMotion={prefersReducedMotion}
        />
        <OrbitControls
          ref={controlsRef}
          makeDefault
          autoRotate={false}
          enableRotate={true}
          enablePan={false}
          enableZoom={true}
          enableDamping={true}
          enabled={!isFlying}
          dampingFactor={0.05}
          minDistance={2}
          maxDistance={45}
        />
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={2.5} color="#ff7b00" />
        <pointLight position={[-10, -10, -10]} intensity={1.2} color="#00f2fe" />

        {!isIntro && (
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.4}
              luminanceSmoothing={0.22}
              intensity={isCinematicExit ? bloomIntensity : isPerformanceLow ? 0.18 : 0.42}
              mipmapBlur={!isPerformanceLow}
            />
            {!isPerformanceLow && <ChromaticAberration offset={CHROMATIC_ABERRATION_OFFSET} />}
          </EffectComposer>
        )}
        <SceneReady onReady={() => setSceneReady(true)} />
        <Butterfly
          isEntered={isEntered}
          audioLevel={audioLevel}
          onSecretClick={handleButterflySecretClick}
          reducedMotion={prefersReducedMotion}
          exitToCamera={isCinematicExit}
        />
        <GoldenSecretParticles active={isSecretActive && !prefersReducedMotion} paused={prefersReducedMotion} />

        <group visible={!isIntro}>
        <CosmicBackdrop paused={prefersReducedMotion} />

        <Suspense fallback={null}>
          <group ref={coreRef} onClick={handleSunClick} onPointerOver={handleObjectHover} onPointerOut={handleObjectPointerOut}>
            <Earth paused={prefersReducedMotion} />
          </group>
          <OrbitingMoon
            paused={areOrbitsPaused || isFlying || activeModule === 'ASTROFOTOS'}
            focusRef={moonRef}
            onSelect={() => openModule('ASTROFOTOS')}
            onPointerOver={handleObjectHover}
            onPointerOut={handleObjectPointerOut}
          />
        </Suspense>

        <OrbitingPortal
          position={[-5.7, 2.93, 0.55]}
          speed={0.071}
          paused={areOrbitsPaused}
          spiralPhase={Math.PI}
          focusRef={projectsRef}
          onClick={() => {
            setSelectedProjectIndex(0);
            openModule('PROYECTOS');
          }}
          onPointerOver={handleObjectHover}
          onPointerOut={handleObjectPointerOut}
        >
          <Planet color="#a855f7" radius={0.9} emissiveIntensity={0.5} seed={4} metalness={0.72} form="crystal" paused={prefersReducedMotion} />
          <ProjectOrbitCards
            paused={areOrbitsPaused}
            onSelect={(index) => {
              setSelectedProjectIndex(index);
              openModule('PROYECTOS');
            }}
            onPointerOver={handleObjectHover}
            onPointerOut={handleObjectPointerOut}
          />
        </OrbitingPortal>

        <OrbitingPortal
          position={[6.23, -3.72, -0.8]}
          speed={0.043}
          paused={areOrbitsPaused}
          spiralPhase={Math.PI * 1.5}
          focusRef={credentialsRef}
          onClick={() => openModule('CREDENCIALES')}
          onPointerOver={handleObjectHover}
          onPointerOut={handleObjectPointerOut}
        >
          <Planet color="#ffd078" radius={0.82} emissiveIntensity={0.55} seed={5} form="credentials" paused={prefersReducedMotion} />
        </OrbitingPortal>

        <OrbitingPortal
          position={[-0.3, 8.2, -0.55]}
          speed={-0.026}
          paused={areOrbitsPaused}
          spiralPhase={Math.PI * 0.75}
          focusRef={contactRef}
          onClick={() => openModule('CONTACTO')}
          onPointerOver={handleObjectHover}
          onPointerOut={handleObjectPointerOut}
        >
          <CommunicationSatellite />
        </OrbitingPortal>

        </group>
      </Canvas>
      </div>

      {!isIntro && (
        <>
          <button
            type="button"
            data-cursor
            onClick={handleSunClick}
            aria-label="Volver al sendero"
            className="fixed bottom-6 left-4 z-[60] flex h-11 min-h-11 w-11 items-center justify-center border border-white/15 bg-[#050817]/80 font-mono text-base text-white/80 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl transition hover:border-cyan-100/45 hover:bg-[#050817]/90 hover:text-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 sm:left-1/2 sm:h-auto sm:w-auto sm:-translate-x-1/2 sm:px-4 sm:py-2 sm:text-[10px]"
          >
            <span className="sm:hidden" aria-hidden="true">←</span>
            <span className="hidden sm:inline">← VOLVER AL SENDERO</span>
          </button>
          <nav
            aria-label="Zonas principales"
            className="absolute left-1/2 top-4 z-[70] flex w-[min(94vw,34rem)] -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-white/10 bg-[#050817]/80 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:top-5 sm:gap-2 sm:p-2"
          >
            {[
              ['PROYECTOS', 'Proyectos'],
              ['ASTROFOTOS', 'Astrofotos'],
              ['CREDENCIALES', 'Credenciales'],
              ['CONTACTO', 'Contacto'],
            ].map(([module, label]) => (
              <button
                key={module}
                type="button"
                data-cursor
                onClick={() => {
                  if (module === 'PROYECTOS') setSelectedProjectIndex(0);
                  openModule(module);
                }}
                className="min-h-11 flex-1 rounded-full border border-transparent px-2 text-[9px] font-medium tracking-wide text-white/80 transition hover:border-cyan-100/25 hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 sm:px-4 sm:text-[10px]"
              >
                {label}
              </button>
            ))}
          </nav>

          <AnimatePresence>
            {showNavigationToast && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute bottom-24 left-1/2 z-[70] flex w-[min(92vw,34rem)] -translate-x-1/2 items-start gap-3 border border-white/10 bg-[#050817]/85 px-4 py-3 font-mono text-[10px] leading-relaxed tracking-wide text-white/75 shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:text-xs"
                role="note"
                aria-label="Ayuda de navegación"
              >
                <p className="flex-1">
                  [ ✦ ] Explora los portales o abre el índice ≡ para ir directamente a cada sección y proyecto.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    toastDismissedRef.current = true;
                    setShowNavigationToast(false);
                  }}
                  aria-label="Descartar ayuda de navegación"
                  className="flex h-11 min-w-11 items-center justify-center border border-white/15 text-sm text-white/70 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                >
                  ×
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {audioError && (
            <p
              role="status"
              aria-live="polite"
              className="absolute bottom-[4.7rem] left-1/2 z-[70] w-max max-w-[90vw] -translate-x-1/2 border border-orange-200/15 bg-[#050817]/85 px-3 py-2 text-center font-mono text-[9px] text-orange-100/75 backdrop-blur-xl"
            >
              No se pudo activar el audio. Vuelve a intentarlo con ♫.
            </p>
          )}

          <div className="absolute bottom-5 right-5 z-[70] flex items-center gap-1 rounded-full border border-white/10 bg-[#050817]/80 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <button
              type="button"
              data-cursor
              onClick={toggleAudio}
              aria-label="Activar o silenciar audio ambiental"
              aria-pressed={audioEnabled}
              title={`Audio ${audioEnabled ? 'activado' : 'silenciado'} (M)`}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent font-mono text-sm text-white/75 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              ♫
            </button>
            <button
              type="button"
              data-cursor
              onClick={() => setIsOrbitPaused((paused) => !paused)}
              disabled={prefersReducedMotion}
              aria-label={prefersReducedMotion
                ? 'Movimiento reducido activado por la configuración del sistema'
                : areOrbitsPaused ? 'Reanudar órbitas planetarias' : 'Pausar órbitas planetarias'}
              aria-pressed={areOrbitsPaused}
              title={prefersReducedMotion
                ? 'Animaciones pausadas por preferencia del sistema'
                : `${areOrbitsPaused ? 'Reanudar' : 'Pausar'} órbita (Espacio)`}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent font-mono text-sm text-white/75 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {areOrbitsPaused ? '▶' : '⏸'}
            </button>
            <button
              type="button"
              data-cursor
              onClick={centerGalaxy}
              aria-label="Centrar cámara en la galaxia"
              title="Centrar vista"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent font-mono text-base text-white/75 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              ⌖
            </button>
            <button
              type="button"
              data-cursor
              ref={indexToggleRef}
              onClick={() => setIsIndexOpen((open) => !open)}
              aria-label={isIndexOpen ? 'Cerrar índice de portales' : 'Abrir índice de portales'}
              aria-expanded={isIndexOpen}
              aria-controls="portal-index"
              title="Índice de portales"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-transparent font-mono text-base text-white/75 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              ≡
            </button>
          </div>

          <AnimatePresence>
            {isIndexOpen && (
              <motion.nav
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                id="portal-index"
                aria-label="Índice alternativo del portfolio"
                className="absolute bottom-20 right-5 z-[70] max-h-[min(70vh,36rem)] w-[min(90vw,22rem)] overflow-y-auto border border-white/10 bg-[#050817]/95 p-3 font-mono shadow-[0_18px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl"
              >
                <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/45">Explorar por contenido</p>
                <button
                  type="button"
                  data-cursor
                  onClick={() => openIndexedModule('NUCLEO')}
                  className="flex min-h-11 w-full items-center justify-between border-t border-white/[0.07] px-3 py-3 text-left text-xs text-white/75 transition hover:bg-white/[0.04] hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                >
                  <span>Quién soy</span><span className="text-white/35">01 ↗</span>
                </button>
                <div className="border-t border-white/[0.07] py-2">
                  <p className="px-3 py-2 text-[9px] uppercase tracking-[0.16em] text-purple-100/60">Proyectos</p>
                  {PROJECTS.map((project, index) => (
                    <button
                      key={project.title}
                      type="button"
                      data-cursor
                      onClick={() => openIndexedModule('PROYECTOS', index)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-white/70 transition hover:bg-white/[0.04] hover:text-purple-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200"
                    >
                      <span>{project.title}</span>                      <span className="shrink-0 text-[10px] text-white/35">0{index + 2} →</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-cursor
                  onClick={() => openIndexedModule('ASTROFOTOS')}
                  className="flex min-h-11 w-full items-center justify-between border-t border-white/[0.07] px-3 py-3 text-left text-xs text-white/75 transition hover:bg-white/[0.04] hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                >
                  <span>Astrofotografía</span><span className="text-white/35">05 →</span>
                </button>
                {[
                  ['CREDENCIALES', 'Credenciales', '06'],
                  ['CONTACTO', 'Contacto', '07'],
                ].map(([module, label, index]) => (
                  <button
                    key={module}
                    type="button"
                    data-cursor
                    onClick={() => openIndexedModule(module)}
                    className="flex min-h-11 w-full items-center justify-between border-t border-white/[0.07] px-3 py-3 text-left text-xs text-white/75 transition hover:bg-white/[0.04] hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                  >
                    <span>{label}</span><span className="text-white/35">{index} →</span>
                  </button>
                ))}
              </motion.nav>
            )}
          </AnimatePresence>
        </>
      )}

      <AnimatePresence>
        {isLoading && !isIntro && !isEntered && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-[#030008] font-mono text-white"
            aria-label="Cargando experiencia galáctica"
            aria-live="polite"
          >
            <div className="w-[min(22rem,78vw)]">
              <p className="mb-2 text-center text-[10px] tracking-[0.35em] text-cyan-200/70">
                SISTEMA GALÁCTICO
              </p>
              <h2 className="mb-7 text-center text-2xl font-bold tracking-[0.18em]">
                GABY EDWIN
              </h2>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 via-cyan-300 to-cyan-100 shadow-[0_0_15px_#00f2fe]"
                  animate={{ width: `${displayedProgress}%` }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                />
              </div>
              <p className="mt-3 text-center text-[9px] tracking-[0.25em] text-cyan-100/60">
                {sceneReady ? 'UNIVERSO LISTO' : 'SINCRONIZANDO ESTRELLAS'} · {Math.round(displayedProgress)}%
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- PANEL LATERAL DE INFORMACIÓN --- */}
      <AnimatePresence>
        {activeModule && (
          <motion.aside
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeModule();
            }}
            className="absolute inset-0 z-[90] flex items-center justify-center bg-[#02040b]/65 p-4 backdrop-blur-sm sm:p-8"
          >
            <motion.section
              ref={dialogRef}
              initial={{ opacity: 0, y: 28, scale: 0.94, filter: 'blur(12px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(8px)' }}
              transition={{ type: 'spring', stiffness: 220, damping: 24, mass: 0.85 }}
              role="dialog"
              aria-modal="true"
              aria-label={`Ventana de ${activeModule}`}
              className={`relative max-h-[min(86vh,56rem)] ${activeModule === 'CONTACTO' ? 'w-[min(92vw,28rem)]' : 'w-[min(92vw,52rem)]'} overflow-y-auto border border-white/15 bg-[#070a14]/90 p-5 font-mono text-white shadow-[0_20px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl sm:p-8 md:p-10`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return;
                const focusableElements = event.currentTarget.querySelectorAll(
                  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];
                if (event.shiftKey && document.activeElement === firstElement) {
                  event.preventDefault();
                  lastElement?.focus();
                } else if (!event.shiftKey && document.activeElement === lastElement) {
                  event.preventDefault();
                  firstElement?.focus();
                }
              }}
            >
            <button 
              ref={dialogCloseRef}
              type="button"
              onClick={closeModule}
              aria-label="Cerrar portal y volver a la galaxia"
              className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center border border-white/15 px-3 py-2 font-mono text-xs text-white/75 transition-colors hover:border-white/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              [✕]
            </button>
            <div className="mb-7 flex items-center justify-between border-b border-white/10 pb-3 pr-16 text-[10px] uppercase tracking-[0.16em] text-white/50">
              <span>Portal / expediente</span>
              <span>{activeModule}</span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeModule}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              >
            {activeModule === 'NUCLEO' && (
              <div className="space-y-6">
                <header className="border-b border-orange-200/15 pb-5">
                  <p className="mb-3 text-[9px] uppercase tracking-[0.22em] text-orange-200/75">El núcleo / Quién soy</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Hola, soy Gaby</h2>
                  <p className="mt-2 text-sm text-orange-100/80">Artista digital y desarrolladora frontend.</p>
                </header>
                <section className="space-y-3">
                  <p className="text-sm leading-relaxed text-slate-200">
                    Uno la sensibilidad visual del arte digital con la lógica del código para crear experiencias web cuidadas, intuitivas y con personalidad.
                  </p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Mi formación en Arte Digital y Multimedia se complementa con experiencia en diseño UI/UX, desarrollo con React y gestión de proyectos creativos.
                  </p>
                </section>
                <section className="border-y border-white/10 py-4">
                  <h3 className="mb-3 text-[9px] uppercase tracking-[0.2em] text-orange-100/55">Lo que inspira mi trabajo</h3>
                  <p className="text-xs leading-relaxed text-slate-300">
                    La observación del cielo, la naturaleza y las mariposas alimentan mi curiosidad y mi manera de pensar interfaces: con atención al detalle, movimiento y armonía.
                  </p>
                </section>
                <div className="flex flex-wrap gap-2" aria-label="Áreas de trabajo">
                  {['Frontend · React', 'Diseño UI/UX', 'Arte digital', 'Experiencias interactivas'].map((area) => (
                    <span key={area} className="border border-orange-200/15 bg-orange-100/[0.03] px-3 py-1.5 text-[9px] text-orange-50/75">
                      {area}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    data-cursor
                    onClick={() => {
                      setSelectedProjectIndex(0);
                      openModule('PROYECTOS');
                    }}
                    className="min-h-11 border border-orange-200/30 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-orange-100 transition-colors hover:border-orange-100/70 hover:bg-orange-200/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200"
                  >
                    Explorar proyectos →
                  </button>
                  <button
                    type="button"
                    data-cursor
                    onClick={() => openModule('CONTACTO')}
                    className="min-h-11 border border-white/15 px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-white/75 transition-colors hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                  >
                    Hablemos ↗
                  </button>
                </div>
              </div>
            )}

            {activeModule === 'ASTROFOTOS' && (
              <div className="space-y-6">
                <header className="border-b border-cyan-200/10 pb-5">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Archivo lunar / 03</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Astrofotografía</h2>
                  <p className="mt-2 text-sm text-slate-300">Una colección personal de observaciones del cielo nocturno.</p>
                </header>
                <section
                  role="status"
                  className="border border-cyan-100/15 bg-gradient-to-br from-cyan-300/[0.07] via-white/[0.02] to-transparent p-6 text-center sm:p-9"
                >
                  <span className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-cyan-100/20 text-2xl text-cyan-100/80" aria-hidden="true">
                    ✦
                  </span>
                  <h3 className="text-lg font-medium text-white">La colección está en preparación</h3>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
                    Este proyecto todavía no incluye astrofotografías personales. Cuando agregues tus capturas, aparecerán aquí sin confundirlas con las texturas ilustrativas de la escena.
                  </p>
                </section>
                <p className="border-l border-cyan-100/25 pl-4 text-[10px] leading-relaxed text-white/45">
                  Texturas cartográficas de la escena: ejemplos de planetas de Three.js. No son fotografías personales.
                </p>
              </div>
            )}

            {activeModule === 'CREDENCIALES' && (
              <div className="space-y-6">
                <header className="border-b border-amber-200/10 pb-5">
                  <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-amber-200/70">Archivo estelar / 02</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Títulos & credenciales</h2>
                  <p className="mt-2 text-sm text-slate-300">Formación académica y certificaciones.</p>
                </header>
                <section>
                  <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-amber-100/65">Títulos universitarios</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Licenciatura en Arte Digital y Multimedia', 'TECH Universidad Tecnológica'],
                      ['Máster en Inteligencia Artificial en Diseño', 'TECH'],
                    ].map(([title, institution]) => (
                      <article key={title} className="border border-white/10 bg-white/[0.025] p-4">
                        <h4 className="text-sm leading-relaxed text-slate-100">{title}</h4>
                        <p className="mt-2 text-xs leading-relaxed text-amber-100/70">{institution}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-amber-100/65">Certificaciones & formación</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Desarrollo Web', 'Coderhouse'],
                      ['React.js', 'Coderhouse'],
                      ['JavaScript', 'Coderhouse'],
                      ['Intérprete certificada de LSA', 'UNaM · Humanidades'],
                    ].map(([title, institution]) => (
                      <article key={title} className="border border-white/10 bg-white/[0.025] p-4">
                        <h4 className="text-sm text-slate-100">{title}</h4>
                        <p className="mt-2 text-xs leading-relaxed text-amber-100/70">{institution}</p>
                      </article>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-300">Graduada en el top 10% de su cohorte.</p>
                </section>
              </div>
            )}

            {activeModule === 'PROYECTOS' && (
              <ProjectCarousel selectedIndex={selectedProjectIndex} onSelect={setSelectedProjectIndex}>
                <header className="border-b border-purple-200/10 pb-4">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-purple-200/70">Órbita creativa / 01</p>
                  <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">Carrusel de proyectos</h2>
                  <p className="mt-2 text-sm text-slate-300">Explora el alcance, mi aporte y las herramientas de cada proyecto.</p>
                </header>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={selectedProjectIndex}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="min-h-52 border border-white/10 bg-gradient-to-br from-purple-400/10 via-[#070a14] to-cyan-300/5 p-5 sm:p-7"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <div className="mb-6 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-purple-100/70">
                        {PROJECTS[selectedProjectIndex].category}
                      </span>
                      <span className="font-mono text-[10px] text-white/35">
                        0{selectedProjectIndex + 1} / 0{PROJECTS.length}
                      </span>
                    </div>
                    <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                      {PROJECTS[selectedProjectIndex].title}
                    </h3>
                    <div className="mt-5 grid gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
                      <section>
                        <h4 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/50">Alcance</h4>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {PROJECTS[selectedProjectIndex].description}
                        </p>
                      </section>
                      <section>
                        <h4 className="mb-2 text-[10px] uppercase tracking-[0.16em] text-white/50">Mi aporte</h4>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {PROJECTS[selectedProjectIndex].contribution}
                        </p>
                      </section>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {PROJECTS[selectedProjectIndex].technologies.map((technology) => (
                        <span
                          key={technology}
                          className="border border-white/10 px-3 py-1.5 text-xs text-white/75"
                        >
                          {technology}
                        </span>
                      ))}
                    </div>
                    {PROJECTS[selectedProjectIndex].url && (
                      <a
                        href={PROJECTS[selectedProjectIndex].url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-6 inline-flex min-h-11 items-center border border-purple-200/40 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-purple-100 transition hover:border-purple-100/80 hover:bg-purple-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200"
                      >
                        Visitar proyecto ↗
                      </a>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-cursor
                    onClick={() => setSelectedProjectIndex((index) => (index + PROJECTS.length - 1) % PROJECTS.length)}
                    aria-label="Ver proyecto anterior"
                    className="flex min-h-11 min-w-11 items-center justify-center border border-white/15 px-2 py-2 text-xs text-white/80 transition hover:border-purple-200/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 sm:px-4 sm:text-sm"
                  >
                    <span className="sm:hidden" aria-hidden="true">←</span>
                    <span className="hidden sm:inline">← Anterior</span>
                  </button>
                  <div className="flex gap-0 sm:gap-2" aria-label="Seleccionar proyecto">
                    {PROJECTS.map((project, index) => (
                      <button
                        key={project.title}
                        type="button"
                        data-cursor
                        onClick={() => setSelectedProjectIndex(index)}
                        aria-label={`Ver ${project.title}`}
                        aria-pressed={selectedProjectIndex === index}
                        className="group flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 sm:h-11 sm:w-11"
                      >
                        <span
                          aria-hidden="true"
                          className={`h-2.5 w-2.5 rounded-full transition ${selectedProjectIndex === index ? 'bg-purple-200 shadow-[0_0_12px_rgba(216,180,254,0.75)]' : 'bg-white/25 group-hover:bg-white/60'}`}
                        />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-cursor
                    onClick={() => setSelectedProjectIndex((index) => (index + 1) % PROJECTS.length)}
                    aria-label="Ver proyecto siguiente"
                    className="flex min-h-11 min-w-11 items-center justify-center border border-white/15 px-2 py-2 text-xs text-white/80 transition hover:border-purple-200/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 sm:px-4 sm:text-sm"
                  >
                    <span className="sm:hidden" aria-hidden="true">→</span>
                    <span className="hidden sm:inline">Siguiente →</span>
                  </button>
                </div>
              </ProjectCarousel>
            )}

            {/* CONTENIDO MÓDULO SN (E-commerce & Páginas) */}
            {activeModule === 'SN' && (
              <div className="space-y-4">
                <span className="block border-b border-cyan-200/10 pb-3 text-[9px] uppercase tracking-[0.2em] text-cyan-100/60">
                  // Desarrollo web · E-commerce
                </span>
                <ProjectTitlePreview
                  title="Nowin Especias"
                  role="Frontend · Comercio digital"
                  category="E-commerce"
                  accent="#00f2fe"
                  index="01 / 05"
                  technologies={['React', 'Vite', 'Tailwind CSS', 'JavaScript', 'Firebase']}
                />
                <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-300">
                  Plataforma e-commerce y panel administrativo para la gestión de ventas e inventario.
                </p>
                <motion.div
                  variants={staggerContainerVariants}
                  initial="hidden"
                  animate="visible"
                  className="flex flex-wrap gap-2 border-b border-white/10 pb-5"
                >
                  {['React', 'Vite', 'Tailwind CSS', 'JavaScript', 'Firebase'].map((technology) => (
                    <motion.span key={technology} variants={staggerItemVariants} className="border border-cyan-200/15 px-2 py-1 text-[9px] text-cyan-100/80">
                      {technology}
                    </motion.span>
                  ))}
                </motion.div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <a
                    href="https://nowinespecias.com"
                    target="_blank"
                    rel="noreferrer"
                    className="border border-cyan-200/30 px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:border-cyan-100/70 hover:bg-cyan-200/5"
                  >
                    Visitar nowinespecias.com ↗
                  </a>
                  <button 
                    onClick={closeModule}
                    className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {/* CONTENIDO MÓDULO SNJA (Artes del Fuego) */}
            {activeModule === 'SNJA' && (
              <div className="space-y-4">
                <span className="block border-b border-orange-200/10 pb-3 text-[9px] uppercase tracking-[0.2em] text-orange-100/60">
                  // Módulo Gestión & Cerámica
                </span>
                <ProjectTitlePreview
                  title="Artes del Fuego"
                  role="Administración · Coordinación operativa"
                  category="Gestión & cerámica"
                  accent="#ff9b70"
                  index="02 / 05"
                  technologies={['React', 'Vite', 'Tailwind CSS', 'Firebase', 'Inventario']}
                />
                <p className="border-t border-white/10 pt-4 text-xs leading-relaxed text-slate-300">
                  Encargada Administrativa y Coordinación Operativa en el Parque del Conocimiento.
                </p>
                <motion.div
                  variants={staggerContainerVariants}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2"
                >
                  <motion.div variants={staggerItemVariants} className="bg-[#070a14] p-3">
                    <h3 className="mb-2 text-[8px] uppercase tracking-[0.18em] text-orange-100/55">Aplicación web</h3>
                    <p className="text-[10px] leading-relaxed text-slate-300">Sistema de inventario y gestión de stock desarrollado en React, Vite, Tailwind CSS y Firebase.</p>
                  </motion.div>
                  <motion.div variants={staggerItemVariants} className="bg-[#070a14] p-3">
                    <h3 className="mb-2 text-[8px] uppercase tracking-[0.18em] text-orange-100/55">Enfoque artístico</h3>
                    <p className="text-[10px] leading-relaxed text-slate-300">Cerámica de alta temperatura (gres), alfarería y gestión de talleres culturales.</p>
                  </motion.div>
                </motion.div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <a
                    href="https://artesdelfuego.vercel.app"
                    target="_blank"
                    rel="noreferrer"
                    className="border border-orange-200/30 px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-orange-100 transition-colors hover:border-orange-100/70 hover:bg-orange-200/5"
                  >
                    artesdelfuego.vercel.app ↗
                  </a>
                  <button 
                    onClick={closeModule}
                    className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {/* CONTENIDO MÓDULO SX (Laboratorio Creativo) */}
            {activeModule === 'SX' && (
              <div>
                <span className="text-[10px] text-purple-400 tracking-[0.3em] uppercase block mb-1">
                  // Universo personal · ciencia & arte
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Pasiones & Ciencia
                </h2>
                <motion.div
                  variants={staggerContainerVariants}
                  initial="hidden"
                  animate="visible"
                  className="mb-6 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2"
                >
                  <motion.section variants={staggerItemVariants} className="bg-[#070a14] p-4">
                    <h3 className="mb-2 text-[9px] uppercase tracking-[0.2em] text-purple-200/65">Astronomía</h3>
                    <p className="text-[11px] leading-relaxed text-slate-300">Observación estelar y lunar con telescopio Maksutov-Cassegrain, montado en ecuatorial calibrada a la latitud de Posadas (~27°).</p>
                  </motion.section>
                  <motion.section variants={staggerItemVariants} className="bg-[#070a14] p-4">
                    <h3 className="mb-2 text-[9px] uppercase tracking-[0.2em] text-purple-200/65">Lengua de Señas · LSA</h3>
                    <p className="text-[11px] leading-relaxed text-slate-300">Intérprete certificada y profesional de Lengua de Señas Argentina (UNaM Humanidades).</p>
                  </motion.section>
                  <motion.section variants={staggerItemVariants} className="bg-[#070a14] p-4 sm:col-span-2">
                    <h3 className="mb-2 text-[9px] uppercase tracking-[0.2em] text-purple-200/65">Naturaleza & arte</h3>
                    <p className="text-[11px] leading-relaxed text-slate-300">Conexión profunda con el monte, el diseño digital, la cartografía estelar y la filosofía de trabajo de autor.</p>
                  </motion.section>
                </motion.div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => openModule('CONTACTO')}
                    className="border border-purple-200/25 px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-purple-100/80 transition-colors hover:border-purple-100/60 hover:bg-purple-200/5"
                  >
                    Portal de contacto →
                  </button>
                  <button 
                    onClick={closeModule}
                    className="px-3 py-2 text-[9px] uppercase tracking-[0.12em] text-white/45 transition-colors hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {activeModule === 'CONTACTO' && (
              <div className="space-y-4">
                <header className="mb-5 border-b border-cyan-200/10 pb-4">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100/70">Satélite de comunicaciones</p>
                  <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">Conectemos</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">Elige cómo te gustaría iniciar la conversación.</p>
                </header>
                <section className="border border-cyan-200/20 bg-cyan-200/[0.04] p-4">
                  <h3 className="text-[10px] uppercase tracking-[0.16em] text-cyan-100/65">Correo electrónico</h3>
                  <p className="mt-2 break-all text-sm leading-relaxed text-white">
                    00gabrielaedwin00@gmail.com
                  </p>
                  <button
                    type="button"
                    data-cursor
                    onClick={copyEmail}
                    className="mt-4 inline-flex min-h-11 items-center border border-cyan-200/35 px-4 py-2 text-xs text-cyan-50 transition hover:border-cyan-100/75 hover:bg-cyan-100/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                  >
                    Copiar correo
                  </button>
                  {emailCopyStatus && (
                    <p className="mt-3 text-xs leading-relaxed text-cyan-100/80" role="status" aria-live="polite">
                      {emailCopyStatus}
                    </p>
                  )}
                </section>
                <a
                  href="mailto:00gabrielaedwin00@gmail.com"
                  className="group flex min-h-12 items-center justify-between border border-orange-200/25 bg-orange-200/[0.04] px-4 py-3 text-sm text-orange-50/90 transition hover:border-orange-200/60 hover:text-white hover:shadow-[0_0_28px_rgba(251,146,60,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-200"
                >
                  <span>Redactar correo</span><span aria-hidden="true" className="text-orange-100/60 transition group-hover:text-orange-100">↗</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/edwin-gabriela-evelyn"
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-12 items-center justify-between border border-cyan-200/15 bg-cyan-200/[0.03] px-4 py-3 text-sm text-cyan-50/85 transition hover:border-cyan-200/50 hover:text-white hover:shadow-[0_0_28px_rgba(34,211,238,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
                >
                  <span>LinkedIn · abrir perfil</span><span aria-hidden="true" className="text-cyan-100/50 transition group-hover:text-cyan-100">↗</span>
                </a>
                <a
                  href="https://wa.me/?text=Hola%2C%20Gaby.%20Me%20gustar%C3%ADa%20ponerme%20en%20contacto."
                  target="_blank"
                  rel="noreferrer"
                  className="group flex min-h-12 items-center justify-between border border-emerald-200/15 bg-emerald-200/[0.03] px-4 py-3 text-sm text-emerald-50/85 transition hover:border-emerald-200/50 hover:text-white hover:shadow-[0_0_28px_rgba(52,211,153,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-200"
                >
                  <span>WhatsApp · elegir destinatario</span><span aria-hidden="true" className="text-emerald-100/50 transition group-hover:text-emerald-100">↗</span>
                </a>
                <p className="text-xs leading-relaxed text-slate-300">
                  El correo abre tu aplicación de email. LinkedIn abrirá el perfil; WhatsApp abrirá un mensaje para que elijas destinatario.
                </p>
              </div>
            )}

              </motion.div>
            </AnimatePresence>
            </motion.section>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSecretActive && (
          <>
            <motion.div
              key="secret-flash"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.78, 0.18, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-0 z-[95] bg-[radial-gradient(ellipse_at_center,rgba(255,214,125,0.5)_0%,rgba(255,161,55,0.12)_35%,transparent_72%)]"
              aria-hidden="true"
            />
            <motion.aside
              key="secret-card"
              initial={{ opacity: 0, y: 18, scale: 0.96, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 240, damping: 24 }}
              className="pointer-events-none absolute left-1/2 top-1/2 z-[100] w-[min(88vw,34rem)] -translate-x-1/2 -translate-y-1/2 border border-amber-100/25 bg-[#090811]/90 px-6 py-7 text-center font-mono shadow-[0_0_70px_rgba(255,183,74,0.16)] backdrop-blur-xl sm:px-10"
              role="status"
              aria-live="polite"
            >
              <span className="mb-4 block text-[9px] tracking-[0.32em] text-amber-200/60">
                SELLO DE AUTOR · 03/03
              </span>
              <p className="text-sm leading-relaxed tracking-wide text-amber-50 sm:text-base">
                [ CÓDIGO &amp; ARTE ] — El universo no se descubre, se programa con alma
              </p>
              <span className="mt-5 block text-[8px] tracking-[0.2em] text-amber-100/35">
                DESTELLO OCULTO ACTIVADO
              </span>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}