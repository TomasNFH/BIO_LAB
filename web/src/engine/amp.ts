// Amplificador de instrumentación de tres op-amps.
//
// Etapa 1: dos seguidores no inversores que comparten Rg. La diferencia
// entre los electrodos se amplifica G1 = 1 + 2·R1/Rg veces; el modo común
// pasa con ganancia 1, porque en Rg no circula corriente si los dos
// electrodos suben juntos.
//
// Etapa 2: amplificador diferencial con R2 y R3. Resta las dos salidas de
// la etapa 1 con ganancia G2 = R3/R2. Si R3' no es exactamente igual a R3,
// la resta no es perfecta y una parte del modo común pasa a la salida: eso
// limita el CMRR.

export const R1 = 25_000; // Ω, fijas en el integrado (como en un INA128)
export const R2 = 10_000; // Ω

export type AmpSettings = {
  on: boolean; // apagado: amplificador ideal (resta perfecta, ganancia 1)
  rg: number; // resistencia de ganancia, Ω
  g2: number; // ganancia de la etapa 2 (R3 = g2 · R2)
  tolerance: number; // desequilibrio de R3' respecto de R3, fracción
  supply: number; // alimentación simétrica ±V
};

export const DEFAULT_AMP: AmpSettings = { on: true, rg: 5100, g2: 10, tolerance: 0.01, supply: 5 };

// Las salidas no llegan a la alimentación: se quedan 1 V antes.
const HEADROOM = 1;

export type AmpGains = {
  g1: number;
  ad2: number; // ganancia diferencial de la etapa 2
  acm2: number; // ganancia de modo común de la etapa 2 (por el desequilibrio)
  gain: number; // ganancia diferencial total
  cmrr: number; // gain / |acm|, veces (Infinity si la resta es perfecta)
  swing: number; // tensión máxima de salida, V
};

export function ampGains(s: AmpSettings): AmpGains {
  const g1 = 1 + (2 * R1) / s.rg;
  // Etapa 2 con R3' = R3·(1 + δ) en la rama no inversora:
  // Vo = k·Vb − m·Va, con m = R3/R2 y k = R3'/(R2 + R3')·(1 + m).
  // Con Va = Vcm − Vd/2 y Vb = Vcm + Vd/2 queda Ad = (k + m)/2, Acm = k − m.
  const m = s.g2;
  const r3p = s.g2 * R2 * (1 + s.tolerance);
  const k = (r3p / (R2 + r3p)) * (1 + m);
  const ad2 = (k + m) / 2;
  const acm2 = k - m;
  const gain = g1 * ad2;
  return {
    g1,
    ad2,
    acm2,
    gain,
    cmrr: acm2 === 0 ? Infinity : gain / Math.abs(acm2),
    swing: s.supply - HEADROOM,
  };
}

export type AmpStats = {
  peakOut: number; // |Vo| máximo, V
  peakStage1: number; // salida de la etapa 1 más alejada de 0, V
  saturated: boolean; // alguna etapa llegó al límite
};

const clip = (v: number, lim: number) => (v > lim ? lim : v < -lim ? -lim : v);

export class InstrumentationAmp {
  private settings: AmpSettings;
  private gains: AmpGains;
  private stats: AmpStats = { peakOut: 0, peakStage1: 0, saturated: false };
  private samples = 0;
  private readAt = 0; // samples en la última lectura de estadísticas
  // Último instante (en muestras procesadas) con alguna etapa saturada.
  private lastSaturation = -Infinity;

  constructor(settings: AmpSettings = DEFAULT_AMP) {
    this.settings = { ...settings };
    this.gains = ampGains(settings);
  }

  set(settings: AmpSettings) {
    this.settings = { ...settings };
    this.gains = ampGains(settings);
  }

  get on() {
    return this.settings.on;
  }

  get gain() {
    return this.gains.gain;
  }

  // ¿Saturó en las últimas n muestras?
  saturatedWithin(n: number) {
    return this.samples - this.lastSaturation <= n;
  }

  // Tensiones en V de los dos electrodos → salida en V.
  process(vp: number, vn: number) {
    const { g1, swing } = this.gains;
    const r = (g1 - 1) / 2; // R1/Rg
    // Etapa 1: cada salida es su entrada más R1/Rg veces la diferencia.
    const a = vp + r * (vp - vn);
    const b = vn + r * (vn - vp);
    const ca = clip(a, swing);
    const cb = clip(b, swing);
    // Etapa 2: resta con ganancia (la rama de vp es la no inversora).
    const m = this.settings.g2;
    const r3p = m * R2 * (1 + this.settings.tolerance);
    const k = (r3p / (R2 + r3p)) * (1 + m);
    const o = k * ca - m * cb;
    const out = clip(o, swing);

    this.samples++;
    const sat = ca !== a || cb !== b || out !== o;
    if (sat) this.lastSaturation = this.samples;
    const st = this.stats;
    st.peakOut = Math.max(st.peakOut, Math.abs(out));
    st.peakStage1 = Math.max(st.peakStage1, Math.abs(ca), Math.abs(cb));
    st.saturated ||= sat;
    return out;
  }

  // Estadísticas desde la última lectura (null si no se procesó nada
  // nuevo, por ejemplo en pausa).
  readStats(): AmpStats | null {
    if (this.samples === this.readAt) return null;
    this.readAt = this.samples;
    const out = this.stats;
    this.stats = { peakOut: 0, peakStage1: 0, saturated: false };
    return out;
  }

}
