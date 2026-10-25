import { BRANCHES, Chain, DEFAULT_BRANCHES, type Branch, type ChainSettings } from './chain';
import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';
import { DEFAULT_NOISE, NoiseSource, type NoiseSettings } from './noise';

export const FS = 1000; // frecuencia de muestreo, Hz
const BUFFER_SECONDS = 30;
// Si la pestaña estuvo oculta, no recuperar más que esto de golpe.
const MAX_STEP = 0.1;

export type EngineState = { playing: boolean };

// Puntos de prueba, en orden. Los dos primeros son comunes a las dos ramas;
// el resto existe una vez por rama. Todos en mV referidos a la entrada.
export type SharedPoint = 'clean' | 'input';
export type BranchPoint = 'amp' | 'hp' | 'lp' | 'out';
export type TestPoint = SharedPoint | BranchPoint;
const BRANCH_POINTS: BranchPoint[] = ['amp', 'hp', 'lp', 'out'];
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
// del pasa altos, del pasa bajos y del notch (la salida). Como el
// laboratorio conoce la referencia, puede medir cuánto se aleja la salida
// de ella.
//
// La salida se guarda referida a la entrada: la tensión del amplificador
// dividida por su ganancia, en mV, como la muestra un monitor de ECG. Así
// la escala no cambia al cambiar la ganancia, y la saturación se ve como
// un recorte.
export class BioEngine {
  readonly fs = FS;
  readonly ecg = new EcgSource(DEFAULT_ECG);
  readonly noise = new NoiseSource(FS, DEFAULT_NOISE);
  readonly chains: Record<Branch, Chain> = {
    a: new Chain(FS, DEFAULT_BRANCHES.a),
    b: new Chain(FS, DEFAULT_BRANCHES.b),
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
    for (let i = 0; i < n; i++) {
      const t = this.count / FS;
      const j = this.count % len;
      const clean = this.ecg.sample(t);
      // Tensión diferencial entre los electrodos y modo común, en mV.
      const vd = clean + this.noise.sample(t);
      const vcm = this.noise.common;
      tClean[j] = clean;
      tInput[j] = vd;
      for (const b of BRANCHES) {
        const chain = this.chains[b];
        const taps = this.taps[b];
        chain.process(vd, vcm);
        taps.amp[j] = chain.ampOut;
        taps.hp[j] = chain.hpOut;
        taps.lp[j] = chain.lpOut;
        taps.out[j] = chain.out;
      }
      this.count++;
    }
    this.ecg.prune(this.time - BUFFER_SECONDS);
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
