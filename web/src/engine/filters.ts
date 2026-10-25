// Filtros de la cadena, definidos por sus componentes.
//
// Pasa altos: deja pasar los cambios y bloquea la continua; quita el
// offset y la deriva de la línea de base.
// Pasa bajos: deja pasar lo lento y atenúa lo rápido; quita el ruido
// muscular y el blanco de alta frecuencia.
// Cada uno puede ser un RC de primer orden (cae 20 dB por década) o un
// Sallen-Key de segundo orden con un op-amp (cae 40 dB por década).
//
// En todos la frecuencia de corte es fc = 1/(2π·R·C). En el Sallen-Key R y
// C son los valores base: los dos componentes de cada par se separan para
// dar el Q de la respuesta elegida, sin mover fc.
//
// Notch (doble T): rechaza una sola frecuencia, la de la red. Su Q dice
// qué tan angosta es la muesca.

export type FilterKind = 'hp' | 'lp';
export type Shape = 'butterworth' | 'bessel' | 'chebyshev';

export type FilterSettings = {
  on: boolean;
  r: number; // Ω
  c: number; // F
  order: 1 | 2;
  shape: Shape; // sólo para orden 2
};

export type NotchSettings = {
  on: boolean;
  f0: 50 | 60;
  q: number;
};

// Q de cada respuesta de segundo orden: Butterworth es la más plana en la
// banda de paso, Bessel la que menos deforma la forma de onda y Chebyshev
// (1 dB de ondulación) la que corta más rápido.
export const SHAPES: Record<Shape, { label: string; q: number }> = {
  butterworth: { label: 'Butterworth', q: Math.SQRT1_2 },
  bessel: { label: 'Bessel', q: 0.5773 },
  chebyshev: { label: 'Chebyshev', q: 0.9565 },
};

export const DEFAULT_HP: FilterSettings = { on: true, r: 1e6, c: 330e-9, order: 1, shape: 'butterworth' }; // 0,48 Hz
export const DEFAULT_LP: FilterSettings = { on: true, r: 10e3, c: 390e-9, order: 1, shape: 'butterworth' }; // 40,8 Hz
export const DEFAULT_NOTCH: NotchSettings = { on: false, f0: 50, q: 5 };

// Capacitor fijo de la doble T; las R salen de f0.
export const NOTCH_C = 100e-9;

// Valores típicos para ECG: monitoreo (más limpio) y diagnóstico (más fiel).
export const PRESETS: Record<FilterKind, { label: string; r: number; c: number }[]> = {
  hp: [
    { label: 'Diagnóstico', r: 1e6, c: 3.3e-6 }, // 0,048 Hz
    { label: 'Monitoreo', r: 1e6, c: 330e-9 }, // 0,48 Hz
  ],
  lp: [
    { label: 'Monitoreo', r: 10e3, c: 390e-9 }, // 40,8 Hz
    { label: 'Diagnóstico', r: 10e3, c: 100e-9 }, // 159 Hz
  ],
};

export const cutoff = (s: { r: number; c: number }) => 1 / (2 * Math.PI * s.r * s.c);

// Coeficientes normalizados (a0 = 1) de una sección de hasta segundo orden.
type Coefs = { b0: number; b1: number; b2: number; a1: number; a2: number };
const IDENTITY: Coefs = { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };

// El circuito analógico pasado a digital con la transformada bilineal,
// ajustada para que la frecuencia de corte quede exactamente en fc.
function filterCoefs(kind: FilterKind, s: FilterSettings, fs: number): Coefs {
  const fc = Math.min(cutoff(s), fs * 0.49);
  if (s.order === 1) {
    const k = Math.tan((Math.PI * fc) / fs);
    const a1 = (k - 1) / (k + 1);
    return kind === 'lp'
      ? { b0: k / (1 + k), b1: k / (1 + k), b2: 0, a1, a2: 0 }
      : { b0: 1 / (1 + k), b1: -1 / (1 + k), b2: 0, a1, a2: 0 };
  }
  // Segundo orden (fórmulas de R. Bristow-Johnson).
  const w0 = (2 * Math.PI * fc) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * SHAPES[s.shape].q);
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  if (kind === 'lp') {
    const b = (1 - cos) / 2 / a0;
    return { b0: b, b1: 2 * b, b2: b, a1, a2 };
  }
  const b = (1 + cos) / 2 / a0;
  return { b0: b, b1: -2 * b, b2: b, a1, a2 };
}

function notchCoefs(s: NotchSettings, fs: number): Coefs {
  const w0 = (2 * Math.PI * s.f0) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * s.q);
  const a0 = 1 + alpha;
  return { b0: 1 / a0, b1: (-2 * cos) / a0, b2: 1 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

// Una sección de filtro que procesa muestra a muestra (forma directa I).
// Corre siempre, aunque esté apagada, para que al encenderla no arranque
// con un salto; apagada devuelve la entrada.
class Section {
  private k: Coefs = IDENTITY;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  on = true;

  setCoefs(k: Coefs) {
    this.k = k;
  }

  process(x: number) {
    const { b0, b1, b2, a1, a2 } = this.k;
    const y = b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return this.on ? y : x;
  }
}

export class Filter extends Section {
  constructor(
    readonly kind: FilterKind,
    private fs: number,
    settings: FilterSettings,
  ) {
    super();
    this.set(settings);
  }

  set(s: FilterSettings) {
    this.on = s.on;
    this.setCoefs(filterCoefs(this.kind, s, this.fs));
  }
}

export class Notch extends Section {
  constructor(
    private fs: number,
    settings: NotchSettings,
  ) {
    super();
    this.set(settings);
  }

  set(s: NotchSettings) {
    this.on = s.on;
    this.setCoefs(notchCoefs(s, this.fs));
  }
}

// Respuesta en frecuencia de una sección: módulo en veces y fase en grados.
function response(k: Coefs, f: number, fs: number) {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  // H = (b0 + b1·e^{-jw} + b2·e^{-2jw}) / (1 + a1·e^{-jw} + a2·e^{-2jw})
  const nr = k.b0 + k.b1 * c1 + k.b2 * c2;
  const ni = -k.b1 * s1 - k.b2 * s2;
  const dr = 1 + k.a1 * c1 + k.a2 * c2;
  const di = -k.a1 * s1 - k.a2 * s2;
  return {
    mag: Math.hypot(nr, ni) / Math.hypot(dr, di),
    phase: ((Math.atan2(ni, nr) - Math.atan2(di, dr)) * 180) / Math.PI,
  };
}

const FLAT = { mag: 1, phase: 0 };

export const filterResponse = (kind: FilterKind, s: FilterSettings, f: number, fs: number) =>
  s.on ? response(filterCoefs(kind, s, fs), f, fs) : FLAT;

export const notchResponse = (s: NotchSettings, f: number, fs: number) =>
  s.on ? response(notchCoefs(s, fs), f, fs) : FLAT;
