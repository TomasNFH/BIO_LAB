import { makeRandom } from './random';

// Ritmos:
// - sinus: ritmo sinusal normal.
// - af: fibrilación auricular. Las aurículas no se contraen ordenadas: no hay
//   onda P sino ondas "f" chicas y rápidas, y los ventrículos laten a
//   intervalos irregulares sin ningún patrón.
// - pvc: extrasístoles ventriculares. Algunos latidos nacen en el ventrículo:
//   llegan antes, no tienen P, el QRS es ancho y la T va al revés; después
//   viene una pausa compensadora.
// - av2: bloqueo AV de segundo grado tipo Wenckebach (Mobitz I). Las P son
//   regulares, pero el intervalo PR se alarga latido a latido hasta que una
//   P no pasa al ventrículo (4 P, 3 QRS).
// - vt: taquicardia ventricular. Latidos ventriculares seguidos, rápidos y
//   anchos, sin P.
export type Rhythm = 'sinus' | 'af' | 'pvc' | 'av2' | 'vt';

export const RHYTHMS: Record<Rhythm, string> = {
  sinus: 'Sinusal',
  af: 'Fibrilación auricular',
  pvc: 'Extrasístoles',
  av2: 'Bloqueo AV (Wenckebach)',
  vt: 'Taquicardia ventricular',
};

export type EcgSettings = {
  bpm: number; // frecuencia cardíaca media, latidos por minuto
  hrv: number; // variabilidad del intervalo RR, fracción (0.03 = 3 %)
  amplitude: number; // escala de todas las ondas; 1 = onda R de 1 mV
  st: number; // desnivel del segmento ST en mV (+ elevado, − deprimido)
  rhythm: Rhythm;
  pvcRate: number; // fracción de latidos que son extrasístoles
};

export const DEFAULT_ECG: EcgSettings = { bpm: 72, hrv: 0.03, amplitude: 1, st: 0, rhythm: 'sinus', pvcRate: 0.15 };

export type WaveName = 'P' | 'Q' | 'R' | 'S' | 'T' | 'V';

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

// Latido ventricular: QRS ancho sin Q y T invertida.
const V_WAVES: Wave[] = [
  { name: 'V', a: 1.15, mu: 0, sigma: 0.032, scales: false },
  { name: 'S', a: -0.45, mu: 0.07, sigma: 0.03, scales: false },
  { name: 'T', a: -0.45, mu: 0.33, sigma: 0.08, scales: true },
];
const P_WAVE = WAVES[0];
const QRST = WAVES.slice(1);

const VT_RATE = 170; // lpm
// Wenckebach: lo que se alarga el PR en cada latido del ciclo; el último no
// conduce.
const WENCKEBACH = [0, 0.08, 0.13];
const PR_BASE = 0.16;

// Punto J (fin del QRS) y centro de la T respecto del R, en s.
const J_POINT = 0.045;
const T_MU = WAVES.find((w) => w.name === 'T')!.mu;

// Hasta dónde llega un latido a cada lado de su pico R, en s (P y T con
// RR largo, más 4 sigmas).
const REACH = 0.7;
const MIN_RR = 0.25;

// N: latido normal (conducido). V: ventricular. P: onda P bloqueada, sin
// QRS (en ese caso r es dónde habría estado el R).
export type BeatKind = 'N' | 'V' | 'P';

export type Beat = {
  r: number; // instante del pico R, en s
  rr: number; // intervalo desde el QRS anterior, en s
  kind: BeatKind;
  p: number | null; // posición de la onda P respecto del R, s (null: sin P)
};

// ECG sintético: cada latido es una suma de gaussianas (P, Q, R, S, T, o
// las de un latido ventricular) centradas respecto de su pico R. Los
// latidos se generan de a uno, justo antes de que hagan falta, así un
// cambio de frecuencia o de ritmo afecta sólo a los latidos siguientes y la
// señal nunca salta.
export class EcgSource {
  private settings: EcgSettings;
  private beats: Beat[] = [];
  private random = makeRandom(1);
  private lastQrs = 0; // instante del último QRS programado
  private compensate = false; // el próximo latido lleva pausa compensadora
  private avStep = 0; // posición dentro del ciclo de Wenckebach
  private nextP = NaN; // próxima P en el bloqueo AV

  constructor(settings: EcgSettings = DEFAULT_ECG) {
    this.settings = { ...settings };
    const rr = 60 / settings.bpm;
    this.beats.push(this.normal(0.4, rr));
    this.lastQrs = 0.4;
  }

  private normal(r: number, rr: number): Beat {
    return { r, rr, kind: 'N', p: P_WAVE.mu * Math.sqrt(rr) };
  }

  set(settings: EcgSettings) {
    if (settings.rhythm !== this.settings.rhythm) {
      this.compensate = false;
      this.avStep = 0;
      this.nextP = NaN;
    }
    this.settings = { ...settings };
  }

  // Valor de la señal en mV en el instante t (en s). t debe avanzar.
  sample(t: number) {
    // Si la fuente estuvo apagada un rato (se usó el EOG), el corazón
    // arranca de nuevo ahora en vez de rellenar latidos que nadie vio.
    const last = this.beats[this.beats.length - 1];
    if (last.r < t - 2) {
      this.beats = [this.normal(t + 0.3, 60 / this.settings.bpm)];
      this.lastQrs = t + 0.3;
      this.nextP = NaN;
    }
    this.ensure(t + REACH);
    const amp = this.settings.amplitude;
    let v = 0;
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const beat = this.beats[i];
      if (beat.r - REACH > t) continue;
      if (beat.r + REACH < t) break;
      const k = Math.sqrt(beat.rr);
      if (beat.p !== null) {
        const d = (t - (beat.r + beat.p)) / (P_WAVE.sigma * k);
        v += P_WAVE.a * Math.exp(-0.5 * d * d) * amp;
      }
      if (beat.kind === 'P') continue;
      for (const w of beat.kind === 'V' ? V_WAVES : QRST) {
        const s = w.scales ? k : 1;
        const d = (t - (beat.r + w.mu * s)) / (w.sigma * s);
        v += w.a * Math.exp(-0.5 * d * d) * amp;
      }
      // Segmento ST: una meseta desde el punto J (fin del QRS) que se funde
      // con la onda T. En un infarto o una isquemia queda elevado o
      // deprimido respecto de la línea de base.
      if (this.settings.st !== 0 && beat.kind === 'N') {
        const rise = 1 / (1 + Math.exp(-(t - (beat.r + J_POINT)) / 0.006));
        const fall = 1 / (1 + Math.exp(-(beat.r + T_MU * k - t) / 0.03));
        v += this.settings.st * rise * fall;
      }
    }
    // Fibrilación auricular: ondas "f" de 4 a 7 Hz que cambian todo el tiempo.
    if (this.settings.rhythm === 'af') {
      const w = 2 * Math.PI;
      v +=
        amp *
        (0.04 * Math.sin(w * 5.5 * t + 1.5 * Math.sin(w * 0.37 * t)) +
          0.025 * Math.sin(w * 7.1 * t + 1.1 * Math.sin(w * 0.23 * t + 1)) +
          0.015 * Math.sin(w * 4.3 * t + 2));
    }
    return v;
  }

  // Todos los latidos (también las P bloqueadas) con R entre t0 y t1.
  beatsBetween(t0: number, t1: number) {
    return this.beats.filter((b) => b.r >= t0 && b.r <= t1);
  }

  // Los que tienen QRS: lo que un detector debería encontrar.
  qrsBetween(t0: number, t1: number) {
    return this.beats.filter((b) => b.kind !== 'P' && b.r >= t0 && b.r <= t1);
  }

  // Los latidos normales: donde se miden la onda R y el ST.
  normalBetween(t0: number, t1: number) {
    return this.beats.filter((b) => b.kind === 'N' && b.r >= t0 && b.r <= t1);
  }

  // Instante del pico de cada onda de un latido.
  waveTimes(beat: Beat) {
    const k = Math.sqrt(beat.rr);
    const out: { name: WaveName; a: number; t: number }[] = [];
    if (beat.p !== null) out.push({ name: 'P', a: P_WAVE.a, t: beat.r + beat.p });
    if (beat.kind === 'P') return out;
    for (const w of beat.kind === 'V' ? V_WAVES : QRST) out.push({ name: w.name, a: w.a, t: beat.r + w.mu * (w.scales ? k : 1) });
    return out;
  }

  // Frecuencia según el último QRS ya ocurrido en t, en lpm.
  bpmAt(t: number) {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const b = this.beats[i];
      if (b.r <= t && b.kind !== 'P') return 60 / b.rr;
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
      last = this.next(last);
      this.beats.push(last);
      if (last.kind !== 'P') this.lastQrs = last.r;
    }
  }

  // El latido que sigue a `last`, según el ritmo.
  private next(last: Beat): Beat {
    const { bpm, hrv, rhythm, pvcRate } = this.settings;
    const r = this.random;
    const base = 60 / bpm;
    const after = (rr: number) => this.lastQrs + Math.max(MIN_RR, rr);
    switch (rhythm) {
      case 'af': {
        // Intervalos sin ningún patrón, entre 0,3 s y casi el doble del medio.
        const rr = Math.max(0.3, base * (1 + 0.25 * r.gauss()));
        return { r: after(rr), rr, kind: 'N', p: null };
      }
      case 'vt': {
        const rr = (60 / VT_RATE) * (1 + 0.02 * r.gauss());
        return { r: after(rr), rr, kind: 'V', p: null };
      }
      case 'pvc': {
        if (this.compensate) {
          // Pausa compensadora: el siguiente normal llega cuando habría
          // llegado si la extrasístole no hubiera existido.
          this.compensate = false;
          const rr = 2 * base - last.rr;
          return this.normal(after(rr), rr);
        }
        if (last.kind === 'N' && r.next() < pvcRate) {
          this.compensate = true;
          const rr = 0.6 * base;
          return { r: after(rr), rr, kind: 'V', p: null };
        }
        const rr = base * (1 + hrv * r.gauss());
        return this.normal(after(rr), rr);
      }
      case 'av2': {
        // Las P marcan el paso, regulares; el R va detrás a una distancia
        // (PR) que crece hasta que una P no conduce.
        if (Number.isNaN(this.nextP)) this.nextP = this.lastQrs + base - PR_BASE;
        const pTime = this.nextP;
        this.nextP += base;
        const step = this.avStep;
        this.avStep = (step + 1) % (WENCKEBACH.length + 1);
        if (step === WENCKEBACH.length) {
          return { r: pTime + PR_BASE, rr: base, kind: 'P', p: -PR_BASE };
        }
        const pr = PR_BASE + WENCKEBACH[step];
        const rTime = pTime + pr;
        return { r: rTime, rr: rTime - this.lastQrs, kind: 'N', p: -pr };
      }
      default: {
        const rr = base * (1 + hrv * r.gauss());
        return this.normal(after(rr), rr);
      }
    }
  }
}
