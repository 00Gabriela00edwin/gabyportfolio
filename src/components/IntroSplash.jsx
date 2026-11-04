import { lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAppAudio } from '../audio/AudioContext';
import StarTrail from './StarTrail';

const IntroButterflyCanvas = lazy(() => import('./IntroButterflyCanvas'));

export default function IntroSplash({ onEnter }) {
  const { audioLevel } = useAppAudio();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] overflow-hidden bg-[#030008] select-none"
    >
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span
            key={`star-${index}`}
            className={`absolute h-px w-px rounded-full bg-white ${shouldReduceMotion ? '' : 'animate-pulse'}`}
            style={{
              top: `${(index * 41) % 100}%`,
              left: `${(index * 67) % 100}%`,
              opacity: 0.2 + (index % 3) * 0.1,
              animationDuration: `${2 + (index % 4)}s`,
            }}
          />
        ))}
      </div>

      <StarTrail />

      <Suspense fallback={null}>
        <IntroButterflyCanvas
          audioLevel={audioLevel}
          reducedMotion={Boolean(shouldReduceMotion)}
        />
      </Suspense>

      <button
        type="button"
        data-cursor
        onClick={onEnter}
        className="absolute bottom-8 left-1/2 z-10 min-h-11 -translate-x-1/2 whitespace-nowrap border border-white/20 bg-black/35 px-5 py-3 font-mono text-[9px] font-light tracking-[0.16em] text-white/75 backdrop-blur-md transition duration-300 hover:border-cyan-100/55 hover:text-cyan-50 hover:shadow-[0_0_30px_rgba(103,232,249,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100 sm:bottom-10 sm:px-7 sm:text-[10px]"
      >
        [ INGRESA A MI UNIVERSO ]
      </button>
    </motion.div>
  );
}
