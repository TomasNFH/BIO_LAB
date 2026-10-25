import { DEFAULT_ECG, EcgSource, type EcgSettings } from './ecg';

export const FS = 1000; // frecuencia de muestreo, Hz
const BUFFER_SECONDS = 30;
// Si la pestaña estuvo oculta, no recuperar más que esto de golpe.
const MAX_STEP = 0.1;

export type EngineState = { playing: boolean };

// Genera la señal en tiempo real fuera de React: en cada cuadro produce
// las muestras del tiempo transcurrido y las guarda en un búfer circular
// que las vistas leen.
export class BioEngine {
  readonly fs = FS;
  readonly ecg = new EcgSource(DEFAULT_ECG);
  private buf = new Float32Array(FS * BUFFER_SECONDS);
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
    return Math.max(0, this.count - this.buf.length);
  }

  sampleAt(i: number) {
    return this.buf[i % this.buf.length];
  }

  setEcg(settings: EcgSettings) {
    this.ecg.set(settings);
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
    const len = this.buf.length;
    for (let i = 0; i < n; i++) {
      this.buf[this.count % len] = this.ecg.sample(this.count / FS);
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
