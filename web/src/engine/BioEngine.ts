import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';
import { DEFAULT_AMP, InstrumentationAmp, type AmpSettings } from './amp';
import { DEFAULT_HP, DEFAULT_LP, RcFilter, type RcSettings } from './filters';
import { DEFAULT_NOISE, NoiseSource, type NoiseSettings } from './noise';

export const FS = 1000; // frecuencia de muestreo, Hz
const BUFFER_SECONDS = 30;
// Si la pestaña estuvo oculta, no recuperar más que esto de golpe.
const MAX_STEP = 0.1;

export type EngineState = { playing: boolean };

// Puntos de prueba de la cadena, en orden. Todos en mV referidos a la
// entrada.
export type TestPoint = 'clean' | 'input' | 'amp' | 'hp' | 'out';
export const TEST_POINTS: TestPoint[] = ['clean', 'input', 'amp', 'hp', 'out'];

// Genera la señal en tiempo real fuera de React: en cada cuadro produce
// las muestras del tiempo transcurrido y las guarda en búferes circulares
// que las vistas leen. Guarda la señal en cada punto de prueba: la
// referencia limpia (el ECG solo), la entrada diferencial, la salida del
// amplificador, la del pasa altos y la del pasa bajos (la salida). Como el
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
  readonly amp = new InstrumentationAmp(DEFAULT_AMP);
  readonly hp = new RcFilter('hp', FS, DEFAULT_HP);
  readonly lp = new RcFilter('lp', FS, DEFAULT_LP);
  private taps = Object.fromEntries(
    TEST_POINTS.map((p) => [p, new Float32Array(FS * BUFFER_SECONDS)]),
  ) as Record<TestPoint, Float32Array>;
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
    return Math.max(0, this.count - this.taps.out.length);
  }

  // Muestra i de la salida, en mV.
  sampleAt(i: number) {
    return this.taps.out[i % this.taps.out.length];
  }

  // Muestra i de la referencia limpia, en mV.
  cleanAt(i: number) {
    return this.taps.clean[i % this.taps.clean.length];
  }

  // Muestra i de un punto de prueba, en mV.
  tapAt(point: TestPoint, i: number) {
    const buf = this.taps[point];
    return buf[i % buf.length];
  }

  // Copia las últimas dest.length muestras (con ceros si todavía no hay).
  copyLatest(dest: Float32Array, which: TestPoint) {
    const src = this.taps[which];
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

  setAmp(settings: AmpSettings) {
    this.amp.set(settings);
  }

  setHp(settings: RcSettings) {
    this.hp.set(settings);
  }

  setLp(settings: RcSettings) {
    this.lp.set(settings);
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
    const { clean: tClean, input: tInput, amp: tAmp, hp: tHp, out: tOut } = this.taps;
    const len = tOut.length;
    for (let i = 0; i < n; i++) {
      const t = this.count / FS;
      const j = this.count % len;
      const clean = this.ecg.sample(t);
      // Tensión diferencial entre los electrodos y modo común, en mV.
      const vd = clean + this.noise.sample(t);
      const vcm = this.noise.common;
      let amp = vd;
      if (this.amp.on) {
        const vo = this.amp.process((vcm + vd / 2) / 1000, (vcm - vd / 2) / 1000);
        amp = (vo * 1000) / this.amp.gain;
      }
      const hp = this.hp.process(amp);
      const out = this.lp.process(hp);
      tClean[j] = clean;
      tInput[j] = vd;
      tAmp[j] = amp;
      tHp[j] = hp;
      tOut[j] = out;
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
