import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAppAudio } from '../audio/AudioContext';
import StarTrail from './StarTrail';

const IntroButterflyCanvas = lazy(() => import('./IntroButterflyCanvas'));

export default function IntroSplash({ onEnter }) {
  const { audioLevel, startIntroAudio } = useAppAudio();
  const shouldReduceMotion = useReducedMotion();
  const [showButterfly, setShowButterfly] = useState(false);

  useEffect(() => {
    startIntroAudio();
  }, [startIntroAudio]);

  useEffect(() => {
    if (shouldReduceMotion) return undefined;

    let idleCallbackId;
    let fallbackTimeoutId;
    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(() => setShowButterfly(true), { timeout: 1200 });
    } else {
      fallbackTimeoutId = window.setTimeout(() => setShowButterfly(true), 500);
    }

    return () => {
      if (idleCallbackId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (fallbackTimeoutId !== undefined) window.clearTimeout(fallbackTimeoutId);
    };
  }, [shouldReduceMotion]);

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

      {showButterfly && !shouldReduceMotion && (
        <Suspense fallback={null}>
          <IntroButterflyCanvas
            audioLevel={audioLevel}
            reducedMotion={Boolean(shouldReduceMotion)}
          />
        </Suspense>
      )}

      <button
        type="button"
        data-cursor
        onClick={onEnter}
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border border-cyan-100/30 bg-[#030816]/60 px-6 py-3 font-mono text-[10px] font-medium tracking-[0.22em] text-cyan-50/90 backdrop-blur-sm transition duration-300 hover:border-cyan-100/60 hover:bg-[#071628]/80 hover:shadow-[0_0_22px_rgba(103,232,249,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100 sm:px-8 sm:text-[11px]"
      >
        [ INGRESA A MI UNIVERSO ]
      </button>
    </motion.div>
  );
}
