import { useEffect, useRef } from 'react';

const INTERACTIVE_SELECTOR = '[data-cursor], button, a, [role="button"]';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const pointerQuery = window.matchMedia('(pointer: fine)');
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return undefined;

    let frameId = 0;
    let previousTime = 0;
    let pointerX = -100;
    let pointerY = -100;
    let ringX = pointerX;
    let ringY = pointerY;
    let targetX = pointerX;
    let targetY = pointerY;
    let isVisible = false;
    let isInteractive = false;
    let isWorldInteractive = false;

    const handlePointerMove = (event) => {
      if (!pointerQuery.matches) return;

      pointerX = event.clientX;
      pointerY = event.clientY;
      isVisible = true;

      const target = event.target instanceof Element
        ? event.target.closest(INTERACTIVE_SELECTOR)
        : null;
      isInteractive = Boolean(target) || isWorldInteractive;
      if (target) {
        const bounds = target.getBoundingClientRect();
        targetX = bounds.left + bounds.width / 2;
        targetY = bounds.top + bounds.height / 2;
      } else if (!isWorldInteractive) {
        targetX = pointerX;
        targetY = pointerY;
      }

      dot.style.opacity = '1';
      ring.style.opacity = '1';
      ring.classList.toggle('custom-cursor-ring-active', isInteractive);
    };

    const handlePointerLeave = () => {
      isVisible = false;
      isInteractive = false;
      ring.classList.remove('custom-cursor-ring-active');
      dot.style.opacity = '0';
      ring.style.opacity = '0';
    };

    const handleWorldCursor = (event) => {
      isWorldInteractive = Boolean(event.detail?.active);
      isInteractive = isWorldInteractive;
      ring.classList.toggle('custom-cursor-ring-active', isInteractive);
      if (Number.isFinite(event.detail?.x) && Number.isFinite(event.detail?.y)) {
        targetX = event.detail.x;
        targetY = event.detail.y;
      }
    };

    const animate = (time) => {
      if (!pointerQuery.matches) return;

      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
      previousTime = time;
      const smoothing = 1 - Math.exp(-delta * 20);
      ringX += (targetX - ringX) * smoothing;
      ringY += (targetY - ringY) * smoothing;

      dot.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
      const opacity = isVisible ? (isInteractive ? '1' : '0.72') : '0';
      dot.style.opacity = opacity;
      ring.style.opacity = opacity;
      frameId = window.requestAnimationFrame(animate);
    };

    const handlePointerCapabilityChange = () => {
      document.body.classList.toggle('custom-cursor-active', pointerQuery.matches);
      if (pointerQuery.matches) {
        previousTime = 0;
        frameId = window.requestAnimationFrame(animate);
      } else {
        window.cancelAnimationFrame(frameId);
        handlePointerLeave();
      }
    };

    document.body.classList.toggle('custom-cursor-active', pointerQuery.matches);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('app:world-cursor', handleWorldCursor);
    pointerQuery.addEventListener('change', handlePointerCapabilityChange);
    if (pointerQuery.matches) frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('app:world-cursor', handleWorldCursor);
      pointerQuery.removeEventListener('change', handlePointerCapabilityChange);
      document.body.classList.remove('custom-cursor-active');
    };
  }, []);

  return (
    <>
      <div ref={dotRef} aria-hidden="true" className="custom-cursor-dot" />
      <div ref={ringRef} aria-hidden="true" className="custom-cursor-ring" />
    </>
  );
}
