import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import { useAppAudio } from './audio/AudioContext';
import { AudioProvider } from './audio/AudioProvider';
import AudioToggleButton from './audio/AudioToggleButton';
import CustomCursor from './components/CustomCursor';
import IntroSplash from './components/IntroSplash';
import RealWorldCollage from './components/RealWorldCollage';

const loadGalaxia = () => import('./components/src/components/Galaxia');
const Galaxia = lazy(loadGalaxia);

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
  const [viewState, setViewState] = useState('landing');
  const [galaxyInitialModule, setGalaxyInitialModule] = useState(null);
  const {
    audioError,
    playAudioEffect,
    setAudioScene,
    startAudio,
    stopIntroAudio,
  } = useAppAudio();

  useEffect(() => {
    setAudioScene(viewState === 'landing' ? 'intro' : viewState === 'galaxy' ? 'galaxy' : 'realWorld');
  }, [setAudioScene, viewState]);

  const handleStart = useCallback(() => {
    stopIntroAudio();
    void startAudio();
    setViewState('realWorld');
  }, [startAudio, stopIntroAudio]);

  const handleEnterGalaxy = useCallback(() => {
    setGalaxyInitialModule(null);
    playAudioEffect('galaxy');
    setAudioScene('galaxy');
    setViewState('galaxy');
  }, [playAudioEffect, setAudioScene]);

  const handleEnterCredentials = useCallback(() => {
    setGalaxyInitialModule('CREDENCIALES');
    playAudioEffect('galaxy');
    setAudioScene('galaxy');
    setViewState('galaxy');
  }, [playAudioEffect, setAudioScene]);

  return (
    <main className="relative h-screen w-full select-none overflow-hidden bg-[#030008]">
      <AnimatePresence mode="sync">
        {viewState === 'landing' && (
          <IntroSplash
            key="landing"
            onEnter={handleStart}
          />
        )}
        {viewState === 'realWorld' && (
          <RealWorldCollage
            key="real-world"
            onEnterGalaxy={handleEnterGalaxy}
            onEnterCredentials={handleEnterCredentials}
          />
        )}
        {viewState === 'galaxy' && (
          <Suspense key="galaxy-loading" fallback={null}>
            <Galaxia
              key="galaxy"
              isEntered
              initialModule={galaxyInitialModule}
              onExitToRealWorld={() => {
                setGalaxyInitialModule(null);
                setViewState('realWorld');
              }}
            />
          </Suspense>
        )}
      </AnimatePresence>
      {viewState !== 'galaxy' && (
        <>
          {audioError && (
            <p
              role="status"
              aria-live="polite"
              className="fixed bottom-[4.5rem] right-4 z-[200] w-max max-w-[90vw] rounded-xl border border-orange-200/15 bg-[#050817]/75 px-3 py-2 text-center font-mono text-[9px] text-orange-100/75 backdrop-blur-xl"
            >
              No se pudo activar el audio. Vuelve a intentarlo desde el control de sonido.
            </p>
          )}
          <AudioToggleButton className="fixed bottom-4 right-4 z-[200] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#07101b]/65 text-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition hover:border-cyan-100/40 hover:bg-[#07101b]/85 hover:text-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200" />
        </>
      )}
      <CustomCursor />
    </main>
  );
}
