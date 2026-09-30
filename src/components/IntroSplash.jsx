import { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

// Partículas estelares de código
const cosmicCodeDust = [
  { text: "{ }", top: "15%", left: "18%", size: "text-xs", duration: "3s" },
  { text: "</>", top: "72%", left: "12%", size: "text-xs", duration: "4.5s" },
  { text: "const", top: "25%", left: "82%", size: "text-[10px]", duration: "5s" },
  { text: "=>", top: "65%", left: "88%", size: "text-xs", duration: "3.5s" },
  { text: "<div>", top: "82%", left: "42%", size: "text-[10px]", duration: "4s" },
  { text: "import", top: "12%", left: "55%", size: "text-[10px]", duration: "3.2s" },
  { text: "JS", top: "45%", left: "8%", size: "text-[11px]", duration: "6s" },
  { text: "HTML", top: "32%", left: "90%", size: "text-[10px]", duration: "5.5s" },
  { text: "useEffect", top: "85%", left: "22%", size: "text-[9px]", duration: "4.8s" },
  { text: "return", top: "18%", left: "35%", size: "text-[10px]", duration: "3.8s" }
];

export default function IntroSplash({ onEnter }) {
  const mouseX = useMotionValue(typeof window !== 'undefined' ? window.innerWidth / 2 : 500);
  const mouseY = useMotionValue(typeof window !== 'undefined' ? window.innerHeight / 2 : 300);

  // Física para la mariposa
  const smoothX = useSpring(mouseX, { damping: 30, stiffness: 90 });
  const smoothY = useSpring(mouseY, { damping: 30, stiffness: 90 });

  // Parallax controlado para las capas de fondo
  const bgMoveX = useTransform(smoothX, [0, typeof window !== 'undefined' ? window.innerWidth : 1000], [-20, 20]);
  const bgMoveY = useTransform(smoothY, [0, typeof window !== 'undefined' ? window.innerHeight : 800], [-20, 20]);
  const starMoveX = useTransform(smoothX, [0, typeof window !== 'undefined' ? window.innerWidth : 1000], [-40, 40]);
  const starMoveY = useTransform(smoothY, [0, typeof window !== 'undefined' ? window.innerHeight : 800], [-40, 40]);

  // Rotación 3D (Tilt) para el bloque del nombre
  const nameRotateX = useTransform(smoothY, [0, typeof window !== 'undefined' ? window.innerHeight : 800], [12, -12]);
  const nameRotateY = useTransform(smoothX, [0, typeof window !== 'undefined' ? window.innerWidth : 1000], [-12, 12]);

  const [trail, setTrail] = useState([]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      const newPoint = { x: e.clientX, y: e.clientY, id: Date.now() + Math.random() };
      setTrail((prev) => [...prev.slice(-12), newPoint]);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        mouseX.set(touch.clientX);
        mouseY.set(touch.clientY);
        const newPoint = { x: touch.clientX, y: touch.clientY, id: Date.now() + Math.random() };
        setTrail((prev) => [...prev.slice(-12), newPoint]);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [mouseX, mouseY]);

  // Limpieza automática del rastro de la mariposa
  useEffect(() => {
    const interval = setInterval(() => {
      setTrail((prev) => prev.filter((point) => Date.now() - point.id < 700));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 bg-[#030008] flex items-center justify-center overflow-hidden cursor-crosshair select-none perspective-[1000px]"
      onClick={onEnter}
    >
      {/* --- CAPA 1: Nebulosas Volumétricas con escala para evitar cortes en los bordes --- */}
      <motion.div 
        style={{ x: bgMoveX, y: bgMoveY }}
        className="absolute inset-[-10%] scale-125 pointer-events-none"
      >
        <div className="absolute top-1/4 left-1/4 w-[700px] h-[700px] bg-orange-600/10 rounded-full blur-[150px] animate-pulse duration-[8s]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[800px] h-[800px] bg-neon-cyan/10 rounded-full blur-[170px] animate-pulse duration-[10s]"></div>
        <div className="absolute inset-0 bg-[#030008]"></div>
      </motion.div>

      {/* --- CAPA 2: Campo Estelar de Código (Escalado para seguridad de bordes) --- */}
      <motion.div 
        style={{ x: starMoveX, y: starMoveY }}
        className="absolute inset-[-10%] scale-125 pointer-events-none overflow-hidden"
      >
        {cosmicCodeDust.map((item, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0.2, scale: 0.8 }}
            animate={{ 
              opacity: [0.2, 0.7, 0.2],
              scale: [0.9, 1.1, 0.9],
              y: [-8, 8, -8]
            }}
            transition={{ 
              repeat: Infinity, 
              duration: parseFloat(item.duration), 
              ease: "easeInOut" 
            }}
            className={`absolute font-mono ${item.size} text-orange-400/50 drop-shadow-[0_0_8px_rgba(255,123,0,0.3)]`}
            style={{ top: item.top, left: item.left }}
          >
            {item.text}
          </motion.span>
        ))}

        {[...Array(20)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full bg-white animate-pulse"
            style={{
              top: `${(i * 41) % 100}%`,
              left: `${(i * 67) % 100}%`,
              width: `${(i % 2) + 1}px`,
              height: `${(i % 2) + 1}px`,
              opacity: 0.3,
              animationDuration: `${(i % 3) + 2}s`
            }}
          />
        ))}
      </motion.div>

      {/* Trazo luminoso temporal de la mariposa */}
      {trail.map((point) => (
        <motion.div
          key={point.id}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="absolute w-2.5 h-2.5 rounded-full bg-orange-400 pointer-events-none shadow-[0_0_14px_#ff7b00]"
          style={{ left: point.x - 5, top: point.y - 5 }}
        />
      ))}

      {/* Mariposa Real Naranja (Intacta) */}
      <motion.div
        className="fixed pointer-events-none z-40 text-orange-400 drop-shadow-[0_0_20px_#ff7b00]"
        style={{ x: smoothX, y: smoothY, translateX: '-50%', translateY: '-50%' }}
        animate={{ 
          scaleX: [1, 0.4, 1, 0.4, 1], 
          rotate: [-5, 5, -5] 
        }}
        transition={{ 
          repeat: Infinity, 
          duration: 0.45, 
          ease: "easeInOut" 
        }}
      >
        <svg width="42" height="42" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 50 C 40 20, 10 10, 5 30 C 0 50, 20 70, 50 60 Z" fill="#ff7b00" opacity="0.9" />
          <path d="M50 55 C 30 70, 10 80, 15 90 C 20 100, 40 85, 50 70 Z" fill="#ffa200" opacity="0.9" />
          <path d="M50 50 C 60 20, 90 10, 95 30 C 100 50, 80 70, 50 60 Z" fill="#ff7b00" opacity="0.9" />
          <path d="M50 55 C 70 70, 90 80, 85 90 C 80 100, 60 85, 50 70 Z" fill="#ffa200" opacity="0.9" />
          <ellipse cx="50" cy="50" rx="2.5" ry="18" fill="#111" />
          <path d="M50 32 Q 42 16, 38 12" stroke="#ff7b00" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M50 32 Q 58 16, 62 12" stroke="#ff7b00" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </motion.div>

      {/* Centro: Nombre "Gabi Edwin" con 3D Tilt y respuesta de clic inmediata */}
      <div className="relative z-10 flex items-center justify-center">
        <motion.div 
          style={{ rotateX: nameRotateX, rotateY: nameRotateY, transformStyle: "preserve-3d" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative p-12 flex flex-col items-center justify-center text-center z-10 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onEnter();
          }}
        >
          <motion.h1 
            style={{ transform: "translateZ(40px)" }}
            className="text-4xl md:text-6xl font-black tracking-widest bg-gradient-to-r from-orange-400 via-white to-neon-cyan bg-clip-text text-transparent uppercase font-mono drop-shadow-[0_0_30px_rgba(255,123,0,0.6)]"
          >
            Gabi Edwin
          </motion.h1>
          
          <motion.span 
            style={{ transform: "translateZ(20px)" }}
            className="text-[11px] md:text-xs text-orange-300/90 tracking-[0.4em] uppercase mt-3 font-mono"
          >
            Arte & Frontend
          </motion.span>
        </motion.div>
      </div>
    </motion.div>
  );
}