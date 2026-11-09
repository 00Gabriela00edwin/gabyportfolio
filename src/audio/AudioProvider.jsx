import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioContext } from './AudioContext';

const SOUND_SETTINGS = {
  hover: { startFrequency: 720, endFrequency: 520, duration: 0.09, volume: 0.012, waveform: 'sine' },
};

const AUDIO_EFFECTS = {
  button: { source: '/audio/boton.mp3', volume: 0.42 },
  collision: { source: '/audio/caidaletras.mp3', volume: 0.55, cooldown: 120 },
  galaxy: { source: '/audio/ingresandoagalaxia.mp3', volume: 0.24 },
};

function getStoredMutePreference() {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('gaby-portfolio-audio-muted') === 'true';
  } catch (error) {
    console.error('No se pudo leer la preferencia de audio.', error);
    return false;
  }
}

export function AudioProvider({ children }) {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const analyserRef = useRef(null);
  const frequencyDataRef = useRef(null);
  const ambientSourceRef = useRef(null);
  const ambientPannerRef = useRef(null);
  const ambientGainRef = useRef(null);
  const galaxyAudioRef = useRef(null);
  const galaxySourceRef = useRef(null);
  const galaxyGainRef = useRef(null);
  const galaxyFallbackGainRef = useRef(null);
  const galaxyOscillatorsRef = useRef([]);
  const galaxyTrackUnavailableRef = useRef(false);
  const trainAudioRef = useRef(null);
  const effectPoolRef = useRef(new Map());
  const effectIndexRef = useRef(new Map());
  const lastEffectTimeRef = useRef(new Map());
  const introAudioRef = useRef(null);
  const walkingAudioRef = useRef(null);
  const porchWalkingAudioRef = useRef(null);
  const walkingRequestedRef = useRef(false);
  const porchWalkingRequestedRef = useRef(false);
  const sceneRef = useRef('realWorld');
  const lastHoverSoundRef = useRef(0);
  const audioEnabledRef = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(getStoredMutePreference);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioError, setAudioError] = useState(false);

  const stopIntroAudio = useCallback(() => {
    if (introAudioRef.current) {
      introAudioRef.current.pause();
      introAudioRef.current.currentTime = 0;
    }
  }, []);

  const startIntroAudio = useCallback((force = false) => {
    if (isMuted && !force) return;
    let introAudio = introAudioRef.current;
    if (!introAudio) {
      introAudio = new window.Audio('/audio/misterio.mp3');
      introAudio.preload = 'auto';
      introAudio.loop = true;
      introAudio.volume = 0.2;
      introAudio.addEventListener('play', () => {
        audioEnabledRef.current = true;
        setAudioEnabled(true);
        setAudioError(false);
      });
      introAudio.addEventListener('error', () => {
        console.error('No se pudo cargar la música de misterio de la introducción.', {
          source: introAudio.currentSrc,
          code: introAudio.error?.code,
        });
        setAudioError(true);
      });
      introAudioRef.current = introAudio;
    }

    void introAudio.play().catch((error) => {
      if (error.name !== 'NotAllowedError') {
        console.error('No se pudo reproducir la música de misterio.', error);
      }
    });
  }, [isMuted]);

  const stopWalkingAudio = useCallback(() => {
    walkingRequestedRef.current = false;
    porchWalkingRequestedRef.current = false;
    [walkingAudioRef.current, porchWalkingAudioRef.current].forEach((player) => {
      if (!player) return;
      player.pause();
      player.currentTime = 0;
    });
  }, []);

  const setTrainPassing = useCallback((isPassing) => {
    const shouldPlay = isPassing
      && sceneRef.current === 'realWorld'
      && !isMuted
      && audioEnabledRef.current;
    let trainAudio = trainAudioRef.current;
    if (!shouldPlay) {
      if (trainAudio && !trainAudio.paused) {
        trainAudio.pause();
        trainAudio.currentTime = 0;
      }
      return;
    }

    if (!trainAudio) {
      trainAudio = new window.Audio('/audio/tren.mp3');
      trainAudio.preload = 'auto';
      trainAudio.loop = true;
      trainAudio.volume = 0.58;
      trainAudio.addEventListener('error', () => {
        console.error('No se pudo cargar el sonido del tren.', {
          source: trainAudio.currentSrc,
          code: trainAudio.error?.code,
        });
      });
      trainAudioRef.current = trainAudio;
    }

    if (trainAudio.paused) {
      trainAudio.currentTime = 0;
      void trainAudio.play().catch((error) => {
        console.error('No se pudo reproducir el sonido del tren.', error);
      });
    }
  }, [isMuted]);

  const stopTrainPassing = useCallback(() => setTrainPassing(false), [setTrainPassing]);

  const startGalaxyAudio = useCallback(() => {
    const galaxyAudio = galaxyAudioRef.current;
    if (!galaxyAudio || isMuted || !galaxyAudio.paused) return;
    void galaxyAudio.play().catch((error) => {
      if (error.name !== 'NotSupportedError' && error.name !== 'NotAllowedError') {
        console.error('No se pudo reproducir el ambiente de la galaxia.', error);
      } else if (error.name === 'NotSupportedError' && !galaxyTrackUnavailableRef.current) {
        console.info('La pista de la galaxia no está disponible; se usará el ambiente sintetizado.');
        galaxyTrackUnavailableRef.current = true;
      }
      if (sceneRef.current !== 'galaxy') return;
      const audioContext = audioContextRef.current;
      const fallbackGain = galaxyFallbackGainRef.current?.gain;
      if (!audioContext || !fallbackGain) return;
      const now = audioContext.currentTime;
      fallbackGain.cancelScheduledValues(now);
      fallbackGain.setTargetAtTime(0.6, now, 0.8);
    });
  }, [isMuted]);

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;

    const audioElement = audioRef.current;
    if (!audioElement) {
      throw new Error('El elemento de audio ambiental aún no está disponible.');
    }

    const audioContext = new window.AudioContext();
    const masterGain = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.88;
    const ambientSource = audioContext.createMediaElementSource(audioElement);
    const ambientPanner = audioContext.createPanner();
    ambientPanner.panningModel = 'HRTF';
    ambientPanner.distanceModel = 'inverse';
    ambientPanner.refDistance = 5;
    ambientPanner.maxDistance = 60;
    ambientPanner.rolloffFactor = 0.6;
    const ambientGain = audioContext.createGain();
    ambientGain.gain.value = sceneRef.current === 'realWorld' ? 1 : 0;
    const galaxyGain = audioContext.createGain();
    galaxyGain.gain.value = sceneRef.current === 'galaxy' ? 0.18 : 0;
    const galaxyFallbackGain = audioContext.createGain();
    galaxyFallbackGain.gain.value = 0;
    const droneFilter = audioContext.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 0.7;
    droneFilter.connect(galaxyFallbackGain);
    [55, 82.41].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const voiceGain = audioContext.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      voiceGain.gain.value = index === 0 ? 0.6 : 0.16;
      oscillator.connect(voiceGain);
      voiceGain.connect(droneFilter);
      oscillator.start();
      galaxyOscillatorsRef.current.push(oscillator);
    });
    masterGain.gain.value = 1;
    ambientSource.connect(ambientPanner);
    ambientPanner.connect(ambientGain);
    ambientGain.connect(masterGain);
    const galaxyAudio = new window.Audio('/audio/enlagalaxia.mp3');
    galaxyAudio.preload = 'auto';
    galaxyAudio.loop = true;
    const galaxySource = audioContext.createMediaElementSource(galaxyAudio);
    galaxySource.connect(galaxyGain);
    galaxyFallbackGain.connect(galaxyGain);
    galaxyGain.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    masterGainRef.current = masterGain;
    analyserRef.current = analyser;
    ambientSourceRef.current = ambientSource;
    ambientPannerRef.current = ambientPanner;
    ambientGainRef.current = ambientGain;
    galaxyAudioRef.current = galaxyAudio;
    galaxySourceRef.current = galaxySource;
    galaxyGainRef.current = galaxyGain;
    galaxyFallbackGainRef.current = galaxyFallbackGain;
    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    return audioContext;
  }, []);

  const setAudioScene = useCallback((scene) => {
    sceneRef.current = scene === 'intro' ? 'intro' : scene === 'galaxy' ? 'galaxy' : 'realWorld';
    if (sceneRef.current !== 'intro') stopIntroAudio();
    if (sceneRef.current !== 'realWorld') {
      stopWalkingAudio();
      stopTrainPassing();
    }
    if (sceneRef.current === 'galaxy') startGalaxyAudio();
    else if (galaxyAudioRef.current) {
      galaxyAudioRef.current.pause();
      galaxyAudioRef.current.currentTime = 0;
    }
    const fallbackGain = galaxyFallbackGainRef.current?.gain;
    if (sceneRef.current !== 'galaxy' && audioContextRef.current && fallbackGain) {
      const now = audioContextRef.current.currentTime;
      fallbackGain.cancelScheduledValues(now);
      fallbackGain.setTargetAtTime(0, now, 0.25);
    }
    const audioContext = audioContextRef.current;
    const natureGain = ambientGainRef.current?.gain;
    const spaceGain = galaxyGainRef.current?.gain;
    if (!audioContext || !natureGain || !spaceGain) return;

    const now = audioContext.currentTime;
    natureGain.cancelScheduledValues(now);
    spaceGain.cancelScheduledValues(now);
    natureGain.setValueAtTime(natureGain.value, now);
    spaceGain.setValueAtTime(spaceGain.value, now);
    natureGain.linearRampToValueAtTime(sceneRef.current === 'realWorld' ? 1 : 0, now + 1.8);
    spaceGain.linearRampToValueAtTime(sceneRef.current === 'galaxy' ? 0.18 : 0, now + 1.8);
  }, [startGalaxyAudio, stopIntroAudio, stopTrainPassing, stopWalkingAudio]);

  const playAudioEffect = useCallback((effect) => {
    const config = AUDIO_EFFECTS[effect];
    if (!config || isMuted) return;

    const now = performance.now();
    const lastPlayed = lastEffectTimeRef.current.get(effect) ?? 0;
    if (config.cooldown && now - lastPlayed < config.cooldown) return;
    lastEffectTimeRef.current.set(effect, now);

    let players = effectPoolRef.current.get(effect);
    if (!players) {
      players = Array.from({ length: 3 }, () => {
        const player = new window.Audio(config.source);
        player.preload = 'auto';
        player.volume = config.volume;
        return player;
      });
      effectPoolRef.current.set(effect, players);
    }

    const currentIndex = effectIndexRef.current.get(effect) ?? 0;
    const player = players[currentIndex];
    effectIndexRef.current.set(effect, (currentIndex + 1) % players.length);
    player.currentTime = 0;
    void player.play().catch((error) => {
      console.error(`No se pudo reproducir el efecto de audio "${effect}".`, error);
    });
  }, [isMuted]);

  const setWalkingAudio = useCallback((isWalking, force = false) => {
    if (sceneRef.current !== 'realWorld') {
      stopWalkingAudio();
      return;
    }
    if (!force && walkingRequestedRef.current === isWalking) return;
    walkingRequestedRef.current = isWalking;
    if (!audioEnabledRef.current) return;

    if (!walkingAudioRef.current) {
      walkingAudioRef.current = new window.Audio('/audio/caminatadeniña.mp3');
      walkingAudioRef.current.preload = 'auto';
      walkingAudioRef.current.loop = true;
      walkingAudioRef.current.volume = 0.28;
    }

    const walkingAudio = walkingAudioRef.current;
    if (isWalking && walkingAudio.paused) {
      void walkingAudio.play().catch((error) => {
        console.error('No se pudo reproducir el sonido de los pasos.', error);
      });
    } else if (!isWalking && !walkingAudio.paused) {
      walkingAudio.pause();
      walkingAudio.currentTime = 0;
    }
  }, [stopWalkingAudio]);

  const setPorchWalkingAudio = useCallback((isWalking, force = false) => {
    if (sceneRef.current !== 'realWorld') {
      stopWalkingAudio();
      return;
    }
    if (!force && porchWalkingRequestedRef.current === isWalking) return;
    porchWalkingRequestedRef.current = isWalking;
    if (isWalking) {
      walkingRequestedRef.current = false;
      if (walkingAudioRef.current) {
        walkingAudioRef.current.pause();
        walkingAudioRef.current.currentTime = 0;
      }
    }
    if (!audioEnabledRef.current) return;

    if (!porchWalkingAudioRef.current) {
      porchWalkingAudioRef.current = new window.Audio('/audio/pasosenlamaderacabaña.mp3');
      porchWalkingAudioRef.current.preload = 'auto';
      porchWalkingAudioRef.current.loop = true;
      porchWalkingAudioRef.current.volume = 0.3;
    }

    const porchAudio = porchWalkingAudioRef.current;
    if (isWalking && porchAudio.paused) {
      void porchAudio.play().catch((error) => {
        console.error('No se pudo reproducir el sonido de pasos sobre la madera.', error);
      });
    } else if (!isWalking && !porchAudio.paused) {
      porchAudio.pause();
      porchAudio.currentTime = 0;
    }
  }, [stopWalkingAudio]);

  const startAudio = useCallback(async (force = false) => {
    if (isMuted && !force) return;
    try {
      const audioContext = getAudioContext();
      setAudioScene(sceneRef.current);
      const audioElement = audioRef.current;
      if (!audioElement) {
        throw new Error('El elemento de audio ambiental no está disponible.');
      }
      audioElement.volume = 1;
      const resumePromise = audioContext.state === 'running'
        ? Promise.resolve()
        : audioContext.resume();
      const playPromise = audioElement.play();
      await Promise.all([resumePromise, playPromise]);
      audioEnabledRef.current = true;
      setAudioEnabled(true);
      setAudioError(false);
      if (walkingRequestedRef.current) setWalkingAudio(true, true);
      if (porchWalkingRequestedRef.current) setPorchWalkingAudio(true, true);
      if (sceneRef.current === 'galaxy') startGalaxyAudio();
    } catch (error) {
      console.error('No se pudo activar el audio de la experiencia.', error);
      audioRef.current?.pause();
      audioEnabledRef.current = false;
      setAudioError(true);
      setAudioEnabled(false);
    }
  }, [getAudioContext, isMuted, setAudioScene, setWalkingAudio, setPorchWalkingAudio, startGalaxyAudio]);

  const updateAudioListener = useCallback((position, forward, up) => {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== 'running') return;
    const listener = audioContext.listener;
    if ('positionX' in listener) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = up.x;
      listener.upY.value = up.y;
      listener.upZ.value = up.z;
      return;
    }

    listener.setPosition(position.x, position.y, position.z);
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }, []);

  const toggleAudio = useCallback(() => {
    if (audioEnabledRef.current) {
      try {
        window.localStorage.setItem('gaby-portfolio-audio-muted', 'true');
      } catch (error) {
        console.error('No se pudo guardar la preferencia de silencio.', error);
      }
      setIsMuted(true);
      audioRef.current?.pause();
      stopWalkingAudio();
      stopTrainPassing();
      stopIntroAudio();
      galaxyAudioRef.current?.pause();
      effectPoolRef.current.forEach((players) => {
        players.forEach((player) => player.pause());
      });
      if (audioContextRef.current?.state === 'running') {
        void audioContextRef.current.suspend();
      }
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      setAudioLevel(0);
      setAudioError(false);
      return;
    }

    try {
      window.localStorage.setItem('gaby-portfolio-audio-muted', 'false');
    } catch (error) {
      console.error('No se pudo guardar la preferencia de audio.', error);
    }
    setIsMuted(false);
    if (sceneRef.current === 'intro') {
      startIntroAudio(true);
    } else {
      void startAudio(true);
    }
  }, [startAudio, startIntroAudio, stopIntroAudio, stopTrainPassing, stopWalkingAudio]);

  const playSound = useCallback((sound) => {
    const audioContext = audioContextRef.current;
    const settings = SOUND_SETTINGS[sound];
    if (!audioEnabledRef.current || !audioContext || audioContext.state !== 'running' || !settings) return;

    if (sound === 'hover') {
      const now = performance.now();
      if (now - lastHoverSoundRef.current < 140) return;
      lastHoverSoundRef.current = now;
    }
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const startTime = audioContext.currentTime;
    const endTime = startTime + settings.duration;

    oscillator.type = settings.waveform;
    oscillator.frequency.setValueAtTime(settings.startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(settings.endFrequency, endTime);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(settings.volume, startTime + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(envelope);
    envelope.connect(masterGainRef.current);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(startTime);
    oscillator.stop(endTime);
  }, []);

  useEffect(() => {
    if (!audioEnabled || !analyserRef.current || !frequencyDataRef.current) {
      setAudioLevel(0);
      return undefined;
    }

    let frameId;
    let lastSampleTime = 0;
    const sampleAudio = (time) => {
      frameId = window.requestAnimationFrame(sampleAudio);
      if (time - lastSampleTime < 100) return;
      lastSampleTime = time;

      const analyser = analyserRef.current;
      const frequencyData = frequencyDataRef.current;
      if (!analyser || !frequencyData) return;
      analyser.getByteFrequencyData(frequencyData);

      const binsToRead = Math.min(18, frequencyData.length);
      let total = 0;
      for (let index = 0; index < binsToRead; index += 1) {
        total += frequencyData[index];
      }
      const nextLevel = total / (binsToRead * 255);
      setAudioLevel((previousLevel) => (
        Math.abs(previousLevel - nextLevel) > 0.012 ? nextLevel : previousLevel
      ));
    };

    frameId = window.requestAnimationFrame(sampleAudio);
    return () => window.cancelAnimationFrame(frameId);
  }, [audioEnabled]);

  const handleAudioError = useCallback((event) => {
    const { error, currentSrc } = event.currentTarget;
    console.error('Error cargando audio ambiental:', {
      source: currentSrc,
      code: error?.code,
      message: error?.message,
    });
    audioEnabledRef.current = false;
    setAudioEnabled(false);
    setAudioLevel(0);
    setAudioError(true);
  }, []);
  const handleAudioCanPlayThrough = useCallback(() => {
    console.info('Audio ambiental listo para reproducir.');
    setAudioError(false);
  }, []);
  const handleAudioPlay = useCallback(() => {
    audioEnabledRef.current = true;
    setAudioEnabled(true);
    setAudioError(false);
  }, []);
  const handleAudioPause = useCallback(() => {
    audioEnabledRef.current = false;
    setAudioEnabled(false);
    setAudioLevel(0);
  }, []);

  useEffect(() => () => {
    ambientSourceRef.current?.disconnect();
    ambientPannerRef.current?.disconnect();
    ambientGainRef.current?.disconnect();
    galaxySourceRef.current?.disconnect();
    galaxyOscillatorsRef.current.forEach((oscillator) => oscillator.stop());
    galaxyOscillatorsRef.current = [];
    stopTrainPassing();
    trainAudioRef.current?.pause();
    trainAudioRef.current?.removeAttribute('src');
    trainAudioRef.current?.load();
    introAudioRef.current?.pause();
    walkingAudioRef.current?.pause();
    porchWalkingAudioRef.current?.pause();
    galaxyAudioRef.current?.pause();
    effectPoolRef.current.forEach((players) => {
      players.forEach((player) => {
        player.pause();
        player.src = '';
      });
    });
    effectPoolRef.current.clear();
    const audioContext = audioContextRef.current;
    if (audioContext) void audioContext.close();
  }, [stopTrainPassing]);

  const value = useMemo(() => ({
    audioEnabled,
    audioLevel,
    audioError,
    isMuted,
    playSound,
    playAudioEffect,
    setAudioScene,
    setWalkingAudio,
    setPorchWalkingAudio,
    setTrainPassing,
    startIntroAudio,
    stopIntroAudio,
    startAudio,
    toggleAudio,
    updateAudioListener,
  }), [audioEnabled, audioLevel, audioError, isMuted, playSound, playAudioEffect, setAudioScene, setWalkingAudio, setPorchWalkingAudio, setTrainPassing, startIntroAudio, stopIntroAudio, startAudio, toggleAudio, updateAudioListener]);

  return (
    <AudioContext.Provider value={value}>
      <AudioClickSounds playAudioEffect={playAudioEffect} />
      <audio
        ref={audioRef}
        src="/audio/ambientesendero.mp3"
        loop
        preload="none"
        onError={handleAudioError}
        onCanPlayThrough={handleAudioCanPlayThrough}
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        className="hidden"
        aria-hidden="true"
      />
      {children}
    </AudioContext.Provider>
  );
}

function AudioClickSounds({ playAudioEffect }) {
  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-audio-toggle]')) return;
      if (target.closest('button, a, canvas')) playAudioEffect('button');
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [playAudioEffect]);

  return null;
}
