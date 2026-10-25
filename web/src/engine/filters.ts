// Filtros RC de primer orden, definidos por sus componentes.
//
// Pasa altos: C en serie y R a masa. Deja pasar los cambios y bloquea la
// continua; quita el offset y la deriva de la línea de base.
// Pasa bajos: R en serie y C a masa. Deja pasar lo lento y atenúa lo
// rápido; quita el ruido muscular y el blanco de alta frecuencia.
//
// En los dos la frecuencia de corte es fc = 1/(2π·R·C): ahí la señal cae
// 3 dB (queda al 71 %) y el desfase es de 45°. La constante de tiempo
// τ = R·C dice cuánto tarda en reaccionar a un escalón.

export type RcSettings = {
  on: boolean;
  r: number; // Ω
  c: number; // F
};

export type RcKind = 'hp' | 'lp';

export const DEFAULT_HP: RcSettings = { on: true, r: 1e6, c: 330e-9 }; // 0,48 Hz
export const DEFAULT_LP: RcSettings = { on: true, r: 10e3, c: 390e-9 }; // 40,8 Hz

// Valores típicos para ECG: monitoreo (más limpio) y diagnóstico (más fiel).
export const PRESETS: Record<RcKind, { label: string; r: number; c: number }[]> = {
  hp: [
    { label: 'Diagnóstico', r: 1e6, c: 3.3e-6 }, // 0,048 Hz
    { label: 'Monitoreo', r: 1e6, c: 330e-9 }, // 0,48 Hz
  ],
  lp: [
    { label: 'Monitoreo', r: 10e3, c: 390e-9 }, // 40,8 Hz
    { label: 'Diagnóstico', r: 10e3, c: 100e-9 }, // 159 Hz
  ],
};

export const cutoff = (s: RcSettings) => 1 / (2 * Math.PI * s.r * s.c);

// El circuito analógico pasado a digital con la transformada bilineal,
// ajustada para que la frecuencia de corte quede exactamente en fc.
export class RcFilter {
  private b0 = 1;
  private b1 = 0;
  private a1 = 0;
  private x1 = 0;
  private y1 = 0;
  private settings: RcSettings;

  constructor(
    readonly kind: RcKind,
    private fs: number,
    settings: RcSettings,
  ) {
    this.settings = { ...settings };
    this.design();
  }

  set(settings: RcSettings) {
    this.settings = { ...settings };
    this.design();
  }

  get on() {
    return this.settings.on;
  }

  // Corre siempre, aunque esté apagado, para que al encenderlo no
  // arranque con un salto; apagado devuelve la entrada.
  process(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 - this.a1 * this.y1;
    this.x1 = x;
    this.y1 = y;
    return this.settings.on ? y : x;
  }

  private design() {
    const k = Math.tan((Math.PI * Math.min(cutoff(this.settings), this.fs * 0.49)) / this.fs);
    this.a1 = (k - 1) / (k + 1);
    if (this.kind === 'lp') {
      this.b0 = k / (1 + k);
      this.b1 = this.b0;
    } else {
      this.b0 = 1 / (1 + k);
      this.b1 = -this.b0;
    }
  }
}

// Respuesta en frecuencia del filtro digital (la misma ecuación que
// procesa la señal): módulo en veces y fase en grados.
export function rcResponse(kind: RcKind, s: RcSettings, f: number, fs: number) {
  if (!s.on) return { mag: 1, phase: 0 };
  const k = Math.tan((Math.PI * Math.min(cutoff(s), fs * 0.49)) / fs);
  const a1 = (k - 1) / (k + 1);
  const b0 = kind === 'lp' ? k / (1 + k) : 1 / (1 + k);
  const b1 = kind === 'lp' ? b0 : -b0;
  const w = (2 * Math.PI * f) / fs;
  // H = (b0 + b1·e^{-jw}) / (1 + a1·e^{-jw})
  const nr = b0 + b1 * Math.cos(w);
  const ni = -b1 * Math.sin(w);
  const dr = 1 + a1 * Math.cos(w);
  const di = -a1 * Math.sin(w);
  const mag = Math.hypot(nr, ni) / Math.hypot(dr, di);
  const phase = ((Math.atan2(ni, nr) - Math.atan2(di, dr)) * 180) / Math.PI;
  return { mag, phase };
}
