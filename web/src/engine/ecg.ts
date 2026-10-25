import { makeRandom } from './random';

export type EcgSettings = {
  bpm: number; // frecuencia cardíaca media, latidos por minuto
  hrv: number; // variabilidad del intervalo RR, fracción (0.03 = 3 %)
  amplitude: number; // escala de todas las ondas; 1 = onda R de 1 mV
  st: number; // desnivel del segmento ST en mV (+ elevado, − deprimido)
};

export const DEFAULT_ECG: EcgSettings = { bpm: 72, hrv: 0.03, amplitude: 1, st: 0 };

export type WaveName = 'P' | 'Q' | 'R' | 'S' | 'T';

type Wave = {
  name: WaveName;
  a: number; // amplitud en mV (con amplitude = 1)
  mu: number; // posición respecto del pico R, en s, para RR = 1 s
  sigma: number; // ancho de la gaussiana, en s, para RR = 1 s
  // P y T se acercan al R cuando sube la frecuencia (como el QT, fórmula
  // de Bazett: escalan con la raíz de RR). El QRS dura siempre lo mismo.
  scales: boolean;
};

// Derivación II típica.
export const WAVES: Wave[] = [
  { name: 'P', a: 0.15, mu: -0.2, sigma: 0.025, scales: true },
  { name: 'Q', a: -0.12, mu: -0.028, sigma: 0.009, scales: false },
  { name: 'R', a: 1.0, mu: 0, sigma: 0.01, scales: false },
  { name: 'S', a: -0.25, mu: 0.028, sigma: 0.01, scales: false },
  { name: 'T', a: 0.3, mu: 0.3, sigma: 0.06, scales: true },
];

// Punto J (fin del QRS) y centro de la T respecto del R, en s.
const J_POINT = 0.045;
const T_MU = WAVES.find((w) => w.name === 'T')!.mu;

// Hasta dónde llega un latido a cada lado de su pico R, en s (P y T con
// RR largo, más 4 sigmas).
const REACH = 0.7;
const MIN_RR = 0.25;

export type Beat = {
  r: number; // instante del pico R, en s
  rr: number; // intervalo desde el R anterior, en s
};

// ECG sintético: cada latido es una suma de cinco gaussianas (P, Q, R, S,
// T) centradas respecto de su pico R. Los latidos se generan de a uno,
// justo antes de que hagan falta, así un cambio de frecuencia afecta sólo
// a los latidos siguientes y la señal nunca salta.
export class EcgSource {
  private settings: EcgSettings;
  private beats: Beat[] = [];
  private random = makeRandom(1);

  constructor(settings: EcgSettings = DEFAULT_ECG) {
    this.settings = { ...settings };
    const rr = 60 / settings.bpm;
    this.beats.push({ r: 0.4, rr });
  }

  set(settings: EcgSettings) {
    this.settings = { ...settings };
  }

  // Valor de la señal en mV en el instante t (en s). t debe avanzar.
  sample(t: number) {
    // Si la fuente estuvo apagada un rato (se usó el EOG), el corazón
    // arranca de nuevo ahora en vez de rellenar latidos que nadie vio.
    const last = this.beats[this.beats.length - 1];
    if (last.r < t - 2) this.beats = [{ r: t + 0.3, rr: 60 / this.settings.bpm }];
    this.ensure(t + REACH);
    const amp = this.settings.amplitude;
    let v = 0;
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const beat = this.beats[i];
      if (beat.r - REACH > t) continue;
      if (beat.r + REACH < t) break;
      const k = Math.sqrt(beat.rr);
      for (const w of WAVES) {
        const s = w.scales ? k : 1;
        const d = (t - (beat.r + w.mu * s)) / (w.sigma * s);
        v += w.a * Math.exp(-0.5 * d * d) * amp;
      }
      // Segmento ST: una meseta desde el punto J (fin del QRS) que se funde
      // con la onda T. En un infarto o una isquemia queda elevado o
      // deprimido respecto de la línea de base.
      if (this.settings.st !== 0) {
        const rise = 1 / (1 + Math.exp(-(t - (beat.r + J_POINT)) / 0.006));
        const fall = 1 / (1 + Math.exp(-(beat.r + T_MU * k - t) / 0.03));
        v += this.settings.st * rise * fall;
      }
    }
    return v;
  }

  // Latidos con pico R entre t0 y t1.
  beatsBetween(t0: number, t1: number) {
    return this.beats.filter((b) => b.r >= t0 && b.r <= t1);
  }

  // Instante del pico de cada onda de un latido.
  waveTimes(beat: Beat) {
    const k = Math.sqrt(beat.rr);
    return WAVES.map((w) => ({ name: w.name, a: w.a, t: beat.r + w.mu * (w.scales ? k : 1) }));
  }

  // Frecuencia del último latido ya ocurrido en t, en lpm.
  bpmAt(t: number) {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      if (this.beats[i].r <= t) return 60 / this.beats[i].rr;
    }
    return this.settings.bpm;
  }

  // Descarta los latidos anteriores a t.
  prune(t: number) {
    let n = 0;
    while (n < this.beats.length - 1 && this.beats[n].r + REACH < t) n++;
    if (n > 0) this.beats.splice(0, n);
  }

  private ensure(t: number) {
    let last = this.beats[this.beats.length - 1];
    while (last.r < t) {
      const { bpm, hrv } = this.settings;
      const rr = Math.max(MIN_RR, (60 / bpm) * (1 + hrv * this.random.gauss()));
      last = { r: last.r + rr, rr };
      this.beats.push(last);
    }
  }
}
