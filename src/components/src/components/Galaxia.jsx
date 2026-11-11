import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { AnimatePresence, motion } from 'framer-motion';
import { LocateFixed, Pause, Play, Sparkles } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import AudioToggleButton from '../../../audio/AudioToggleButton';
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
} from 'three';
import { useAppAudio } from '../../../audio/AudioContext';
import Butterfly from '../../Butterfly';

const MODULE_LABELS = {
  NUCLEO: 'Perfil & Stack',
  PROYECTOS: 'Proyectos',
  ASTROFOTOS: 'Astrofotografía',
  CREDENCIALES: 'Formación y certificaciones',
  CONTACTO: 'Contacto',
};
gsap.registerPlugin(ScrollTrigger);

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
    title: 'Interfaces & Dashboards',
    category: 'Diseño UI/UX',
    contribution: 'Diseño UI/UX · prototipado interactivo.',
    description: 'Prototipos interactivos y componentes animados inspirados en la astronomía y la observación estelar.',
    technologies: ['Figma', 'Framer Motion', 'GSAP'],
    accent: '#c084fc',
  },
  {
    title: 'Astronomía aficionada',
    category: 'Astronomía & divulgación',
    contribution: 'Exploración y divulgación astronómica.',
    description: 'Sitio web dedicado a la astronomía aficionada y a la exploración del cielo.',
    technologies: ['Astronomía', 'Divulgación', 'Web'],
    url: 'https://00gabriela00edwin.github.io/Astronom-a-aficionada/',
    accent: '#7dd3fc',
  },
];
const staggerContainerVariants = {
  hidden: {},
  visible: { transition: { delayChildren: 0.06, staggerChildren: 0.075 } },
};

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
  const meshRef = useRef(null);
  const materialRef = useRef(null);
  const elapsedRef = useRef(0);
  const geometry = useMemo(() => createGoldenBurstGeometry(), []);
  const starGeometry = useMemo(() => new SphereGeometry(1, 6, 4), []);
  const starMaterial = useMemo(() => new MeshBasicMaterial({
    color: '#ffd879',
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const transform = useMemo(() => ({
    position: new Vector3(),
    scale: new Vector3(),
    rotation: new Quaternion(),
    matrix: new Matrix4(),
  }), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const positions = geometry.getAttribute('position');
    const { position, scale, rotation, matrix } = transform;
    for (let index = 0; index < positions.count; index += 1) {
      position.fromBufferAttribute(positions, index);
      scale.setScalar(0.07);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [geometry, transform]);

  useEffect(() => () => {
    geometry.dispose();
    starGeometry.dispose();
    starMaterial.dispose();
  }, [geometry, starGeometry, starMaterial]);

  useEffect(() => {
    if (active) elapsedRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active || paused) return;
    elapsedRef.current += delta;
    const elapsed = elapsedRef.current;
    const progress = Math.min(1, Math.max(0, elapsed / 2.6));
    if (meshRef.current) {
      meshRef.current.scale.setScalar(0.28 + progress * 1.65);
      meshRef.current.rotation.y = elapsed * 0.28;
      meshRef.current.rotation.x = elapsed * 0.12;
    }
    if (materialRef.current) materialRef.current.opacity = Math.max(0, 1 - progress);
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[starGeometry, starMaterial, geometry.getAttribute('position').count]}
      visible={active}
      frustumCulled={false}
    />
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
          <SceneLabel position={[0, 2.1, 0]}>Astrofotografía</SceneLabel>
        </group>
      </group>
    </group>
  );
}

const DIGITAL_GLYPHS = '01{}[]=>();,.<>/constuseFrame';

function CodeRainCanvas({ paused }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) throw new Error('No se pudo crear el fondo de código de la galaxia.');

    const fontSize = 12;
    const lineHeight = 20;
    const columnWidth = 30;
    const streams = [];
    let width = 0;
    let height = 0;
    let animationFrame = 0;
    let previousTime = 0;

    const randomGlyph = () => DIGITAL_GLYPHS[Math.floor(Math.random() * DIGITAL_GLYPHS.length)];
    const createStream = (startAtRandomHeight = true) => ({
      y: startAtRandomHeight ? Math.random() * height : -Math.random() * height * 0.35,
      speed: 14 + Math.random() * 18,
      glyphs: Array.from({ length: 10 }, randomGlyph),
      tint: Math.random() < 0.7 ? '92, 192, 181' : '185, 164, 112',
    });

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textBaseline = 'top';
      streams.length = 0;
      for (let index = 0; index < Math.ceil(width / columnWidth); index += 1) {
        streams.push(createStream());
      }
    };

    const renderFrame = (time) => {
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
      previousTime = time;
      context.clearRect(0, 0, width, height);

      streams.forEach((stream, column) => {
        stream.y += stream.speed * delta;
        for (let index = 0; index < stream.glyphs.length; index += 1) {
          const glyphY = stream.y - index * lineHeight;
          if (glyphY < -lineHeight || glyphY > height) continue;
          const opacity = 0.15 + 0.07 * (1 - index / stream.glyphs.length);
          context.fillStyle = `rgba(${stream.tint}, ${opacity})`;
          context.fillText(stream.glyphs[index], column * columnWidth, glyphY);
        }
        if (stream.y - stream.glyphs.length * lineHeight > height) {
          streams[column] = createStream(false);
        }
      });

      if (!paused) animationFrame = window.requestAnimationFrame(renderFrame);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [paused]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
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
    context.fillText('PROYECTOS', 34, 100);
    context.fillStyle = '#b6c7d8';
    context.font = '12px monospace';
    context.fillText('DISEÑO  /  DESARROLLO  /  WEB', 36, 122);
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
    context.fillRect(36, 151, 428, 104);
    [
      'Lic. Arte Digital · TECH',
      'Web · React · JavaScript · Coderhouse',
      'Intérprete LSA · UNaM Humanidades',
    ].forEach((line, index) => {
      const y = 174 + index * 34;
      context.fillStyle = ['#ffd078', '#f5a7d5', '#bda2ff'][index];
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

function OrbitingPortal({ position, speed, paused, focusRef, onClick, onPointerOver, onPointerOut, label, spiralAmplitude = 0.12, spiralPhase = 0, children }) {
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
          <SceneLabel>{label}</SceneLabel>
        </group>
      </group>
    </group>
  );
}

function createSceneLabelTexture(label) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la etiqueta de navegación.');

  context.font = '600 38px system-ui, sans-serif';
  const height = 92;
  const width = Math.ceil(context.measureText(label).width) + 56;
  const radius = height / 2;
  const pixelRatio = 3;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.font = '600 38px system-ui, sans-serif';
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  context.fillStyle = 'rgba(7, 16, 29, 0.82)';
  context.beginPath();
  context.moveTo(radius, 2);
  context.arcTo(width - 2, 2, width - 2, height - 2, radius);
  context.arcTo(width - 2, height - 2, 2, height - 2, radius);
  context.arcTo(2, height - 2, 2, 2, radius);
  context.arcTo(2, 2, width - 2, 2, radius);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, width / 2, height / 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, aspect: width / height };
}

function SceneLabel({ children, position = [0, 1.5, 0] }) {
  const label = String(children);
  const { texture, aspect } = useMemo(() => createSceneLabelTexture(label), [label]);
  const meshRef = useRef(null);
  const worldPosition = useMemo(() => new Vector3(), []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ camera, size }) => {
    if (!meshRef.current || !camera.isPerspectiveCamera) return;
    meshRef.current.getWorldPosition(worldPosition);
    const distance = camera.position.distanceTo(worldPosition);
    const height = (24 * 2 * distance * Math.tan(camera.fov * Math.PI / 360)) / size.height;
    meshRef.current.scale.set(height * aspect, height, 1);
  });

  return (
    <Billboard position={position}>
      <mesh ref={meshRef} renderOrder={10}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Billboard>
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

export default function Galaxia({
  isIntro = false,
  isEntered = false,
  initialModule = null,
  style,
  onExitToRealWorld,
}) {
  const [activeModule, setActiveModule] = useState(null);
  const [flightModule, setFlightModule] = useState(null);
  const [isFlying, setIsFlying] = useState(isEntered);
  const [isOrbitPaused, setIsOrbitPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCinematicExit, setIsCinematicExit] = useState(false);
  const [bloomIntensity, setBloomIntensity] = useState(0.42);
  const [dpr, setDpr] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 1 : 1.5,
  );
  const [isPerformanceLow, setIsPerformanceLow] = useState(false);
  const {
    audioError,
    audioLevel,
    playSound,
    toggleAudio,
    updateAudioListener,
  } = useAppAudio();
  const controlsRef = useRef(null);
  const canvasShellRef = useRef(null);
  const dialogRef = useRef(null);
  const dialogScrollRef = useRef(null);
  const dialogCloseRef = useRef(null);
  const dialogTriggerRef = useRef(null);
  const secretClickRef = useRef({ count: 0, lastClick: 0 });
  const secretTimeoutRef = useRef(null);
  const initialModuleOpened = useRef(false);
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

  useEffect(() => {
    const wrapper = dialogScrollRef.current;
    if (!activeModule || prefersReducedMotion || !wrapper) return undefined;

    const lenis = new Lenis({
      wrapper,
      content: wrapper,
      lerp: 0.08,
      smoothWheel: true,
      syncTouch: true,
      syncTouchLerp: 0.08,
      wheelMultiplier: 0.85,
    });
    const unsubscribe = lenis.on('scroll', ScrollTrigger.update);
    const updateLenis = (time) => lenis.raf(time * 1000);
    gsap.ticker.add(updateLenis);

    return () => {
      gsap.ticker.remove(updateLenis);
      unsubscribe();
      lenis.destroy();
    };
  }, [activeModule, prefersReducedMotion]);

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
    if (sceneReady) {
      const timeout = window.setTimeout(() => setIsLoading(false), 650);
      return () => window.clearTimeout(timeout);
    }
  }, [sceneReady]);

  const openModule = useCallback((module) => {
    if (!dialogRef.current?.contains(document.activeElement)) {
      dialogTriggerRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    setEmailCopyStatus('');
    setActiveModule(null);
    setFlightModule(module);
    setIsFlying(true);
  }, []);
  useEffect(() => {
    if (!initialModule || !sceneReady || initialModuleOpened.current) return;
    initialModuleOpened.current = true;
    openModule(initialModule);
  }, [initialModule, openModule, sceneReady]);
  const finishSolarExit = useCallback(() => {
    onExitToRealWorld?.();
  }, [onExitToRealWorld]);
  const handleSunClick = useCallback((event) => {
    event.stopPropagation();
    setIsCinematicExit(true);
    setIsFlying(true);
  }, []);
  const handleCoreClick = useCallback((event) => {
    event.stopPropagation();
    openModule('NUCLEO');
  }, [openModule]);
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
    setActiveModule(null);
    setFlightModule(null);
    setIsFlying(true);
    window.requestAnimationFrame(() => dialogTriggerRef.current?.focus());
  }, []);
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModule, closeModule, flightModule, prefersReducedMotion, toggleAudio]);
  const handleFlightComplete = (module) => {
    if (module) {
      setActiveModule(module);
    }
    setIsFlying(false);
  };
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
        className="absolute inset-0 isolate"
        style={{ pointerEvents: isCinematicExit ? 'none' : 'auto' }}
      >
      {!isIntro && <CodeRainCanvas paused={prefersReducedMotion} />}
      <Canvas className="relative z-10" dpr={dpr} gl={{ alpha: true }} camera={{ position: [0, 6, 16], fov: 60 }}>
        <PerformanceMonitor
          flipflops={3}
          onDecline={handlePerformanceDecline}
          onIncline={handlePerformanceIncline}
        />
        <SpatialAudioListener updateAudioListener={updateAudioListener} />
        <CameraFlight
          activeModule={flightModule}
          initialFocus={isEntered ? 'OVERVIEW' : null}
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
              luminanceThreshold={0.8}
              luminanceSmoothing={0.16}
              intensity={isCinematicExit ? bloomIntensity : isPerformanceLow ? 0.08 : 0.12}
              mipmapBlur={!isPerformanceLow}
            />
          </EffectComposer>
        )}
        <Butterfly
          isEntered={isEntered}
          audioLevel={audioLevel}
          onSecretClick={handleButterflySecretClick}
          reducedMotion={prefersReducedMotion}
          exitToCamera={isCinematicExit}
        />
        <GoldenSecretParticles active={isSecretActive && !prefersReducedMotion} paused={prefersReducedMotion} />

        <group visible={!isIntro}>
        <Suspense fallback={null}>
          <SceneReady onReady={() => setSceneReady(true)} />
          <group ref={coreRef} onClick={handleCoreClick} onPointerOver={handleObjectHover} onPointerOut={handleObjectPointerOut}>
            <Earth paused={prefersReducedMotion} />
            <SceneLabel position={[0, 1.75, 0]}>Perfil & Stack</SceneLabel>
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
          label="Proyectos"
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
        </OrbitingPortal>

        <OrbitingPortal
          position={[6.23, -3.72, -0.8]}
          speed={0.043}
          paused={areOrbitsPaused}
          label="Formación"
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
          label="Contacto"
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
            title="Volver al sendero"
            className="fixed bottom-4 left-4 z-[70] flex min-h-11 items-center gap-2.5 rounded-full border border-cyan-100/20 bg-[#07101b]/55 px-4 font-body text-[11px] tracking-wide text-white/85 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl transition duration-300 hover:border-cyan-100/45 hover:bg-[#07101b]/75 hover:text-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 sm:bottom-5 sm:left-5"
          >
            <Sparkles aria-hidden="true" size={14} strokeWidth={1.6} className="text-cyan-100/85" />
            <span aria-hidden="true">←</span>
            <span>Sendero</span>
          </button>

          {audioError && (
            <p
              role="status"
              aria-live="polite"
              className="fixed bottom-[4.5rem] right-4 z-[70] w-max max-w-[90vw] rounded-xl border border-orange-200/15 bg-[#050817]/75 px-3 py-2 text-center font-mono text-[9px] text-orange-100/75 backdrop-blur-xl sm:bottom-[5rem] sm:right-5"
            >
              No se pudo activar el audio. Vuelve a intentarlo desde el control de sonido.
            </p>
          )}

          <div
            aria-label="Controles de la galaxia"
            className="fixed bottom-4 right-4 z-[70] flex items-center gap-0.5 rounded-full border border-white/10 bg-[#07101b]/55 p-1 shadow-[0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl sm:bottom-5 sm:right-5 sm:gap-1 sm:p-1.5"
          >
            <AudioToggleButton className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent font-mono text-base text-white/70 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 sm:h-11 sm:w-11" />
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent font-mono text-sm text-white/70 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 disabled:cursor-not-allowed disabled:opacity-40 sm:h-11 sm:w-11"
            >
              {areOrbitsPaused
                ? <Play aria-hidden="true" size={16} strokeWidth={1.6} />
                : <Pause aria-hidden="true" size={16} strokeWidth={1.6} />}
            </button>
            <button
              type="button"
              data-cursor
              onClick={centerGalaxy}
              aria-label="Centrar cámara en la galaxia"
              title="Centrar vista"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-transparent font-mono text-lg text-white/70 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200 sm:h-11 sm:w-11"
            >
              <LocateFixed aria-hidden="true" size={18} strokeWidth={1.6} />
            </button>
          </div>
        </>
      )}

      <AnimatePresence>
        {isLoading && !isIntro && (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
            className="absolute inset-0 z-[80] flex items-center justify-center bg-[#030008] font-mono text-white"
            aria-label="Mi galaxia creativa"
            aria-live="polite"
          >
            <motion.h2
              initial={{ opacity: 0, y: 6 }}
              animate={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: [0.65, 1, 0.78, 1], y: [6, 0, 0, 0] }}
              transition={prefersReducedMotion
                ? { duration: 0.25 }
                : { duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
              className="text-center text-sm font-medium tracking-[0.24em] text-cyan-50 sm:text-base"
            >
              MI GALAXIA CREATIVA
            </motion.h2>
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
              aria-label={`Sección: ${MODULE_LABELS[activeModule] ?? activeModule}`}
              className={`relative max-h-[min(86dvh,56rem)] ${activeModule === 'CONTACTO' ? 'w-[min(92vw,28rem)]' : 'w-[min(92vw,52rem)]'} select-text overflow-hidden font-mono text-white ${
                activeModule === 'CREDENCIALES'
                  ? 'rounded-3xl border border-white/15 bg-[#070a14]/80 shadow-[0_20px_100px_rgba(0,0,0,0.7)] backdrop-blur-xl'
                  : 'border border-white/15 bg-[#070a14]/90 shadow-[0_20px_100px_rgba(0,0,0,0.65)] backdrop-blur-2xl'
              }`}
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
              aria-label="Cerrar sección y volver a la galaxia"
              className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center border border-white/15 px-3 py-2 font-mono text-xs text-white/75 transition-colors hover:border-white/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200"
            >
              [✕]
            </button>
            <div
              ref={dialogScrollRef}
              className={`max-h-[min(86dvh,56rem)] overscroll-y-contain overflow-y-auto p-4 pt-12 sm:p-8 sm:pt-12 md:p-10 md:pt-12 ${
                activeModule === 'CREDENCIALES' ? 'credentials-dialog' : ''
              }`}
            >
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
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Hola, soy Gaby</h2>
                  <p className="mt-2 text-sm text-orange-100/80">Desarrollo web creativo.</p>
                </header>
                <section className="space-y-3">
                  <p className="text-sm leading-relaxed text-slate-200">
                    Uno la sensibilidad visual del arte digital con la lógica del código para crear experiencias web cuidadas, intuitivas y con personalidad.
                  </p>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Mi recorrido combina desarrollo frontend, diseño UI/UX y gestión de proyectos creativos.
                  </p>
                </section>
                <section className="group relative overflow-hidden rounded-2xl border border-orange-100/10 bg-gradient-to-br from-orange-100/[0.045] via-white/[0.015] to-transparent p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-100/25 hover:shadow-[0_0_28px_rgba(251,191,36,0.08)]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-[9px] uppercase tracking-[0.2em] text-orange-100/60 transition-colors duration-300 group-hover:text-orange-100/85">
                      Lo que inspira mi trabajo
                    </h3>
                    <Sparkles
                      aria-hidden="true"
                      size={15}
                      strokeWidth={1.5}
                      className="shrink-0 text-orange-100/45 transition duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:text-orange-100/80"
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-slate-300 transition duration-300 group-hover:text-slate-100 group-hover:drop-shadow-[0_0_8px_rgba(255,237,213,0.16)]">
                    Rodeada por la inmensidad del litoral argentino —la selva misionera, el horizonte del río y la claridad de los cielos—, encuentro en cada pequeño detalle de la naturaleza una fuente constante. Traduzco esa atmósfera en interfaces vivas que equilibran la fluidez visual y la precisión del código.
                  </p>
                </section>
                <div className="flex flex-wrap gap-2" aria-label="Áreas de trabajo">
                  {['Frontend · React', 'Diseño UI/UX', 'Arte digital', 'Experiencias interactivas'].map((area) => (
                    <span key={area} className="border border-orange-200/15 bg-orange-100/[0.03] px-3 py-1.5 text-[9px] text-orange-50/75">
                      {area}
                    </span>
                  ))}
                </div>
                <section className="space-y-3 border-t border-white/10 pt-5">
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.2em] text-orange-100/65">Stack tecnológico & arquitectura</h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                      Tecnologías y enfoques que uso para construir estas experiencias.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        title: 'Frontend',
                        technologies: 'React · Vite · JavaScript ES6+ · JSX',
                        detail: 'Arquitectura modular, componentes reutilizables y estado interactivo.',
                      },
                      {
                        title: 'Gráficos 3D & WebGL',
                        technologies: 'Three.js · React Three Fiber · Drei',
                        detail: 'Escenas 3D, geometrías, materiales, iluminación y controles.',
                      },
                      {
                        title: 'Físicas',
                        technologies: 'Rapier Physics',
                        detail: 'Gravedad y colisiones en tiempo real para objetos interactivos.',
                      },
                      {
                        title: 'Animación & motion',
                        technologies: 'GSAP · Framer Motion',
                        detail: 'Transiciones cinemáticas, timelines y microinteracciones de UI.',
                      },
                      {
                        title: 'Audio & multimedia',
                        technologies: 'Web Audio API · HTML5 Audio',
                        detail: 'Paisajes sonoros por escena y efectos sincronizados con la interacción.',
                      },
                      {
                        title: 'UI/UX & visuales',
                        technologies: 'Tailwind CSS · Glassmorphism · Shaders',
                        detail: 'Interfaces adaptativas, HUD espacial y efectos visuales personalizados.',
                      },
                    ].map(({ title, technologies, detail }) => (
                      <article key={title} className="border border-orange-100/10 bg-white/[0.025] p-3">
                        <h4 className="text-[9px] uppercase tracking-[0.14em] text-orange-100/75">{title}</h4>
                        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-100">{technologies}</p>
                        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">{detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
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
                  <p className="mb-3 text-[10px] uppercase tracking-[0.22em] text-cyan-200/70">Mi hobby · exploración del cielo</p>
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Astrofotografía</h2>
                  <p className="mt-2 text-sm text-slate-300">Una colección personal de observaciones del cielo nocturno.</p>
                </header>
                <section
                  role="status"
                  className="relative isolate overflow-hidden rounded-3xl border border-cyan-100/15 bg-gradient-to-br from-cyan-300/[0.08] via-white/[0.025] to-[#050914]/80 p-6 text-center shadow-[0_18px_60px_rgba(8,145,178,0.08)] sm:p-9"
                >
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-60">
                    <span className="absolute left-[18%] top-[24%] h-1 w-1 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(165,243,252,0.9)]" />
                    <span className="absolute right-[20%] top-[31%] h-1.5 w-1.5 rounded-full bg-cyan-100/70 shadow-[0_0_14px_rgba(165,243,252,0.75)]" />
                    <span className="absolute bottom-[24%] left-[28%] h-1 w-1 rounded-full bg-cyan-100/70" />
                    <span className="absolute bottom-[28%] right-[30%] h-1 w-1 rounded-full bg-cyan-100 shadow-[0_0_10px_rgba(165,243,252,0.8)]" />
                    <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/[0.08] blur-3xl" />
                  </div>
                  <Sparkles aria-hidden="true" className="mx-auto mb-4 text-cyan-100/80" size={30} strokeWidth={1.4} />
                  <h3 className="text-lg font-medium text-white">Próximamente</h3>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300">
                    Pronto compartiré aquí mis observaciones del cielo nocturno.
                  </p>
                </section>
              </div>
            )}

            {activeModule === 'CREDENCIALES' && (
              <div className="space-y-6">
                <header className="border-b border-amber-200/10 pb-5">
                  <h2 className="text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">Formación y certificaciones</h2>
                </header>
                <section>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Licenciatura en Arte Digital y Multimedia', 'TECH Universidad Tecnológica'],
                    ].map(([title, institution]) => (
                      <article
                        key={title}
                        className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-amber-100/30 hover:bg-amber-100/[0.045] hover:shadow-[0_12px_36px_rgba(251,191,36,0.07)]"
                      >
                        <h4 className="text-sm font-medium leading-relaxed tracking-tight text-slate-100">{title}</h4>
                        <p className="mt-2 text-xs leading-relaxed text-amber-100/75">{institution}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-amber-100/65">Cursos y certificaciones</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Desarrollo Web', 'Coderhouse'],
                      ['React.js', 'Coderhouse'],
                      ['JavaScript', 'Coderhouse'],
                      ['Intérprete certificada de LSA', 'UNaM · Humanidades'],
                      ['Bellas Artes: talleres de Mosaiquismo, Vitrofusión y Cerámica', 'Artes del Fuego · Parque del Conocimiento'],
                      ['Curso de Divulgación científica en Astronomía', 'Universidad Nacional de La Plata (UNLP)'],
                    ].map(([title, institution]) => (
                      <article
                        key={title}
                        className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-amber-100/30 hover:bg-amber-100/[0.045] hover:shadow-[0_12px_36px_rgba(251,191,36,0.07)]"
                      >
                        <h4 className="text-sm font-medium leading-relaxed tracking-tight text-slate-100">{title}</h4>
                        <p className="mt-2 text-xs leading-relaxed text-amber-100/75">{institution}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeModule === 'PROYECTOS' && (
              <ProjectCarousel selectedIndex={selectedProjectIndex} onSelect={setSelectedProjectIndex}>
                <header className="border-b border-purple-200/10 pb-4">
                  <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white sm:text-3xl">Proyectos destacados</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">Desarrollo, diseño y experimentación visual.</p>
                </header>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={selectedProjectIndex}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="min-h-52 border border-white/10 bg-gradient-to-br from-purple-400/10 via-[#070a14] to-cyan-300/5 p-4 sm:p-7"
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
                    {PROJECTS[selectedProjectIndex].url ? (
                      <a
                        href={PROJECTS[selectedProjectIndex].url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Visitar ${PROJECTS[selectedProjectIndex].title}; se abre en una pestaña nueva`}
                        className="mt-6 inline-flex min-h-11 touch-manipulation items-center border border-purple-200/40 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-purple-100 transition hover:border-purple-100/80 hover:bg-purple-200/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200"
                      >
                        Visitar proyecto ↗
                      </a>
                    ) : (
                      <p className="mt-6 text-xs leading-relaxed text-slate-400">
                        Prototipo conceptual · sin sitio publicado
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    data-cursor
                    onClick={() => setSelectedProjectIndex((index) => (index + PROJECTS.length - 1) % PROJECTS.length)}
                    aria-label="Ver proyecto anterior"
                    className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center border border-white/15 px-2 py-2 text-xs text-white/80 transition hover:border-purple-200/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 sm:px-4 sm:text-sm"
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
                        className="group flex h-11 w-11 touch-manipulation items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200"
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
                    className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center border border-white/15 px-2 py-2 text-xs text-white/80 transition hover:border-purple-200/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-200 sm:px-4 sm:text-sm"
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
            </div>
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