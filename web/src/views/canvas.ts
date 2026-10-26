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

// Papel de ECG: fondo crema (lo pone el CSS), cuadrícula terracota y trazos
// oscuros. Mantener al día con los tokens de styles.css.
export const COLORS = {
  gridMinor: 'rgba(224, 90, 71, 0.10)',
  gridMajor: 'rgba(224, 90, 71, 0.28)',
  label: '#6E5D55',
  grid: 'rgba(61, 43, 38, 0.08)',
  gridStrong: 'rgba(61, 43, 38, 0.22)',
  trace: '#23777D', // turquesa oscuro
  traceHead: '#2C1E1A',
  reference: 'rgba(61, 43, 38, 0.4)',
  warning: '#C98A2E',
  danger: '#A8261B',
  noise: '#C98A2E',
  highlight: 'rgba(201, 138, 46, 0.14)',
  before: '#B08A1E', // antes de los filtros
  hp: '#B08A1E',
  lp: '#7A4E6E',
  notch: '#C2557A',
  aboveNyquist: 'rgba(61, 43, 38, 0.05)',
  envelope: 'rgba(201, 138, 46, 0.9)',
  branchB: '#B8432F', // terracota oscuro
  measured: '#2C1E1A',
};

// Color de cada rama: A turquesa, B terracota.
export const BRANCH_COLORS = { a: COLORS.trace, b: COLORS.branchB } as const;
