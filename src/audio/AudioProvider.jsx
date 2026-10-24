import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioContext } from './AudioContext';

const SOUND_SETTINGS = {
  type: { startFrequency: 1040, endFrequency: 820, duration: 0.035, volume: 0.006, waveform: 'sine' },
  hover: { startFrequency: 720, endFrequency: 520, duration: 0.09, volume: 0.012, waveform: 'sine' },
  open: { startFrequency: 320, endFrequency: 520, duration: 0.2, volume: 0.016, waveform: 'triangle' },
  close: { startFrequency: 500, endFrequency: 300, duration: 0.15, volume: 0.014, waveform: 'triangle' },
};

export function AudioProvider({ children }) {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const analyserRef = useRef(null);
  const frequencyDataRef = useRef(null);
  const ambientSourceRef = useRef(null);
  const ambientPannerRef = useRef(null);
  const ambientGainRef = useRef(null);
  const lastHoverSoundRef = useRef(0);
  const lastTypeSoundRef = useRef(0);
  const audioEnabledRef = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioError, setAudioError] = useState(false);

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
    ambientGain.gain.value = 0.34;
    masterGain.gain.value = 0.72;
    ambientSource.connect(ambientPanner);
    ambientPanner.connect(ambientGain);
    ambientGain.connect(analyser);
    masterGain.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    masterGainRef.current = masterGain;
    analyserRef.current = analyser;
    ambientSourceRef.current = ambientSource;
    ambientPannerRef.current = ambientPanner;
    ambientGainRef.current = ambientGain;
    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    return audioContext;
  }, []);

  const startAudio = useCallback(async () => {
    try {
      const audioContext = getAudioContext();
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
    } catch (error) {
      console.error('No se pudo activar el audio de la experiencia.', error);
      audioRef.current?.pause();
      audioEnabledRef.current = false;
      setAudioError(true);
      setAudioEnabled(false);
    }
  }, [getAudioContext]);

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
      audioRef.current?.pause();
      audioEnabledRef.current = false;
      setAudioEnabled(false);
      setAudioLevel(0);
      setAudioError(false);
      return;
    }

    void startAudio();
  }, [startAudio]);

  const playSound = useCallback((sound) => {
    const audioContext = audioContextRef.current;
    const settings = SOUND_SETTINGS[sound];
    if (!audioEnabledRef.current || !audioContext || audioContext.state !== 'running' || !settings) return;

    if (sound === 'hover') {
      const now = performance.now();
      if (now - lastHoverSoundRef.current < 140) return;
      lastHoverSoundRef.current = now;
    }
    if (sound === 'type') {
      const now = performance.now();
      if (now - lastTypeSoundRef.current < 65) return;
      lastTypeSoundRef.current = now;
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
    const audioContext = audioContextRef.current;
    if (audioContext) void audioContext.close();
  }, []);

  const value = useMemo(() => ({
    audioEnabled,
    audioLevel,
    audioError,
    playSound,
    startAudio,
    toggleAudio,
    updateAudioListener,
  }), [audioEnabled, audioLevel, audioError, playSound, startAudio, toggleAudio, updateAudioListener]);

  return (
    <AudioContext.Provider value={value}>
      <audio
        ref={audioRef}
        src="/audio/ambient.wav"
        loop
        preload="auto"
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
