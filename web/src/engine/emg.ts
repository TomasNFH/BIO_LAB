import { makeRandom } from './random';

// Electromiograma (EMG) de superficie sintético, con el modelo de unidades
// motoras de Fuglevand, Winter y Patla (1993).
//
// Un músculo tiene muchas unidades motoras: una neurona y las fibras que
// mueve. Cuando la neurona dispara, sus fibras generan un potencial de
// acción (MUAP) que en la piel se ve como una onda bifásica o trifásica de
// pocos milisegundos. El EMG es la suma de todos esos disparos.
//
// - Reclutamiento: al subir el esfuerzo se suman unidades, de las chicas a
//   las grandes (principio del tamaño). Las últimas son hasta 100 veces más
//   grandes que las primeras.
// - Frecuencia de disparo: cada unidad dispara de 8 a 35 veces por segundo
//   según cuánto supera su umbral, con un 15 % de variación al azar.
// Resultado: una señal parecida a ruido, de 20 a 450 Hz, cuya amplitud
// crece con la fuerza.

export type EmgPattern = 'rest' | 'steady' | 'ramp' | 'bursts';

export type EmgSettings = {
  pattern: EmgPattern;
  level: number; // contracción máxima, fracción de la máxima voluntaria
  units: number; // cantidad de unidades motoras
  amplitude: number; // pico del MUAP de la unidad más grande, mV
  period: number; // s, para rampa y ráfagas
};

export const DEFAULT_EMG: EmgSettings = {
  pattern: 'bursts',
  level: 0.5,
  units: 100,
  amplitude: 0.5,
  period: 3,
};

export const EMG_PATTERNS: Record<EmgPattern, string> = {
  rest: 'Reposo',
  steady: 'Sostenida',
  ramp: 'Rampa',
  bursts: 'Ráfagas',
};

const MIN_RATE = 8; // Hz
const MAX_RATE = 35; // Hz
const ISI_CV = 0.15; // variación del intervalo entre disparos
const MAX_THRESHOLD = 0.7; // con 70 % de esfuerzo ya están todas reclutadas
const RAMP_EDGE = 0.15; // s de subida y bajada en las ráfagas

type Unit = {
  threshold: number; // esfuerzo al que se recluta (0 a 1)
  amp: number; // amplitud relativa (1 = la más grande)
  sigma: number; // ancho del MUAP, s
  shape: 1 | 2; // bifásico (1) o trifásico (2)
  sign: 1 | -1;
  next: number; // próximo disparo, s (NaN si no está reclutada)
};

type Spike = { t: number; u: Unit };

// Forma del MUAP: funciones de Hermite-Rodríguez de orden 1 (bifásica) y 2
// (trifásica), normalizadas a pico 1.
function muap(x: number, shape: 1 | 2) {
  const g = Math.exp(-0.5 * x * x);
  return shape === 1 ? x * g * 1.6487 : (1 - x * x) * g;
}

export class EmgSource {
  private settings: EmgSettings;
  private random = makeRandom(5);
  private units: Unit[] = [];
  private spikes: Spike[] = [];
  private lastT = 0;
  private lastLevel = 0;

  constructor(settings: EmgSettings = DEFAULT_EMG) {
    this.settings = { ...settings };
    this.build();
  }

  set(settings: EmgSettings) {
    const rebuild = settings.units !== this.settings.units;
    this.settings = { ...settings };
    if (rebuild) this.build();
  }

  // Esfuerzo pedido en el instante t (0 a 1).
  excitation(t: number) {
    const { pattern, level, period } = this.settings;
    switch (pattern) {
      case 'rest':
        return 0;
      case 'steady':
        return level;
      case 'ramp': {
        const u = (t % period) / period;
        return level * (u < 0.5 ? 2 * u : 2 - 2 * u);
      }
      case 'bursts': {
        // Prendido la primera mitad del período, con bordes suaves.
        const u = t % period;
        const on = period / 2;
        if (u > on) return 0;
        const edge = Math.min(RAMP_EDGE, on / 2);
        const k = u < edge ? u / edge : u > on - edge ? (on - u) / edge : 1;
        return level * (0.5 - 0.5 * Math.cos(Math.PI * k));
      }
    }
  }

  // El último esfuerzo calculado, para mostrarlo.
  get currentLevel() {
    return this.lastLevel;
  }

  // Valor de la señal en mV en el instante t (t debe avanzar).
  sample(t: number) {
    const e = this.excitation(t);
    this.lastLevel = e;
    this.fire(t, e);
    let v = 0;
    let keep = 0;
    for (const s of this.spikes) {
      const x = (t - s.t) / s.u.sigma;
      if (x > 5) continue; // ya pasó: se descarta abajo
      this.spikes[keep++] = s;
      if (x > -5) v += s.u.sign * s.u.amp * muap(x, s.u.shape);
    }
    this.spikes.length = keep;
    this.lastT = t;
    return v * this.settings.amplitude;
  }

  // Programa los disparos de cada unidad hasta un poco después de t (los
  // MUAP empiezan antes de su pico).
  private fire(t: number, e: number) {
    const r = this.random;
    const ahead = t + 0.01;
    for (const u of this.units) {
      if (e <= u.threshold) {
        u.next = NaN;
        continue;
      }
      const rate = MIN_RATE + ((MAX_RATE - MIN_RATE) * (e - u.threshold)) / (1 - u.threshold);
      // Recién reclutada: arranca en una fase al azar.
      if (Number.isNaN(u.next) || u.next < this.lastT - 1) u.next = t + r.next() / rate;
      while (u.next <= ahead) {
        this.spikes.push({ t: u.next, u });
        u.next += Math.max(0.01, (1 / rate) * (1 + ISI_CV * r.gauss()));
      }
    }
  }

  private build() {
    const r = makeRandom(9);
    const n = this.settings.units;
    this.units = [];
    for (let i = 0; i < n; i++) {
      const f = n > 1 ? i / (n - 1) : 0;
      this.units.push({
        // Umbrales y amplitudes repartidos en forma exponencial: muchas
        // unidades chicas de umbral bajo y pocas grandes de umbral alto.
        threshold: (MAX_THRESHOLD * (Math.exp(Math.log(30) * f) - 1)) / 29,
        amp: Math.exp(Math.log(100) * f) / 100,
        sigma: 0.001 + 0.002 * r.next(),
        shape: r.next() < 0.5 ? 1 : 2,
        sign: r.next() < 0.5 ? 1 : -1,
        next: NaN,
      });
    }
    this.spikes = [];
  }
}
