import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Billboard, Stars, Text } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';
import { Color, DataTexture, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType, Vector3 } from 'three';

function createPlanetMaps(baseColor, seed) {
  const width = 512;
  const height = 256;
  const colorData = new Uint8Array(width * height * 4);
  const bumpData = new Uint8Array(width * height * 4);
  const roughnessData = new Uint8Array(width * height * 4);
  const metalnessData = new Uint8Array(width * height * 4);
  const base = new Color(baseColor);
  const shadow = base.clone().multiplyScalar(0.45);
  const highlight = base.clone().lerp(new Color('#ffffff'), 0.34);
  const pixelColor = new Color();

  for (let y = 0; y < height; y += 1) {
    const latitude = (y / height - 0.5) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const longitude = (x / width) * Math.PI * 2;
      const broadTerrain = Math.sin(longitude * 3 + seed) * Math.cos(latitude * 4 - seed);
      const ridges = Math.sin(longitude * 11 + Math.sin(latitude * 8 + seed) * 2) * 0.24;
      const detail = Math.cos(longitude * 23 - latitude * 15 + seed) * 0.12;
      const terrain = broadTerrain * 0.56 + ridges + detail;
      const elevation = Math.max(0, Math.min(1, (terrain + 0.88) / 1.76));
      const shade = 0.64 + elevation * 0.58;
      const index = (y * width + x) * 4;

      pixelColor.lerpColors(shadow, highlight, elevation).multiplyScalar(shade);
      colorData[index] = Math.round(pixelColor.r * 255);
      colorData[index + 1] = Math.round(pixelColor.g * 255);
      colorData[index + 2] = Math.round(pixelColor.b * 255);
      colorData[index + 3] = 255;

      const relief = Math.round(64 + elevation * 176);
      bumpData[index] = relief;
      bumpData[index + 1] = relief;
      bumpData[index + 2] = relief;
      bumpData[index + 3] = 255;

      const roughness = Math.round(228 - elevation * 104 + Math.sin(longitude * 31 + seed) * 12);
      roughnessData[index] = roughness;
      roughnessData[index + 1] = roughness;
      roughnessData[index + 2] = roughness;
      roughnessData[index + 3] = 255;

      const metalness = Math.round(72 + elevation * 152);
      metalnessData[index] = metalness;
      metalnessData[index + 1] = metalness;
      metalnessData[index + 2] = metalness;
      metalnessData[index + 3] = 255;
    }
  }

  const makeTexture = (data, colorSpace) => {
    const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
    texture.wrapS = RepeatWrapping;
    if (colorSpace) texture.colorSpace = colorSpace;
    texture.needsUpdate = true;
    return texture;
  };

  return {
    colorMap: makeTexture(colorData, SRGBColorSpace),
    bumpMap: makeTexture(bumpData),
    roughnessMap: makeTexture(roughnessData),
    metalnessMap: makeTexture(metalnessData),
  };
}

function Planet({ color, radius, emissiveIntensity, seed, metalness = 0.42 }) {
  const ringsRef = useRef(null);
  const maps = useMemo(() => createPlanetMaps(color, seed), [color, seed]);

  useEffect(() => () => {
    maps.colorMap.dispose();
    maps.bumpMap.dispose();
    maps.roughnessMap.dispose();
    maps.metalnessMap.dispose();
  }, [maps]);

  useFrame((_, delta) => {
    if (ringsRef.current) {
      ringsRef.current.rotation.y += delta * 0.16;
      ringsRef.current.rotation.x = Math.sin(performance.now() * 0.00015) * 0.035;
    }
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          map={maps.colorMap}
          bumpMap={maps.bumpMap}
          bumpScale={radius * 0.075}
          roughnessMap={maps.roughnessMap}
          metalnessMap={maps.metalnessMap}
          emissive={color}
          emissiveIntensity={emissiveIntensity * 0.22}
          roughness={0.66}
          metalness={metalness}
        />
      </mesh>
      <mesh scale={1.14}>
        <sphereGeometry args={[radius, 48, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} depthWrite={false} />
      </mesh>
      <mesh scale={1.3}>
        <sphereGeometry args={[radius, 40, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.045} depthWrite={false} />
      </mesh>
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

function CommunicationsSatellite({ onSelect }) {
  const orbitRef = useRef(null);
  const satelliteRef = useRef(null);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    if (!orbitRef.current || !satelliteRef.current) return;

    orbitRef.current.rotation.y = elapsed * 0.075;
    satelliteRef.current.position.set(
      Math.cos(elapsed * 0.075) * 13.5,
      Math.sin(elapsed * 0.13) * 3.8,
      Math.sin(elapsed * 0.075) * 10,
    );
    satelliteRef.current.rotation.set(0.24, -elapsed * 0.1, 0.18);
  });

  return (
    <group ref={orbitRef}>
      <group
        ref={satelliteRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <mesh>
          <boxGeometry args={[0.38, 0.3, 0.32]} />
          <meshStandardMaterial color="#c7f8ff" metalness={0.82} roughness={0.24} emissive="#00d9ff" emissiveIntensity={0.28} />
        </mesh>
        <mesh position={[-0.48, 0, 0]}>
          <boxGeometry args={[0.58, 0.035, 0.28]} />
          <meshStandardMaterial color="#168ac4" metalness={0.75} roughness={0.38} emissive="#00aaff" emissiveIntensity={0.22} />
        </mesh>
        <mesh position={[0.48, 0, 0]}>
          <boxGeometry args={[0.58, 0.035, 0.28]} />
          <meshStandardMaterial color="#168ac4" metalness={0.75} roughness={0.38} emissive="#00aaff" emissiveIntensity={0.22} />
        </mesh>
        <mesh position={[0, 0.22, -0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.18, 0.12, 24, 1, true]} />
          <meshBasicMaterial color="#b7faff" wireframe />
        </mesh>
        <pointLight color="#00d9ff" intensity={1.4} distance={3.5} />
        <Billboard position={[0, 0.68, 0]}>
          <Text fontSize={0.2} anchorX="center" anchorY="middle" color="#c4fbff">
            CONTACTO · REDES
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

function OrbitingTextRing({ id, text, radius, height, fontSize, speed, color, hoveredModule, setHoveredModule }) {
  const ringRef = useRef(null);
  const words = text.split(/\s+/).filter(Boolean);
  const labelColor = hoveredModule === id ? '#ffffff' : color;

  useFrame((_, delta) => {
    if (ringRef.current) ringRef.current.rotation.y += speed * delta;
  });

  const handlePointerOver = (event) => {
    event.stopPropagation();
    setHoveredModule(id);
  };
  const handlePointerOut = (event) => {
    event.stopPropagation();
    setHoveredModule(null);
  };

  return (
    <group ref={ringRef} position={[0, height, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, 0.006, 6, 96]} />
        <meshBasicMaterial color={labelColor} transparent opacity={0.24} depthWrite={false} />
      </mesh>
      {words.map((word, index) => {
        const angle = (index / words.length) * Math.PI * 2;
        return (
          <Billboard
            key={`${word}-${index}`}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
          >
            <Text
              anchorX="center"
              anchorY="middle"
              textAlign="center"
              fontSize={fontSize}
              color={labelColor}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
            >
              {word}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}

function PlanetLabel({ id, title, subtitle, description, planetRadius, titleSize, color, hoveredModule, setHoveredModule }) {
  const orbitRadius = planetRadius + 0.65;

  return (
    <group>
      <OrbitingTextRing
        id={id}
        text={title}
        radius={orbitRadius}
        height={0.35}
        fontSize={titleSize}
        speed={0.18}
        color={color}
        hoveredModule={hoveredModule}
        setHoveredModule={setHoveredModule}
      />
      <OrbitingTextRing
        id={id}
        text={subtitle}
        radius={orbitRadius + 0.55}
        height={-0.18}
        fontSize={titleSize * 0.62}
        speed={-0.12}
        color={color}
        hoveredModule={hoveredModule}
        setHoveredModule={setHoveredModule}
      />
      <OrbitingTextRing
        id={id}
        text={description}
        radius={orbitRadius + 1.05}
        height={-0.55}
        fontSize={titleSize * 0.48}
        speed={0.08}
        color={color}
        hoveredModule={hoveredModule}
        setHoveredModule={setHoveredModule}
      />
    </group>
  );
}

function SolarFlight({ systemRef, snRef, snjaRef, sxRef }) {
  const cameraPosition = useRef(new Vector3());
  const cameraTarget = useRef(new Vector3());
  const smoothedTarget = useRef(new Vector3());

  useFrame(({ clock, pointer, camera }, delta) => {
    const elapsed = clock.elapsedTime;
    const sunX = Math.sin(elapsed * 0.12) * 0.65;
    const sunY = Math.sin(elapsed * 0.17) * 0.3;
    const sunZ = -elapsed * 0.16;

    if (!systemRef.current || !snRef.current || !snjaRef.current || !sxRef.current) return;

    systemRef.current.position.set(sunX, sunY, sunZ);
    systemRef.current.rotation.y = elapsed * 0.035;
    systemRef.current.rotation.z = Math.sin(elapsed * 0.05) * 0.025;

    const movePlanet = (ref, baseRadius, speed, phase, depth) => {
      const radius = baseRadius + elapsed * 0.008;
      const angle = elapsed * speed + phase + radius * 0.12;
      ref.current.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.68,
        Math.sin(angle * 0.58) * depth,
      );
    };

    movePlanet(snRef, 6.2, 0.18, 2.9, 0.8);
    movePlanet(snjaRef, 6.1, 0.14, -0.16, 0.9);
    movePlanet(sxRef, 4, 0.11, Math.PI / 2, 0.75);

    cameraPosition.current.set(
      systemRef.current.position.x + pointer.x * 1.15,
      systemRef.current.position.y + 6 + pointer.y * 0.65,
      sunZ + 16,
    );
    cameraTarget.current.set(
      systemRef.current.position.x + pointer.x * 0.7,
      systemRef.current.position.y + pointer.y * 0.4,
      sunZ,
    );

    const smoothing = 1 - Math.exp(-delta * 1.8);
    camera.position.lerp(cameraPosition.current, smoothing);
    smoothedTarget.current.lerp(cameraTarget.current, smoothing);
    camera.lookAt(smoothedTarget.current);
  });

  return null;
}

export default function Galaxia() {
  const [activeModule, setActiveModule] = useState(null);
  const [hoveredModule, setHoveredModule] = useState(null);
  const systemRef = useRef(null);
  const snRef = useRef(null);
  const snjaRef = useRef(null);
  const sxRef = useRef(null);

  return (
    <div className="w-full h-screen bg-[#030008] relative overflow-hidden select-none">
      
      {/* HUD Superior / Identidad */}
      <div className="absolute top-6 left-6 z-30 pointer-events-none font-mono">
        <h1 className="text-xl font-bold text-white tracking-widest bg-gradient-to-r from-orange-400 to-neon-cyan bg-clip-text text-transparent">
          GABI EDWIN
        </h1>
        <p className="text-[10px] text-orange-300/80 tracking-widest uppercase">
          [ Sistema Galáctico Interactivo - 2026 ]
        </p>
      </div>

      {/* Instrucción sutil para el usuario */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-mono text-center">
        <p className="text-[11px] text-orange-400/70 tracking-widest animate-pulse">
          Explorar mi universo
        </p>
      </div>

      {/* Canvas 3D de la Galaxia */}
      <Canvas camera={{ position: [0, 6, 16], fov: 60 }}>
        <SolarFlight systemRef={systemRef} snRef={snRef} snjaRef={snjaRef} sxRef={sxRef} />
        <ambientLight intensity={0.7} />
        <pointLight position={[10, 10, 10]} intensity={2.5} color="#ff7b00" />
        <pointLight position={[-10, -10, -10]} intensity={1.2} color="#00f2fe" />

        {/* Fondo de Estrellas Cósmicas */}
        <Stars radius={130} depth={60} count={4500} factor={4} saturation={1} fade speed={0.55} />

        <group ref={systemRef}>
        {/* --- NÚCLEO CENTRAL (Tu Perfil Profesional & "Sobre Mí") --- */}
        <group onClick={() => setActiveModule('NUCLEO')}>
          <pointLight color="#ff7b00" intensity={16} distance={28} decay={2} />
          <Planet color="#ff7b00" radius={1.8} emissiveIntensity={0.9} seed={1} metalness={0.7} />
          <PlanetLabel
            id="NUCLEO"
            title="Gabi Edwin"
            subtitle="Lic. Arte Digital & Frontend"
            description="Diseño Interfaces Desarrollo"
            planetRadius={1.8}
            color="#fff0d8"
            titleSize={0.34}
            hoveredModule={hoveredModule}
            setHoveredModule={setHoveredModule}
          />
        </group>

        {/* --- MÓDULO SN (Proyecto / E-commerce Nowin) --- */}
        <group ref={snRef} onClick={() => setActiveModule('SN')}>
          <Planet color="#00f2fe" radius={0.8} emissiveIntensity={0.4} seed={2} metalness={0.62} />
          <PlanetLabel
            id="SN"
            title="Mis E-commerce & Páginas"
            subtitle="Nowin Especias"
            description="Tiendas Web Proyectos"
            planetRadius={0.8}
            color="#b7faff"
            titleSize={0.22}
            hoveredModule={hoveredModule}
            setHoveredModule={setHoveredModule}
          />
        </group>

        {/* --- MÓDULO SNJA (Artes del Fuego & Gestión) --- */}
        <group ref={snjaRef} onClick={() => setActiveModule('SNJA')}>
          <Planet color="#ff4500" radius={0.9} emissiveIntensity={0.4} seed={3} metalness={0.48} />
          <PlanetLabel
            id="SNJA"
            title="Artes del Fuego"
            subtitle="Inventario & Taller"
            description="Gestion Ceramica"
            planetRadius={0.9}
            color="#ffd0ae"
            titleSize={0.24}
            hoveredModule={hoveredModule}
            setHoveredModule={setHoveredModule}
          />
        </group>

        {/* --- MÓDULO SX (Laboratorio Creativo & Astronomía) --- */}
        <group ref={sxRef} onClick={() => setActiveModule('SX')}>
          <Planet color="#a855f7" radius={0.9} emissiveIntensity={0.5} seed={4} metalness={0.72} />
          <PlanetLabel
            id="SX"
            title="Cosmos & UI/UX"
            subtitle="Arte Digital & Astronomía"
            description="Diseno Visual Interactivo"
            planetRadius={0.9}
            color="#e5ccff"
            titleSize={0.24}
            hoveredModule={hoveredModule}
            setHoveredModule={setHoveredModule}
          />
        </group>

          <CommunicationsSatellite onSelect={() => setActiveModule('CONTACTO')} />
        </group>
      </Canvas>

      {/* --- PANEL LATERAL DE INFORMACIÓN --- */}
      <AnimatePresence>
        {activeModule && (
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 30 }}
            aria-label="Información del módulo seleccionado"
            className="absolute right-3 top-3 bottom-3 z-40 w-[min(68vw,24rem)] overflow-y-auto rounded-2xl border border-white/15 bg-space-900/40 p-5 font-mono text-white shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:right-6 sm:top-6 sm:bottom-6 sm:p-8 lg:w-[min(32vw,24rem)]"
          >
            <button 
              onClick={() => setActiveModule(null)}
              aria-label="Cerrar panel"
              className="absolute top-4 right-4 text-orange-400 hover:text-white font-bold text-sm bg-space-900 px-3 py-1 rounded-md border border-orange-500/30"
            >
              [✕]
            </button>

            {/* CONTENIDO DEL NÚCLEO CENTRAL (Perfil & Contratación) */}
            {activeModule === 'NUCLEO' && (
              <div>
                <span className="text-[10px] text-orange-400 tracking-[0.3em] uppercase block mb-1">
                  // Commander & Developer Profile
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Gabi Edwin
                </h2>
                <p className="text-xs text-orange-300 mb-4 font-semibold">
                  Frontend Developer & Licenciada en Arte Digital y Multimedia
                </p>
                <div className="text-xs text-slate-300 space-y-3 leading-relaxed mb-6">
                  <p>
                    Especializada en la creación de interfaces web inmersivas, diseño UI/UX avanzado y experiencias digitales de alto impacto. Combino la lógica del código moderno (React, Vite, Tailwind CSS, Three.js) con una sólida formación estética y artística.
                  </p>
                  <p>
                    Actualmente liderando proyectos de gestión y desarrollo tecnológico en el Parque del Conocimiento (Artes del Fuego).
                  </p>
                  <div className="p-3 bg-space-900/80 rounded-lg border border-orange-500/20">
                    <span className="text-orange-400 block font-bold mb-1">¿Disponible para proyectos o contratación?</span>
                    <span className="text-[11px] text-slate-300">¡Sí! Abierta a propuestas de desarrollo frontend, diseño interactivo y consultoría web.</span>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <a 
                    href="mailto:contacto@gabiedwin.com" 
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-space-900 font-bold text-xs rounded-lg transition-all shadow-[0_0_15px_#ff7b00]"
                  >
                    Contactar / Contratar
                  </a>
                  <button 
                    onClick={() => setActiveModule(null)}
                    className="px-4 py-2 bg-space-900 hover:bg-space-700 text-orange-400 border border-orange-500/40 font-bold text-xs rounded-lg transition-all"
                  >
                    Cerrar Panel
                  </button>
                </div>
              </div>
            )}

            {/* CONTENIDO MÓDULO SN (E-commerce & Páginas) */}
            {activeModule === 'SN' && (
              <div>
                <span className="text-[10px] text-neon-cyan tracking-[0.3em] uppercase block mb-1">
                  // Plataformas y páginas web
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Mis E-commerce & Páginas
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Una selección de plataformas y sitios web que desarrollé, incluyendo Nowin Especias y otros proyectos digitales. Combinan interfaces en React, Vite y Tailwind CSS con herramientas como Firebase y paneles de gestión en Retool.
                </p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setActiveModule(null)}
                    className="px-4 py-2 bg-neon-cyan hover:bg-cyan-400 text-space-900 font-bold text-xs rounded-lg transition-all shadow-[0_0_15px_#00f2fe]"
                  >
                    Cerrar Panel
                  </button>
                </div>
              </div>
            )}

            {/* CONTENIDO MÓDULO SNJA (Artes del Fuego) */}
            {activeModule === 'SNJA' && (
              <div>
                <span className="text-[10px] text-orange-400 tracking-[0.3em] uppercase block mb-1">
                  // Módulo Gestión & Cerámica
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Artes del Fuego
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Sistema web de inventario y seguimiento de materias primas, hornos y herramientas cerámicas para el Parque del Conocimiento. Fusiona la precisión digital con la producción artesanal en alta temperatura.
                </p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setActiveModule(null)}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-space-900 font-bold text-xs rounded-lg transition-all shadow-[0_0_15px_#ff7b00]"
                  >
                    Cerrar Panel
                  </button>
                </div>
              </div>
            )}

            {/* CONTENIDO MÓDULO SX (Laboratorio Creativo) */}
            {activeModule === 'SX' && (
              <div>
                <span className="text-[10px] text-purple-400 tracking-[0.3em] uppercase block mb-1">
                  // Módulo Arte & Cosmos
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Laboratorio Creativo & Astronomía
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  Espacio experimental de diseño vectorial en Illustrator/Figma, animaciones fluidas con GSAP y Framer Motion, y exploración de la observación astronómica práctica.
                </p>
                <div className="flex justify-end gap-3">
                  <button 
                    onClick={() => setActiveModule(null)}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs rounded-lg transition-all shadow-[0_0_15px_#a855f7]"
                  >
                    Cerrar Panel
                  </button>
                </div>
              </div>
            )}

            {activeModule === 'CONTACTO' && (
              <div>
                <span className="text-[10px] text-neon-cyan tracking-[0.3em] uppercase block mb-1">
                  // Enlace de comunicación
                </span>
                <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-3">
                  Contacto y Redes
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed mb-6">
                  ¿Hablamos de un proyecto, una colaboración o una idea nueva? Puedes escribirme y conectar conmigo desde aquí.
                </p>
                <a
                  href="mailto:contacto@gabiedwin.com"
                  className="inline-flex px-4 py-2 bg-cyan-400/90 hover:bg-cyan-300 text-space-900 font-bold text-xs rounded-lg transition-colors"
                >
                  contacto@gabiedwin.com
                </a>
              </div>
            )}

          </motion.aside>
        )}
      </AnimatePresence>

    </div>
  );
}