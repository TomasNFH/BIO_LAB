import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';
import { DEFAULT_NOISE, NoiseSource, type NoiseSettings } from './noise';

export const FS = 1000; // frecuencia de muestreo, Hz
const BUFFER_SECONDS = 30;
// Si la pestaña estuvo oculta, no recuperar más que esto de golpe.
const MAX_STEP = 0.1;

export type EngineState = { playing: boolean };

// Genera la señal en tiempo real fuera de React: en cada cuadro produce
// las muestras del tiempo transcurrido y las guarda en búferes circulares
// que las vistas leen. Guarda dos señales: la referencia limpia (el ECG
// solo) y la salida (ECG más ruido). Como el laboratorio conoce la
// referencia, puede medir cuánto se aleja la salida de ella.
export class BioEngine {
  readonly fs = FS;
  readonly ecg = new EcgSource(DEFAULT_ECG);
  readonly noise = new NoiseSource(FS, DEFAULT_NOISE);
  private clean = new Float32Array(FS * BUFFER_SECONDS);
  private out = new Float32Array(FS * BUFFER_SECONDS);
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
    return Math.max(0, this.count - this.out.length);
  }

  // Muestra i de la salida, en mV.
  sampleAt(i: number) {
    return this.out[i % this.out.length];
  }

  // Muestra i de la referencia limpia, en mV.
  cleanAt(i: number) {
    return this.clean[i % this.clean.length];
  }

  // Copia las últimas dest.length muestras (con ceros si todavía no hay).
  copyLatest(dest: Float32Array, which: 'clean' | 'out') {
    const src = which === 'clean' ? this.clean : this.out;
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
    const len = this.out.length;
    for (let i = 0; i < n; i++) {
      const t = this.count / FS;
      const clean = this.ecg.sample(t);
      this.clean[this.count % len] = clean;
      this.out[this.count % len] = clean + this.noise.sample(t);
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
