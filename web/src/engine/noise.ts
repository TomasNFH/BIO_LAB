import { Biquad, OnePoleLowpass } from './dsp';
import { makeRandom } from './random';

export type NoiseSettings = {
  enabled: boolean; // interruptor general
  // level: parte diferencial (mV de pico); common: modo común, igual en los
  // dos electrodos (mV de pico).
  mains: { on: boolean; level: number; common: number; freq: 50 | 60; harmonics: boolean };
  wander: { on: boolean; level: number; breath: number }; // mV de pico, Hz
  emg: { on: boolean; level: number; bursts: boolean }; // mV eficaces
  white: { on: boolean; level: number }; // mV eficaces
  offset: { on: boolean; level: number }; // mV de continua
  motion: { on: boolean; level: number; rate: number }; // mV, eventos por minuto
};

export type NoiseId = Exclude<keyof NoiseSettings, 'enabled'>;

export const DEFAULT_NOISE: NoiseSettings = {
  enabled: true,
  mains: { on: true, level: 0.05, common: 200, freq: 50, harmonics: false },
  wander: { on: true, level: 0.3, breath: 0.25 },
  emg: { on: true, level: 0.03, bursts: true },
  white: { on: true, level: 0.01 },
  offset: { on: false, level: 20 },
  motion: { on: false, level: 1.5, rate: 6 },
};

// El EOG es mucho más chico que el ECG (cientos de µV en todo su rango) y
// se registra en la cara, sin el pecho que respira: su juego de ruidos por
// defecto tiene menos deriva y menos EMG.
export const DEFAULT_NOISE_EOG: NoiseSettings = {
  ...DEFAULT_NOISE,
  mains: { ...DEFAULT_NOISE.mains, level: 0.02 },
  wander: { on: true, level: 0.03, breath: 0.25 },
  emg: { on: true, level: 0.01, bursts: true },
  white: { on: true, level: 0.005 },
};

// En el EMG el ruido muscular es la señal: se apaga. Lo que molesta es el
// movimiento (deriva y artefactos), la red y el ruido blanco.
export const DEFAULT_NOISE_EMG: NoiseSettings = {
  ...DEFAULT_NOISE,
  mains: { ...DEFAULT_NOISE.mains, level: 0.05 },
  wander: { on: true, level: 0.15, breath: 0.25 },
  emg: { on: false, level: 0.03, bursts: true },
  white: { on: true, level: 0.005 },
};

// Un registro real ya trae su propio ruido: por defecto no se agrega nada.
export const DEFAULT_NOISE_REC: NoiseSettings = { ...DEFAULT_NOISE, enabled: false };

// Banda de frecuencias donde vive cada ruido, para marcarla en el espectro.
export function noiseBand(id: NoiseId, s: NoiseSettings): [number, number] {
  switch (id) {
    case 'mains':
      return s.mains.harmonics ? [s.mains.freq * 0.95, s.mains.freq * 5.05] : [s.mains.freq * 0.95, s.mains.freq * 1.05];
    case 'wander':
      return [0.03, Math.max(0.6, s.wander.breath * 1.5)];
    case 'emg':
      return [20, 450];
    case 'white':
      return [0.1, 500];
    case 'offset':
      return [0.1, 0.15];
    case 'motion':
      return [0.1, 10];
  }
}

// Valor eficaz de la salida de un filtro alimentado con ruido blanco de
// desvío 1, medido una vez para normalizar los niveles.
function measureRms(make: () => { process: (x: number) => number }, seed: number) {
  const filter = make();
  const random = makeRandom(seed);
  let sum = 0;
  const n = 60000;
  for (let i = 0; i < n; i++) {
    const y = filter.process(random.gauss());
    if (i >= n / 4) sum += y * y;
  }
  return Math.sqrt(sum / (n * 0.75));
}

type MotionEvent = { t0: number; a: number; tau: number };

// Suma de ruidos que se agrega a la señal limpia. Cada ruido tiene su
// propio modelo; el nivel de cada uno está en mV en la entrada. sample()
// devuelve la parte diferencial (entre los dos electrodos) y deja en
// `common` la parte de modo común (la misma en los dos).
export class NoiseSource {
  private settings: NoiseSettings;
  private random = makeRandom(7);
  private emgFilter: Biquad;
  private emgScale: number;
  private emgEnvelope: OnePoleLowpass;
  private burstUntil = 0;
  private wanderLp1: OnePoleLowpass;
  private wanderLp2: OnePoleLowpass;
  private wanderScale: number;
  private motionEvents: MotionEvent[] = [];
  common = 0; // modo común de la última muestra, mV
  private whiteScale: number;

  constructor(
    private fs: number,
    settings: NoiseSettings = DEFAULT_NOISE,
  ) {
    this.settings = structuredClone(settings);
    this.whiteScale = Math.sqrt(fs / 1000);
    // EMG: ruido blanco por un pasa banda ancho centrado en ~80 Hz.
    const emg = () => Biquad.bandpass(80, 0.5, fs);
    this.emgFilter = emg();
    this.emgScale = 1 / measureRms(emg, 11);
    this.emgEnvelope = new OnePoleLowpass(8, fs);
    // Deriva aleatoria: ruido blanco por dos pasa bajos de 0,05 Hz. Es tan
    // lenta que medirla tomaría minutos, así que su ganancia se calcula: dos
    // polos iguales con respuesta al impulso h[n] = a²(n+1)bⁿ dan una
    // varianza de a⁴(1+b²)/(1−b²)³.
    this.wanderLp1 = new OnePoleLowpass(0.05, fs);
    this.wanderLp2 = new OnePoleLowpass(0.05, fs);
    const a = 1 - Math.exp((-2 * Math.PI * 0.05) / fs);
    const b2 = (1 - a) ** 2;
    this.wanderScale = 1 / Math.sqrt((a ** 4 * (1 + b2)) / (1 - b2) ** 3);
  }

  set(settings: NoiseSettings) {
    this.settings = structuredClone(settings);
  }

  // Ruido total en mV en el instante t. Los filtros internos corren
  // siempre, aunque el ruido esté apagado, para que al encenderlo no
  // arranque con un transitorio.
  sample(t: number) {
    const s = this.settings;
    const r = this.random;
    let v = 0;

    // Interferencia de la red eléctrica (50 o 60 Hz), con armónicos impares
    // si los aparatos cercanos deforman la corriente.
    // El cuerpo entero sube y baja con la red (modo común); una parte
    // pequeña llega distinta a cada electrodo (diferencial).
    let common = 0;
    if (s.mains.on) {
      const w = 2 * Math.PI * s.mains.freq * t;
      let m = Math.sin(w);
      if (s.mains.harmonics) m += 0.35 * Math.sin(3 * w + 0.4) + 0.15 * Math.sin(5 * w + 1.1);
      v += s.mains.level * m;
      common = s.mains.common * m;
    }

    // Deriva de la línea de base: la respiración (senoidal lenta) más un
    // paseo aleatorio muy lento (cambios de impedancia piel-electrodo).
    const drift = this.wanderLp2.process(this.wanderLp1.process(r.gauss())) * this.wanderScale;
    if (s.wander.on) {
      v += s.wander.level * (Math.sin(2 * Math.PI * s.wander.breath * t) + 0.5 * drift);
    }

    // Ruido muscular (EMG): ruido de banda ancha que aparece en ráfagas
    // cuando el paciente se mueve o tensa los músculos.
    const emg = this.emgFilter.process(r.gauss()) * this.emgScale;
    if (s.emg.bursts && t >= this.burstUntil && r.next() < 0.25 / this.fs) {
      this.burstUntil = t + 0.4 + 1.6 * r.next();
    }
    const target = !s.emg.bursts || t < this.burstUntil ? 1 : 0.15;
    const envelope = this.emgEnvelope.process(target);
    if (s.emg.on) v += s.emg.level * emg * envelope;

    // Ruido blanco: térmico de los electrodos y del amplificador. Ocupa
    // toda la banda hasta fs/2; se escala para que el nivel de la perilla
    // sea el que hay entre 0 y 500 Hz, la banda que muestran las vistas.
    if (s.white.on) v += s.white.level * this.whiteScale * r.gauss();

    // Offset de continua por la diferencia de potencial de media celda
    // entre los dos electrodos.
    if (s.offset.on) v += s.offset.level;

    // Artefactos de movimiento: saltos que vuelven despacio a cero.
    if (s.motion.on && r.next() < s.motion.rate / 60 / this.fs) {
      const sign = r.next() < 0.5 ? -1 : 1;
      this.motionEvents.push({ t0: t, a: sign * s.motion.level * (0.5 + 0.5 * r.next()), tau: 0.3 + 1.2 * r.next() });
    }
    if (this.motionEvents.length) {
      this.motionEvents = this.motionEvents.filter((e) => t - e.t0 < 6 * e.tau);
      if (s.motion.on) {
        for (const e of this.motionEvents) {
          const dt = t - e.t0;
          v += e.a * (1 - Math.exp(-dt / 0.02)) * Math.exp(-dt / e.tau);
        }
      }
    }

    this.common = s.enabled ? common : 0;
    return s.enabled ? v : 0;
  }
}
