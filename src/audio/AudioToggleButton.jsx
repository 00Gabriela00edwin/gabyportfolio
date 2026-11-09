import { Volume2, VolumeX } from 'lucide-react';
import { useAppAudio } from './AudioContext';

export default function AudioToggleButton({ className = '' }) {
  const { audioEnabled, toggleAudio } = useAppAudio();

  return (
    <button
      type="button"
      data-cursor
      data-audio-toggle
      onClick={toggleAudio}
      aria-label={audioEnabled ? 'Silenciar audio' : 'Activar audio'}
      aria-pressed={audioEnabled}
      title={`Audio ${audioEnabled ? 'activado' : 'silenciado'}`}
      className={className}
    >
      {audioEnabled
        ? <Volume2 aria-hidden="true" size={17} strokeWidth={1.6} className="animate-pulse" />
        : <VolumeX aria-hidden="true" size={17} strokeWidth={1.6} />}
    </button>
  );
}
