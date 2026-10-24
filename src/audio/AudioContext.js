import { createContext, useContext } from 'react';

export const AudioContext = createContext(null);

export function useAppAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAppAudio debe usarse dentro de AudioProvider.');
  return context;
}
