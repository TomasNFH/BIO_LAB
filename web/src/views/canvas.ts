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
    let alive = true;
    if (animate) raf = requestAnimationFrame(loop);
    else {
      render();
      // Los rótulos usan una fuente web: al terminar de cargar, se redibuja.
      document.fonts?.ready.then(() => alive && render());
    }

    return () => {
      alive = false;
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

// Los colores y la fuente de los gráficos son variables CSS del tema
// (styles.css, :root). Se leen al usarlas, no al cargar el módulo: el CSS
// se carga después. Cada variable se lee una sola vez.
const themeCache = new Map<string, string>();
export function cssVar(name: string): string {
  let value = themeCache.get(name);
  if (value === undefined) {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (value) themeCache.set(name, value);
  }
  return value;
}

const COLOR_VARS = {
  gridMinor: '--c-grid-minor',
  gridMajor: '--c-grid-major',
  label: '--c-label',
  grid: '--c-grid',
  gridStrong: '--c-grid-strong',
  trace: '--accent', // rama A, turquesa oscuro
  traceHead: '--c-trace-head',
  reference: '--c-reference',
  warning: '--c-noise',
  danger: '--danger',
  noise: '--c-noise',
  highlight: '--c-highlight',
  before: '--c-hp', // antes de los filtros
  hp: '--c-hp',
  lp: '--c-lp',
  notch: '--c-notch',
  aboveNyquist: '--c-above-nyquist',
  envelope: '--c-envelope',
  branchB: '--branch-b', // terracota oscuro
  measured: '--c-measured',
} as const;

export const COLORS = {} as Record<keyof typeof COLOR_VARS, string>;
for (const [key, name] of Object.entries(COLOR_VARS)) {
  Object.defineProperty(COLORS, key, { get: () => cssVar(name), enumerable: true });
}

// Color de cada rama: A turquesa, B terracota.
export const BRANCH_COLORS = {
  get a() { return COLORS.trace; },
  get b() { return COLORS.branchB; },
} as const;

// Fuente de los rótulos: la del cuerpo del tema.
export function font(px: number, weight = 400): string {
  return `${weight} ${px}px ${cssVar('--font-body')}`;
}
