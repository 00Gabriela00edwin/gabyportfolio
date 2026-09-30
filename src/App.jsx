import { useState } from 'react';
import IntroSplash from './components/IntroSplash';
import Galaxia from './components/src/components/Galaxia';

export default function App() {
  const [hasEntered, setHasEntered] = useState(false);

  return (
    <main className="w-full h-screen bg-space-900 overflow-hidden select-none">
      {!hasEntered ? (
        // Pantalla de bienvenida con tu mariposa, nombre 3D y código estelar
        <IntroSplash onEnter={() => setHasEntered(true)} />
      ) : (
        // Tu entorno galáctico 3D con tus nuevos componentes (Galaxia, SN, SNJA, SX)
        <Galaxia />
      )}
    </main>
  );
}