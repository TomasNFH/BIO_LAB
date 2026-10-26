import { BRANCHES, Chain, DEFAULT_BRANCHES, type Branch, type ChainSettings } from './chain';
import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';
import { DEFAULT_EMG, EmgSource, type EmgSettings } from './emg';
import { DEFAULT_EOG, EogSource, type EogSettings } from './eog';
import { DEFAULT_NOISE, NoiseSource, type NoiseSettings } from './noise';
import { QrsDetector } from './qrs';
import { RecordingSource, type Recording } from './recording';

export const FS = 1000; // frecuencia de las vistas y los búferes, Hz
// La parte analógica (fuente, ruido, amplificador y filtros) corre más
// rápido, para que haya contenido por encima de lo que el ADC puede
// muestrear y el aliasing sea real.
export const FA = 4000;
const OVERSAMPLE = FA / FS;
const BUFFER_SECONDS = 30;
// Si la pestaña estuvo oculta, no recuperar más que esto de golpe.
const MAX_STEP = 0.1;

export type EngineState = { playing: boolean };

// Señal fisiológica que entra a la cadena.
export type SourceKind = 'ecg' | 'eog' | 'emg' | 'rec';

// Puntos de prueba, en orden. Los dos primeros son comunes a las dos ramas;
// el resto existe una vez por rama. Todos en mV referidos a la entrada,
// salvo la salida del umbral, que es lógica (0 y 1, o −1, 0 y +1).
export type SharedPoint = 'clean' | 'input';
export type BranchPoint = 'amp' | 'hp' | 'lp' | 'notch' | 'out' | 'dlp' | 'thr';
export type TestPoint = SharedPoint | BranchPoint;
const BRANCH_POINTS: BranchPoint[] = ['amp', 'hp', 'lp', 'notch', 'out', 'dlp', 'thr'];
// Sin pulsos en este tiempo, las lpm del umbral dejan de valer.
const RATE_TIMEOUT = 3; // s
const RATE_BEATS = 8; // intervalos que se promedian
const isShared = (p: TestPoint): p is SharedPoint => p === 'clean' || p === 'input';

const makeBuffer = () => new Float32Array(FS * BUFFER_SECONDS);

// Genera la señal en tiempo real fuera de React: en cada cuadro produce
// las muestras del tiempo transcurrido y las guarda en búferes circulares
// que las vistas leen. La misma entrada (ECG más ruido) alimenta dos
// cadenas completas, A y B, para comparar ajustes distintos sobre
// exactamente la misma señal.
//
// Guarda la señal en cada punto de prueba: la referencia limpia (el ECG
// solo), la entrada diferencial y, por rama, la salida del amplificador,
// del pasa altos, del pasa bajos, del notch y del ADC (la salida). Como el
// laboratorio conoce la referencia, puede medir cuánto se aleja la salida
// de ella.
//
// La parte analógica corre a FA = 4 kHz; cada muestra de los búferes (a
// 1 kHz) es el promedio de 4 muestras analógicas, salvo la del ADC, que es
// el valor retenido.
//
// La salida se guarda referida a la entrada: la tensión del amplificador
// dividida por su ganancia, en mV, como la muestra un monitor de ECG. Así
// la escala no cambia al cambiar la ganancia, y la saturación se ve como
// un recorte.
export class BioEngine {
  readonly fs = FS;
  readonly analogFs = FA;
  readonly ecg = new EcgSource(DEFAULT_ECG);
  readonly eog = new EogSource(DEFAULT_EOG);
  readonly emg = new EmgSource(DEFAULT_EMG);
  readonly rec = new RecordingSource();
  source: SourceKind = 'ecg';
  readonly noise = new NoiseSource(FA, DEFAULT_NOISE);
  readonly chains: Record<Branch, Chain> = {
    a: new Chain(FA, DEFAULT_BRANCHES.a),
    b: new Chain(FA, DEFAULT_BRANCHES.b),
  };
  // Un detector de QRS por rama, sobre la salida (lo que vería el equipo).
  // Al cambiar de fuente se reinician, para que aprendan los niveles de
  // nuevo.
  readonly qrs: Record<Branch, QrsDetector> = {
    a: new QrsDetector(FS, FS * BUFFER_SECONDS),
    b: new QrsDetector(FS, FS * BUFFER_SECONDS),
  };
  // Pulsos del umbral de cada rama (índices de muestra, los últimos
  // BUFFER_SECONDS) y cuántos hubo desde la última puesta en cero.
  private pulses: Record<Branch, number[]> = { a: [], b: [] };
  private pulseCount: Record<Branch, number> = { a: 0, b: 0 };
  private shared: Record<SharedPoint, Float32Array> = { clean: makeBuffer(), input: makeBuffer() };
  private taps = Object.fromEntries(
    BRANCHES.map((b) => [b, Object.fromEntries(BRANCH_POINTS.map((p) => [p, makeBuffer()]))]),
  ) as Record<Branch, Record<BranchPoint, Float32Array>>;
  private count = 0; // muestras generadas desde el inicio
  private carry = 0; // fracción de muestra pendiente
  private playing = false;
  private raf = 0;
  private last = 0;
  private listeners = new Set<(s: EngineState) => void>();

  get state(): EngineState {
    return { playing: this.playing };
  }

  // Tiempo de la última muestra generada, en s.
  get time() {
    return this.count / FS;
  }

  get sampleCount() {
    return this.count;
  }

  // Índice de la muestra más vieja que sigue en el búfer.
  get oldest() {
    return Math.max(0, this.count - this.shared.clean.length);
  }

  private buffer(point: TestPoint, branch: Branch) {
    return isShared(point) ? this.shared[point] : this.taps[branch][point];
  }

  // Muestra i de la salida de una rama, en mV.
  sampleAt(i: number, branch: Branch = 'a') {
    const buf = this.taps[branch].out;
    return buf[i % buf.length];
  }

  // ¿La muestra i de la salida es un instante de muestreo del ADC?
  isAdcSample(i: number, branch: Branch) {
    return i % Math.round(FS / this.chains[branch].adc.fs) === 0;
  }

  // Muestra i de la referencia limpia, en mV.
  cleanAt(i: number) {
    return this.shared.clean[i % this.shared.clean.length];
  }

  // Muestra i de un punto de prueba, en mV.
  tapAt(point: TestPoint, i: number, branch: Branch = 'a') {
    const buf = this.buffer(point, branch);
    return buf[i % buf.length];
  }

  // Copia las últimas dest.length muestras (con ceros si todavía no hay).
  copyLatest(dest: Float32Array, point: TestPoint, branch: Branch = 'a') {
    const src = this.buffer(point, branch);
    const n = dest.length;
    const start = this.count - n;
    for (let k = 0; k < n; k++) {
      const i = start + k;
      dest[k] = i < this.oldest ? 0 : src[i % src.length];
    }
  }

  // Pulsos del umbral de una rama que siguen en el búfer.
  pulsesOf(branch: Branch): readonly number[] {
    return this.pulses[branch];
  }

  // Pulsos contados desde la última puesta en cero.
  countOf(branch: Branch) {
    return this.pulseCount[branch];
  }

  resetCount() {
    for (const b of BRANCHES) this.pulseCount[b] = 0;
  }

  // Frecuencia de los pulsos del umbral (latidos por minuto), con los
  // últimos intervalos; null si no hay suficientes o hace mucho del último.
  rateOf(branch: Branch): number | null {
    const p = this.pulses[branch];
    if (p.length < 2 || this.count - p[p.length - 1] > RATE_TIMEOUT * FS) return null;
    const k = Math.min(RATE_BEATS, p.length - 1);
    return (60 * FS * k) / (p[p.length - 1] - p[p.length - 1 - k]);
  }

  // Salida actual del umbral de una rama: −1, 0 o +1 (o 0 y 1).
  directionOf(branch: Branch) {
    return this.chains[branch].dsp.thrOut;
  }

  setEcg(settings: EcgSettings) {
    this.ecg.set(settings);
  }

  setEog(settings: EogSettings) {
    this.eog.set(settings);
  }

  // EOG interactivo: hacia dónde mira el ojo, en grados.
  setGaze(deg: number) {
    this.eog.setTarget(deg);
  }

  setEmg(settings: EmgSettings) {
    this.emg.set(settings);
  }

  setSource(kind: SourceKind) {
    if (kind === this.source) return;
    this.source = kind;
    if (kind === 'rec') this.rec.restart(this.time);
    this.resetDetectors();
  }

  // Registro real (o null) y canal que se reproduce.
  setRecording(rec: Recording | null, channel: number) {
    const changed = rec !== this.rec.recording;
    this.rec.set(rec, channel, this.time);
    if (changed && this.source === 'rec') this.resetDetectors();
  }

  private resetDetectors() {
    for (const b of BRANCHES) {
      this.qrs[b] = new QrsDetector(FS, FS * BUFFER_SECONDS);
      this.pulses[b] = [];
      this.pulseCount[b] = 0;
    }
  }

  setNoise(settings: NoiseSettings) {
    this.noise.set(settings);
  }

  setChain(branch: Branch, settings: ChainSettings) {
    this.chains[branch].set(settings);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  subscribe(fn: (s: EngineState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  // Genera `seconds` segundos de señal.
  advance(seconds: number) {
    const exact = seconds * FS + this.carry;
    const n = Math.floor(exact);
    this.carry = exact - n;
    const { clean: tClean, input: tInput } = this.shared;
    const len = tClean.length;
    const sum = { clean: 0, input: 0, a: [0, 0, 0, 0], b: [0, 0, 0, 0] };
    for (let i = 0; i < n; i++) {
      const j = this.count % len;
      sum.clean = 0;
      sum.input = 0;
      sum.a.fill(0);
      sum.b.fill(0);
      for (let k = 0; k < OVERSAMPLE; k++) {
        const na = this.count * OVERSAMPLE + k;
        const t = na / FA;
        const clean =
          this.source === 'ecg'
            ? this.ecg.sample(t)
            : this.source === 'eog'
              ? this.eog.sample(t)
              : this.source === 'emg'
                ? this.emg.sample(t)
                : this.rec.sample(t);
        // Tensión diferencial entre los electrodos y modo común, en mV.
        const vd = clean + this.noise.sample(t);
        const vcm = this.noise.common;
        sum.clean += clean;
        sum.input += vd;
        for (const b of BRANCHES) {
          const chain = this.chains[b];
          chain.process(vd, vcm, na, FA);
          const s = sum[b];
          s[0] += chain.ampOut;
          s[1] += chain.hpOut;
          s[2] += chain.lpOut;
          s[3] += chain.notchOut;
        }
      }
      tClean[j] = sum.clean / OVERSAMPLE;
      tInput[j] = sum.input / OVERSAMPLE;
      for (const b of BRANCHES) {
        const taps = this.taps[b];
        const s = sum[b];
        taps.amp[j] = s[0] / OVERSAMPLE;
        taps.hp[j] = s[1] / OVERSAMPLE;
        taps.lp[j] = s[2] / OVERSAMPLE;
        taps.notch[j] = s[3] / OVERSAMPLE;
        // El ADC y la etapa digital retienen su valor: se toman tal cual,
        // sin promediar.
        const chain = this.chains[b];
        taps.out[j] = chain.out;
        taps.dlp[j] = chain.dsp.lpOut;
        taps.thr[j] = chain.dsp.thrOut;
        if (chain.dsp.takeCrossing()) {
          this.pulses[b].push(this.count);
          this.pulseCount[b]++;
        }
        this.qrs[b].process(taps.out[j], this.count);
      }
      this.count++;
    }
    for (const b of BRANCHES) {
      const p = this.pulses[b];
      const cut = p.findIndex((i) => i >= this.oldest);
      if (cut > 0) p.splice(0, cut);
      else if (cut < 0) p.length = 0;
    }
    this.ecg.prune(this.time - BUFFER_SECONDS);
    this.eog.prune(this.time);
  }

  private tick = (now: number) => {
    const dt = Math.min(MAX_STEP, (now - this.last) / 1000);
    this.last = now;
    this.advance(dt);
    this.raf = requestAnimationFrame(this.tick);
  };

  private emit() {
    const s = this.state;
    for (const fn of this.listeners) fn(s);
  }
}
