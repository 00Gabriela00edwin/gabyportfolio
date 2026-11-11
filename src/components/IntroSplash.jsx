import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { useAppAudio } from '../audio/AudioContext';
import StarTrail from './StarTrail';

const IntroButterflyCanvas = lazy(() => import('./IntroButterflyCanvas'));
const WELCOME_TEXT = '[ INGRESA A MI UNIVERSO ]';

export default function IntroSplash({ onEnter }) {
  const { audioLevel, startIntroAudio } = useAppAudio();
  const shouldReduceMotion = useReducedMotion();
  const [showButterfly, setShowButterfly] = useState(false);
  const welcomeLettersRef = useRef([]);
  const letterAnimationsRef = useRef([]);

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

  useEffect(() => {
    if (shouldReduceMotion) return undefined;

    letterAnimationsRef.current = welcomeLettersRef.current.map((element) => {
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        element,
        centerX: bounds.left + bounds.width / 2,
        centerY: bounds.top + bounds.height / 2,
        x: gsap.quickTo(element, 'x', { duration: 0.22, ease: 'power2.out' }),
        y: gsap.quickTo(element, 'y', { duration: 0.22, ease: 'power2.out' }),
        scale: gsap.quickTo(element, 'scale', { duration: 0.22, ease: 'power2.out' }),
      };
    });

    return () => {
      letterAnimationsRef.current.forEach((animation) => {
        if (!animation) return;
        animation.x.tween.kill();
        animation.y.tween.kill();
        animation.scale.tween.kill();
        gsap.killTweensOf(animation.element);
      });
      letterAnimationsRef.current = [];
    };
  }, [shouldReduceMotion]);

  const handleWelcomePointerEnter = (event) => {
    if (shouldReduceMotion || event.pointerType === 'touch') return;

    letterAnimationsRef.current.forEach((animation) => {
      if (!animation) return;
      const bounds = animation.element.getBoundingClientRect();
      animation.centerX = bounds.left + bounds.width / 2;
      animation.centerY = bounds.top + bounds.height / 2;
      animation.x(0);
      animation.y(0);
      animation.scale(1);
      animation.element.style.textShadow = 'none';
    });
  };

  const handleWelcomePointerMove = (event) => {
    if (shouldReduceMotion || event.pointerType === 'touch') return;

    const radius = 76;
    const letterInfluences = letterAnimationsRef.current.map((animation) => {
      if (!animation) return;
      const { centerX, centerY } = animation;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const distance = Math.hypot(deltaX, deltaY);
      const influence = Math.max(0, 1 - distance / radius);

      return { animation, deltaX, deltaY, distance, influence };
    });

    letterInfluences.forEach((entry) => {
      if (!entry) return;
      const { animation, deltaX, deltaY, distance, influence } = entry;
      const { element, x, y, scale } = animation;
      scale(1 + influence * 0.5);
      x(distance ? (deltaX / distance) * influence * 12 : 0);
      y(distance ? (deltaY / distance) * influence * 12 : 0);
      element.style.textShadow = influence
        ? `0 0 ${4 + influence * 10}px rgba(165, 243, 252, ${0.2 + influence * 0.45})`
        : 'none';
    });
  };

  const handleWelcomePointerLeave = () => {
    if (shouldReduceMotion) return;

    letterAnimationsRef.current.forEach((animation) => {
      if (!animation) return;
      animation.x.tween.kill();
      animation.y.tween.kill();
      animation.scale.tween.kill();
      gsap.to(animation.element, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.65,
        ease: 'elastic.out(1, 0.45)',
        overwrite: 'auto',
        onComplete: () => {
          animation.element.style.textShadow = 'none';
        },
      });
    });
  };

  return (
    <motion.div
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] overflow-hidden bg-[#030008] select-none"
    >
      <div className="relative h-full">
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
          onPointerEnter={handleWelcomePointerEnter}
          onPointerMove={handleWelcomePointerMove}
          onPointerLeave={handleWelcomePointerLeave}
          aria-label={WELCOME_TEXT}
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-transparent px-3 py-3 font-mono text-[10px] font-medium tracking-[0.22em] text-cyan-50/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-100 sm:px-4 sm:text-[11px]"
        >
          <span aria-hidden="true">
            {Array.from(WELCOME_TEXT).map((character, index) => (
              <span
                key={`${character}-${index}`}
                ref={(element) => {
                  welcomeLettersRef.current[index] = element;
                }}
                className="inline-block"
                style={{ transformOrigin: 'center center' }}
              >
                {character === ' ' ? '\u00a0' : character}
              </span>
            ))}
          </span>
        </button>
      </div>
    </motion.div>
  );
}
