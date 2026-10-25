import { useEffect, useRef } from 'react';

export type DrawFn = (g: CanvasRenderingContext2D, width: number, height: number) => void;

// Ejecuta `draw` en cada cuadro sobre un canvas del tamaño de su caja CSS,
// a la densidad de píxeles del dispositivo. `draw` siempre ve las props
// actuales por una ref, así el bucle no se reinicia al volver a renderizar.
export function useCanvasLoop(draw: DrawFn, animate = true) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (!animate) render();
    });
    ro.observe(canvas);

    let raf = 0;
    const render = () => {
      if (width > 0 && height > 0) {
        g.clearRect(0, 0, width, height);
        drawRef.current(g, width, height);
      }
    };
    const loop = () => {
      render();
      raf = requestAnimationFrame(loop);
    };
    if (animate) raf = requestAnimationFrame(loop);
    else render();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [animate]);

  // Las vistas estáticas se redibujan cuando cambian sus entradas.
  useEffect(() => {
    if (animate) return;
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const rect = canvas.getBoundingClientRect();
    g.clearRect(0, 0, rect.width, rect.height);
    drawRef.current(g, rect.width, rect.height);
  });

  return canvasRef;
}

export const COLORS = {
  gridMinor: 'rgba(255, 110, 110, 0.07)',
  gridMajor: 'rgba(255, 110, 110, 0.2)',
  label: '#8a8d97',
  grid: 'rgba(255, 255, 255, 0.07)',
  gridStrong: 'rgba(255, 255, 255, 0.18)',
  trace: '#5be37a', // verde de monitor
  traceHead: '#c8ffd4',
  reference: 'rgba(200, 202, 210, 0.55)',
  warning: '#f0a848',
  danger: '#f26b5b',
  noise: '#f0a848',
  highlight: 'rgba(240, 168, 72, 0.12)',
};
