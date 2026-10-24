import { useEffect, useRef } from 'react';

const MAX_PARTICLES = 48;
const COLORS = ['255, 232, 174', '255, 255, 255'];

export default function StarTrail() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    const particles = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frameId = 0;
    let lastPoint = null;

    const resizeCanvas = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const drawFrame = (now) => {
      frameId = 0;
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        const progress = (now - particle.bornAt) / particle.life;
        if (progress >= 1) {
          particles.splice(index, 1);
          continue;
        }

        const fade = (1 - progress) ** 2;
        const radius = particle.radius * (1 - progress * 0.82);
        context.globalAlpha = particle.opacity * fade;
        context.fillStyle = `rgb(${particle.color})`;
        context.beginPath();
        context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        context.fill();

        if (particle.isTwinkle) {
          context.globalAlpha = particle.opacity * fade * 0.55;
          context.fillRect(particle.x - 0.25, particle.y - radius * 2, 0.5, radius * 4);
          context.fillRect(particle.x - radius * 2, particle.y - 0.25, radius * 4, 0.5);
        }
      }

      context.globalAlpha = 1;
      if (particles.length > 0) frameId = window.requestAnimationFrame(drawFrame);
    };

    const addParticle = (x, y, now) => {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        bornAt: now,
        life: 520 + Math.random() * 260,
        radius: 0.7 + Math.random() * 1.1,
        opacity: 0.2 + Math.random() * 0.25,
        color: COLORS[Math.random() < 0.65 ? 0 : 1],
        isTwinkle: Math.random() < 0.18,
      });
    };

    const handlePointerMove = (event) => {
      if (reducedMotion) return;

      const point = { x: event.clientX, y: event.clientY };
      if (lastPoint) {
        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        const count = Math.min(3, Math.floor(distance / 12));
        const now = performance.now();

        for (let index = 1; index <= count; index += 1) {
          const progress = index / count;
          addParticle(
            lastPoint.x + (point.x - lastPoint.x) * progress,
            lastPoint.y + (point.y - lastPoint.y) * progress,
            now,
          );
        }
      }

      lastPoint = point;
      if (particles.length > 0 && frameId === 0) {
        frameId = window.requestAnimationFrame(drawFrame);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', handlePointerMove);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1]"
    />
  );
}
