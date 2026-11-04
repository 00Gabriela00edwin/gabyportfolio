import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import gsap from 'gsap';
import { useAppAudio } from './audio/AudioContext';
import { AudioProvider } from './audio/AudioProvider';
import CustomCursor from './components/CustomCursor';
import IntroSplash from './components/IntroSplash';

const loadGalaxia = () => import('./components/src/components/Galaxia');
const Galaxia = lazy(loadGalaxia);
const RealWorldCollage = lazy(() => import('./components/RealWorldCollage'));

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AudioProvider>
        <PortfolioApp />
      </AudioProvider>
    </MotionConfig>
  );
}

function PortfolioApp() {
  const [appState, setAppState] = useState('landing');
  const transitionOverlay = useRef(null);
  const transitionInProgress = useRef(false);
  const { startAudio } = useAppAudio();

  const transitionTo = useCallback((nextState) => {
    if (transitionInProgress.current || !transitionOverlay.current) return;
    transitionInProgress.current = true;
    gsap.to(transitionOverlay.current, {
      opacity: 1,
      duration: 0.65,
      ease: 'power2.inOut',
      onComplete: () => setAppState(nextState),
    });
  }, []);

  const finishTransition = useCallback(() => {
    if (!transitionInProgress.current || !transitionOverlay.current) return;
    gsap.to(transitionOverlay.current, {
      opacity: 0,
      duration: 0.75,
      ease: 'power2.out',
      onComplete: () => {
        transitionInProgress.current = false;
      },
    });
  }, []);

  const beginLandingTransition = useCallback(() => {
    void startAudio();
    void loadGalaxia().catch((error) => {
      console.error('No se pudo precargar la vista de la galaxia.', error);
    });
    transitionTo('realWorld');
  }, [startAudio, transitionTo]);
  const enterGalaxy = useCallback(() => {
    gsap.killTweensOf(transitionOverlay.current);
    if (transitionOverlay.current) transitionOverlay.current.style.opacity = '0';
    transitionInProgress.current = false;
    setAppState('galaxy');
  }, []);

  return (
    <main className="relative h-screen w-full select-none overflow-hidden bg-[#030008]">
      <AnimatePresence mode="sync" onExitComplete={finishTransition}>
        {appState === 'landing' && (
          <IntroSplash
            key="landing"
            onEnter={beginLandingTransition}
          />
        )}
        {appState === 'realWorld' && (
          <Suspense key="real-world-loading" fallback={null}>
            <RealWorldCollage
              key="real-world"
              onEnterGalaxy={enterGalaxy}
            />
          </Suspense>
        )}
        {appState === 'galaxy' && (
          <Suspense key="galaxy-loading" fallback={null}>
            <Galaxia
              key="galaxy"
              isEntered
              onExitToRealWorld={() => transitionTo('realWorld')}
            />
          </Suspense>
        )}
      </AnimatePresence>
      <div
        ref={transitionOverlay}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[200] bg-[radial-gradient(circle_at_center,rgba(132,220,255,0.9)_0%,rgba(41,84,139,0.94)_28%,rgba(3,8,24,1)_76%)] opacity-0"
      />
      <CustomCursor />
    </main>
  );
}
