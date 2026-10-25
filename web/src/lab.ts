import type { SourceKind } from './engine/BioEngine';
import { DEFAULT_BRANCHES, DEFAULT_CHAIN, type Branch, type ChainSettings } from './engine/chain';
import { DEFAULT_ECG, type EcgSettings } from './engine/ecg';
import { DEFAULT_EMG, type EmgSettings } from './engine/emg';
import { DEFAULT_EOG, type EogSettings } from './engine/eog';
import { DEFAULT_HP, DEFAULT_LP } from './engine/filters';
import { DEFAULT_NOISE, DEFAULT_NOISE_EMG, DEFAULT_NOISE_EOG, type NoiseSettings } from './engine/noise';

// Todo lo que define un experimento: la fuente, su señal, los ruidos de
// cada fuente y las dos cadenas. Las vistas no son parte del ajuste.
export type LabSettings = {
  source: SourceKind;
  ecg: EcgSettings;
  eog: EogSettings;
  emg: EmgSettings;
  noises: Record<SourceKind, NoiseSettings>;
  chains: Record<Branch, ChainSettings>;
};

export type Preset = {
  name: string;
  description: string; // qué mirar
  settings: LabSettings;
};

export const DEFAULT_LAB: LabSettings = {
  source: 'ecg',
  ecg: DEFAULT_ECG,
  eog: DEFAULT_EOG,
  emg: DEFAULT_EMG,
  noises: { ecg: DEFAULT_NOISE, eog: DEFAULT_NOISE_EOG, emg: DEFAULT_NOISE_EMG },
  chains: DEFAULT_BRANCHES,
};

// Mezcla en profundidad: lo que falta en `value` se toma de `base`. Así un
// ajuste guardado con una versión anterior (con menos campos) se puede
// cargar igual.
function merge<T>(base: T, value: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return typeof value === typeof base ? (value as T) : base;
  }
  const v = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(base)) out[key] = merge((base as Record<string, unknown>)[key], v[key]);
  return out as T;
}

export const normalize = (raw: unknown): LabSettings => merge(DEFAULT_LAB, raw);

// Arma un ajuste a partir de los valores por defecto y los cambios de cada
// parte.
function lab(patch: {
  source?: SourceKind;
  ecg?: Partial<EcgSettings>;
  eog?: Partial<EogSettings>;
  emg?: Partial<EmgSettings>;
  noise?: (n: NoiseSettings) => void;
  a?: (c: ChainSettings) => void;
  b?: (c: ChainSettings) => void;
}): LabSettings {
  const s = structuredClone(DEFAULT_LAB);
  if (patch.source) s.source = patch.source;
  Object.assign(s.ecg, patch.ecg);
  Object.assign(s.eog, patch.eog);
  Object.assign(s.emg, patch.emg);
  patch.noise?.(s.noises[s.source]);
  // Las dos ramas parten de la cadena por defecto (la de monitoreo).
  s.chains = { a: structuredClone(DEFAULT_CHAIN), b: structuredClone(DEFAULT_CHAIN) };
  patch.a?.(s.chains.a);
  patch.b?.(s.chains.b);
  return s;
}

const DIAG_HP = { ...DEFAULT_HP, c: 3.3e-6 }; // 0,048 Hz
const DIAG_LP = { ...DEFAULT_LP, c: 100e-9 }; // 159 Hz
// Banda del EMG de superficie: 20 a 450 Hz, de segundo orden.
export const EMG_HP = { ...DEFAULT_HP, r: 10e3, c: 820e-9, order: 2 as const }; // 19,4 Hz
export const EMG_LP = { ...DEFAULT_LP, r: 10e3, c: 35e-9, order: 2 as const }; // 455 Hz

// Experimentos listos para usar: cada uno compara dos ajustes, uno en cada
// rama, sobre la misma señal.
export const BUILTIN_PRESETS: Preset[] = [
  {
    name: 'Inicio: monitoreo contra diagnóstico',
    description: 'A con el pasa altos de monitoreo (0,48 Hz), B con el de diagnóstico (0,048 Hz). Mirar cuánta deriva queda en cada una.',
    settings: DEFAULT_LAB,
  },
  {
    name: 'CMRR: resistencias de 0,1 % contra 5 %',
    description: 'Mucha red en modo común y sin notch. A tiene R3\' casi igual a R3; B, con 5 % de error. Mirar la línea de 50 Hz en el espectro y el CMRR en el panel del amplificador.',
    settings: lab({
      noise: (n) => {
        n.mains.common = 600;
        n.mains.level = 0;
      },
      a: (c) => {
        c.amp.tolerance = 0.001;
        c.lp = { ...DIAG_LP };
      },
      b: (c) => {
        c.amp.tolerance = 0.05;
        c.lp = { ...DIAG_LP };
      },
    }),
  },
  {
    name: 'Saturación por offset de electrodos',
    description: '300 mV de offset. A pone toda la ganancia (×108) antes del pasa altos y satura. B pone ×10 en la etapa 1 (300 mV × 10 = 3 V, todavía entra), deja que el pasa altos quite la continua y recién ahí amplifica otras ×10. Las dos con notch. Mirar el aviso de saturación, la salida del amplificador en Etapas y el panel del amplificador de cada rama.',
    settings: lab({
      noise: (n) => {
        n.offset.on = true;
        n.offset.level = 300;
      },
      a: (c) => {
        c.notch = { ...c.notch, on: true };
      },
      b: (c) => {
        c.amp.rg = 5_600; // G1 ≈ 10
        c.amp.g2 = 1;
        c.post = { gain: 10 };
        c.notch = { ...c.notch, on: true };
      },
    }),
  },
  {
    name: 'Pierna derecha: sin y con DRL',
    description: 'Modo común de 3,2 V y 200 mV de offset, sin notch; las dos ramas con ×10 en la etapa 1 y ×10 después del pasa altos. A sin DRL: en los picos de la red la etapa 1 tiene que llegar a 3,2 + 1,1 V, se pasa de la alimentación y recorta. B con DRL (G = 40): el cuerpo queda a unos 78 mV y no satura nada. Mirar el aviso de saturación, el monitor y el panel del DRL.',
    settings: lab({
      noise: (n) => {
        n.mains.common = 3200;
        n.mains.level = 0;
        n.offset.on = true;
        n.offset.level = 200;
      },
      a: (c) => {
        c.amp.g2 = 1;
        c.post = { gain: 10 };
        c.lp = { ...DIAG_LP };
      },
      b: (c) => {
        c.amp.g2 = 1;
        c.post = { gain: 10 };
        c.lp = { ...DIAG_LP };
        c.drl = { on: true, rf: 500_000 };
      },
    }),
  },
  {
    name: 'ST: pasa altos de 0,5 Hz contra 0,05 Hz',
    description: 'ST elevado 0,2 mV y deriva fuerte. A (0,48 Hz) quita más deriva pero achica el ST; B (0,048 Hz) lo conserva. Mirar la columna ST de las métricas.',
    settings: lab({
      ecg: { st: 0.2 },
      noise: (n) => {
        n.wander.level = 0.5;
      },
      b: (c) => {
        c.hp = { ...DIAG_HP };
      },
    }),
  },
  {
    name: 'Onda R: pasa bajos de 40 Hz contra 150 Hz',
    description: 'Ruido muscular fuerte. A (40 Hz) limpia más pero baja la onda R; B (159 Hz) la conserva con más ruido. Mirar la columna Onda R y el monitor a 50 mm/s.',
    settings: lab({
      noise: (n) => {
        n.emg.level = 0.06;
        n.emg.bursts = false;
      },
      b: (c) => {
        c.lp = { ...DIAG_LP };
      },
    }),
  },
  {
    name: 'Notch: Q alto contra Q bajo',
    description: 'Red diferencial fuerte, pasa bajos de 159 Hz. A con un notch angosto (Q 30) tarda en asentarse; B (Q 1) se asienta rápido pero se come más banda. Mirar el Bode y la oscilación después de cada QRS.',
    settings: lab({
      noise: (n) => {
        n.mains.level = 0.3;
        n.emg.on = false;
      },
      a: (c) => {
        c.lp = { ...DIAG_LP };
        c.notch = { on: true, f0: 50, q: 30 };
      },
      b: (c) => {
        c.lp = { ...DIAG_LP };
        c.notch = { on: true, f0: 50, q: 1 };
      },
    }),
  },
  {
    name: 'Primer orden contra segundo orden',
    description: 'El mismo pasa bajos de 40 Hz: A es un RC, B un Sallen-Key Butterworth. Mirar en el Bode cómo cae cada uno (20 contra 40 dB por década) y el ruido que deja en el espectro.',
    settings: lab({
      noise: (n) => {
        n.emg.level = 0.06;
      },
      b: (c) => {
        c.lp = { ...DEFAULT_LP, order: 2, shape: 'butterworth' };
      },
    }),
  },
  {
    name: 'Aliasing: con y sin pasa bajos',
    description: 'ADC a 100 Hz y red de 60 Hz. A sin pasa bajos: la red aparece doblada en 40 Hz y el ruido muscular se pliega dentro de la banda. B con un Sallen-Key de 16 Hz atenúa 20 dB en Nyquist, a cambio de achatar la onda R. Mirar el espectro debajo de 50 Hz.',
    settings: lab({
      noise: (n) => {
        n.mains.freq = 60;
        n.mains.level = 0.2;
        n.emg.level = 0.05;
        n.emg.bursts = false;
      },
      a: (c) => {
        c.lp = { ...DEFAULT_LP, on: false };
        c.adc = { ...c.adc, fs: 100 };
      },
      b: (c) => {
        c.lp = { ...DEFAULT_LP, order: 2, c: 1e-6 };
        c.adc = { ...c.adc, fs: 100 };
      },
    }),
  },
  {
    name: 'Resolución del ADC: sin y con ganancia',
    description: 'ADC de 8 bits y ±2,5 V, sin ruido. A sin amplificador: 1 LSB son 19,5 mV y el ECG no llega a mover un escalón. B con ganancia ×108: el ECG ocupa varios escalones. Mirar el monitor a 20 mm/mV.',
    settings: lab({
      noise: (n) => {
        n.enabled = false;
      },
      a: (c) => {
        c.amp.on = false;
        c.adc = { ...c.adc, bits: 8 };
      },
      b: (c) => {
        c.adc = { ...c.adc, bits: 8 };
      },
    }),
  },
  {
    name: 'EOG: filtros de ECG contra filtros de EOG',
    description: 'A con la banda de monitoreo del ECG: cada fijación se desvanece hacia cero. B con la banda del EOG (sin pasa altos, 30 Hz): la mirada se mantiene. Mirar el monitor y la columna «Salto visible a 1 s».',
    settings: lab({
      source: 'eog',
      b: (c) => {
        c.hp = { ...DEFAULT_HP, on: false };
        c.lp = { ...DEFAULT_LP, order: 2, c: 530e-9 };
      },
    }),
  },
  {
    name: 'EMG: filtros de ECG contra filtros de EMG',
    description: 'Contracciones en ráfagas. A con la cadena del ECG (pasa bajos de 40 Hz, ADC a 500 Hz): se pierde casi toda la señal y la frecuencia mediana se va para abajo. B con la del EMG (20 a 450 Hz de segundo orden, ADC a 1 kHz): amplitud y envolvente casi iguales a las reales. Mirar las columnas del EMG, el espectro y la envolvente en el monitor.',
    settings: lab({
      source: 'emg',
      b: (c) => {
        c.hp = { ...EMG_HP };
        c.lp = { ...EMG_LP };
        c.adc = { ...c.adc, fs: 1000 };
      },
    }),
  },
  {
    name: 'EMG y aliasing: ADC a 250 Hz contra 1 kHz',
    description: 'Contracción sostenida, los dos con el pasa banda del EMG. A muestrea a 250 Hz: lo que había entre 125 y 450 Hz se dobla por debajo de 125, el espectro cambia de forma y la envolvente sigue peor al músculo. B a 1 kHz. La frecuencia mediana casi no cambia: lo plegado cae a los dos lados. Mirar el espectro con la marca de Nyquist y la columna Envolvente.',
    settings: lab({
      source: 'emg',
      emg: { pattern: 'steady', level: 0.6 },
      a: (c) => {
        c.hp = { ...EMG_HP };
        c.lp = { ...EMG_LP, order: 1 };
        c.adc = { ...c.adc, fs: 250 };
      },
      b: (c) => {
        c.hp = { ...EMG_HP };
        c.lp = { ...EMG_LP, order: 1 };
        c.adc = { ...c.adc, fs: 1000 };
      },
    }),
  },
];

// Ajustes guardados por el usuario, en el navegador. Si el almacenamiento no
// está disponible (navegación privada, bloqueado), simplemente no se guardan.
const STORAGE_KEY = 'bio-lab:presets';

export function loadUserPresets(): Preset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => p && typeof p.name === 'string')
      .map((p) => ({ name: p.name, description: String(p.description ?? ''), settings: normalize(p.settings) }));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets: Preset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}
