import { useState, useEffect } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useAppAudio } from '../audio/AudioContext';
import StarTrail from './StarTrail';

const INTRO_NAME = 'Gaby Edwin';
const LOADING_MESSAGE = '[ CARGANDO ] // UNIVERSO WEB DE GABY EDWIN';

export default function IntroSplash({ onEnter, onLoadingStart }) {
  const { playSound } = useAppAudio();
  const shouldReduceMotion = useReducedMotion();
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

  const [typedName, setTypedName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [typedLoadingMessage, setTypedLoadingMessage] = useState('');

  useEffect(() => {
    if (typedName.length >= INTRO_NAME.length) return undefined;

    const timeout = setTimeout(() => {
      playSound('type');
      const nextLength = typedName.length + 1;
      setTypedName(INTRO_NAME.slice(0, nextLength));
    }, 110);

    return () => clearTimeout(timeout);
  }, [playSound, typedName]);

  const beginLoading = () => {
    if (isLoading || typedName.length < INTRO_NAME.length) return;
    setIsLoading(true);
    onLoadingStart();
  };

  useEffect(() => {
    if (!isLoading) return undefined;

    if (typedLoadingMessage.length >= LOADING_MESSAGE.length) {
      const timeout = setTimeout(onEnter, 350);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      playSound('type');
      setTypedLoadingMessage(LOADING_MESSAGE.slice(0, typedLoadingMessage.length + 1));
    }, 38);

    return () => clearTimeout(timeout);
  }, [isLoading, onEnter, playSound, typedLoadingMessage]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };

    const handleTouchMove = (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        mouseX.set(touch.clientX);
        mouseY.set(touch.clientY);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [mouseX, mouseY]);

  return (
    <motion.div 
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-transparent select-none perspective-[1000px]"
    >
      {/* --- CAPA 1: Nebulosas Volumétricas con escala para evitar cortes en los bordes --- */}
      <motion.div 
        style={{ x: shouldReduceMotion ? 0 : bgMoveX, y: shouldReduceMotion ? 0 : bgMoveY }}
        className="absolute inset-[-10%] scale-125 pointer-events-none"
      >
        <div className={`absolute top-1/4 left-1/4 w-[700px] h-[700px] bg-orange-600/10 rounded-full blur-[150px] ${shouldReduceMotion ? '' : 'animate-pulse duration-[8s]'}`}></div>
        <div className={`absolute bottom-1/4 right-1/4 w-[800px] h-[800px] bg-neon-cyan/10 rounded-full blur-[170px] ${shouldReduceMotion ? '' : 'animate-pulse duration-[10s]'}`}></div>
        <div className="absolute inset-0 bg-[#030008]/25"></div>
      </motion.div>

      {/* --- CAPA 2: Campo estelar --- */}
      <motion.div 
        style={{ x: shouldReduceMotion ? 0 : starMoveX, y: shouldReduceMotion ? 0 : starMoveY }}
        className="absolute inset-[-10%] scale-125 pointer-events-none overflow-hidden"
      >
        {[...Array(20)].map((_, i) => (
          <div
            key={`star-${i}`}
            className={`absolute rounded-full bg-white ${shouldReduceMotion ? '' : 'animate-pulse'}`}
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

      <StarTrail />

      {/* Centro: nombre y secuencia de carga */}
      <div className="relative z-10 flex items-center justify-center px-6">
        {isLoading ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex max-w-full items-center justify-center text-center font-mono text-xs text-cyan-100 sm:text-sm"
            aria-live="polite"
            aria-label={LOADING_MESSAGE}
          >
            <span>{typedLoadingMessage}</span>
            <motion.span
              aria-hidden="true"
              className="ml-1 text-orange-300"
              animate={shouldReduceMotion ? { opacity: 0.6 } : { opacity: [0.15, 1, 0.15] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            >
              _
            </motion.span>
          </motion.div>
        ) : (
        <motion.div
          style={{
            rotateX: shouldReduceMotion ? 0 : nameRotateX,
            rotateY: shouldReduceMotion ? 0 : nameRotateY,
            transformStyle: 'preserve-3d',
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center justify-center p-12 text-center"
        >
          <motion.h1 
            aria-label="Gaby Edwin"
            style={{ transform: "translateZ(40px)" }}
            className="text-4xl md:text-6xl font-black tracking-widest bg-gradient-to-r from-orange-400 via-white to-neon-cyan bg-clip-text text-transparent font-mono drop-shadow-[0_0_30px_rgba(255,123,0,0.6)]"
          >
            {typedName}
            <motion.span
              aria-hidden="true"
              className="text-cyan-200"
              animate={shouldReduceMotion ? { opacity: 0.6 } : { opacity: [0.15, 1, 0.15] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            >
              _
            </motion.span>
          </motion.h1>
          <motion.span 
            style={{ transform: "translateZ(20px)" }}
            className="mt-3 font-mono text-xs tracking-[0.12em] text-orange-200 sm:text-sm"
          >
            Frontend Developer & Arte Digital
          </motion.span>
          {typedName.length === INTRO_NAME.length && (
            <motion.button
              type="button"
              data-cursor
              onClick={beginLoading}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-8 min-h-12 border border-cyan-100/40 bg-black/30 px-6 py-3 font-mono text-[10px] font-semibold tracking-[0.16em] text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.12)] transition hover:border-cyan-100/80 hover:bg-cyan-100/10 hover:shadow-[0_0_32px_rgba(34,211,238,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200 sm:text-xs"
            >
              ENTRAR AL UNIVERSO 3D
            </motion.button>
          )}
        </motion.div>
        )}
      </div>
    </motion.div>
  );
}