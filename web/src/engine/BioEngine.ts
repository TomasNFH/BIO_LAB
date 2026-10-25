import { BRANCHES, Chain, DEFAULT_BRANCHES, type Branch, type ChainSettings } from './chain';
import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';
import { DEFAULT_EOG, EogSource, type EogSettings } from './eog';
import { DEFAULT_NOISE, NoiseSource, type NoiseSettings } from './noise';
import { QrsDetector } from './qrs';

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
export type SourceKind = 'ecg' | 'eog';

// Puntos de prueba, en orden. Los dos primeros son comunes a las dos ramas;
// el resto existe una vez por rama. Todos en mV referidos a la entrada.
export type SharedPoint = 'clean' | 'input';
export type BranchPoint = 'amp' | 'hp' | 'lp' | 'notch' | 'out';
export type TestPoint = SharedPoint | BranchPoint;
const BRANCH_POINTS: BranchPoint[] = ['amp', 'hp', 'lp', 'notch', 'out'];
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

  setEcg(settings: EcgSettings) {
    this.ecg.set(settings);
  }

  setEog(settings: EogSettings) {
    this.eog.set(settings);
  }

  setSource(kind: SourceKind) {
    if (kind === this.source) return;
    this.source = kind;
    for (const b of BRANCHES) this.qrs[b] = new QrsDetector(FS, FS * BUFFER_SECONDS);
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
        const clean = this.source === 'ecg' ? this.ecg.sample(t) : this.eog.sample(t);
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
        // El ADC retiene su valor: se toma tal cual, sin promediar.
        taps.out[j] = this.chains[b].out;
        this.qrs[b].process(taps.out[j], this.count);
      }
      this.count++;
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
