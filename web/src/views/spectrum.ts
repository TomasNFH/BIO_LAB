import type { BioEngine } from '../engine/BioEngine';
import { BRANCHES, type Branch } from '../engine/chain';
import { fft } from '../engine/dsp';
import { COLORS } from './canvas';

export const N = 8192; // 8,2 s a 1 kHz: resolución de 0,12 Hz
const UPDATE_MS = 100;
const SMOOTHING = 0.35; // peso de cada espectro nuevo en el promedio

// Series que se analizan: la referencia y, por rama, la salida del
// amplificador (antes de los filtros), la del notch (después de los
// filtros, antes del ADC), la salida del ADC y el ruido solo (salida −
// referencia).
export type Series = 'clean' | `${'amp' | 'notch' | 'out' | 'diff'}_${Branch}`;
const SERIES: Series[] = [
  'clean',
  ...BRANCHES.flatMap((b) => [`amp_${b}`, `notch_${b}`, `out_${b}`, `diff_${b}`] as Series[]),
];

const HANN = (() => {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
})();
const HANN_SUM = HANN.reduce((a, b) => a + b, 0);

// Espectro de amplitud de las últimas N muestras (ventana de Hann), como
// potencia: una senoidal de amplitud A mV da A² en su bin.
function powerSpectrum(x: Float32Array, re: Float64Array, im: Float64Array, out: Float64Array) {
  for (let i = 0; i < N; i++) {
    re[i] = x[i] * HANN[i];
    im[i] = 0;
  }
  fft(re, im);
  for (let k = 0; k < N / 2; k++) {
    const a = (2 * Math.hypot(re[k], im[k])) / HANN_SUM;
    out[k] = a * a;
  }
}

// Calcula los espectros promediados de todas las series, a lo sumo cada
// 100 ms aunque lo pidan varias vistas.
export class Analyzer {
  readonly avg = Object.fromEntries(SERIES.map((s) => [s, new Float64Array(N / 2)])) as Record<Series, Float64Array>;
  private last = -Infinity;
  private primed = false;
  private x = Object.fromEntries(SERIES.map((s) => [s, new Float32Array(N)])) as Record<Series, Float32Array>;
  private re = new Float64Array(N);
  private im = new Float64Array(N);
  private tmp = new Float64Array(N / 2);

  constructor(private engine: BioEngine) {}

  get df() {
    return this.engine.fs / N;
  }

  update(now = performance.now()) {
    if (now - this.last < UPDATE_MS) return;
    this.last = now;
    const { x } = this;
    this.engine.copyLatest(x.clean, 'clean');
    for (const b of BRANCHES) {
      const out = x[`out_${b}`];
      const diff = x[`diff_${b}`];
      this.engine.copyLatest(x[`amp_${b}`], 'amp', b);
      this.engine.copyLatest(x[`notch_${b}`], 'notch', b);
      this.engine.copyLatest(out, 'out', b);
      for (let i = 0; i < N; i++) diff[i] = out[i] - x.clean[i];
    }

    const a = this.primed ? SMOOTHING : 1;
    for (const s of SERIES) {
      powerSpectrum(x[s], this.re, this.im, this.tmp);
      const avg = this.avg[s];
      for (let k = 0; k < avg.length; k++) avg[k] += a * (this.tmp[k] - avg[k]);
    }
    this.primed = true;
  }
}

const analyzers = new WeakMap<BioEngine, Analyzer>();
export function getAnalyzer(engine: BioEngine) {
  let a = analyzers.get(engine);
  if (!a) {
    a = new Analyzer(engine);
    analyzers.set(engine, a);
  }
  return a;
}

// Eje de frecuencia logarítmico entre fMin y fMax.
export function logAxis(fMin: number, fMax: number) {
  const span = Math.log10(fMax / fMin);
  return {
    fMin,
    fMax,
    toX: (f: number, w: number) => (Math.log10(f / fMin) / span) * w,
  };
}
export type LogAxis = ReturnType<typeof logAxis>;

const TICKS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

// Líneas y etiquetas de frecuencia, entre y0 e y1.
export function drawFreqGrid(g: CanvasRenderingContext2D, axis: LogAxis, w: number, y0: number, y1: number, labels = true) {
  g.font = '10px system-ui, sans-serif';
  g.lineWidth = 1;
  g.strokeStyle = COLORS.grid;
  g.fillStyle = COLORS.label;
  let lastLabelEnd = -Infinity;
  for (const f of TICKS) {
    if (f < axis.fMin || f > axis.fMax) continue;
    const x = Math.round(axis.toX(f, w)) + 0.5;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
    if (!labels) continue;
    const label = String(f).replace('.', ',');
    const lx = Math.min(x + 3, w - g.measureText(label).width - 2);
    if (lx < lastLabelEnd + 4) continue;
    g.fillText(label, lx, y1 - 4);
    lastLabelEnd = lx + g.measureText(label).width;
  }
}

// Recorre los bins entre los límites del eje agrupándolos por columna de
// píxel; `emit` recibe la columna y los índices [k0, k1) de sus bins.
export function forEachColumn(axis: LogAxis, w: number, df: number, bins: number, emit: (x: number, k0: number, k1: number) => void) {
  let col = -1;
  let k0 = 0;
  for (let k = 1; k < bins; k++) {
    const f = k * df;
    if (f < axis.fMin) continue;
    if (f > axis.fMax) break;
    const x = Math.round(axis.toX(f, w));
    if (x !== col) {
      if (col >= 0) emit(col, k0, k);
      col = x;
      k0 = k;
    }
  }
  if (col >= 0) emit(col, k0, Math.min(bins, Math.floor(axis.fMax / df) + 1));
}
