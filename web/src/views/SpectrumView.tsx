import { useRef } from 'react';
import type { BioEngine } from '../engine/BioEngine';
import { fft } from '../engine/dsp';
import { dec } from '../components/Knob';
import { COLORS, useCanvasLoop } from './canvas';

export type SpectrumOptions = {
  reference: boolean; // mostrar el espectro de la referencia limpia
  noise: boolean; // mostrar el espectro del ruido (salida − referencia)
};

export const DEFAULT_SPECTRUM: SpectrumOptions = { reference: true, noise: false };

const N = 8192; // 8,2 s a 1 kHz: resolución de 0,12 Hz
const F_MIN = 0.1;
const F_MAX = 500;
const DB_MIN = -90;
const DB_MAX = 10;
const UPDATE_MS = 100;
const SMOOTHING = 0.35; // peso de cada espectro nuevo en el promedio

const FREQ_TICKS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

const freqToX = (f: number, w: number) => (Math.log10(f / F_MIN) / Math.log10(F_MAX / F_MIN)) * w;
const dbToY = (db: number, h: number) => ((DB_MAX - db) / (DB_MAX - DB_MIN)) * h;

const HANN = (() => {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  return w;
})();
const HANN_SUM = HANN.reduce((a, b) => a + b, 0);

// Espectro de amplitud de las últimas N muestras (ventana de Hann): una
// senoidal de amplitud A mV aparece con altura A, en dB respecto de 1 mV.
function amplitudeSpectrum(x: Float32Array, re: Float64Array, im: Float64Array, out: Float64Array) {
  for (let i = 0; i < N; i++) {
    re[i] = x[i] * HANN[i];
    im[i] = 0;
  }
  fft(re, im);
  for (let k = 0; k < N / 2; k++) {
    const a = (2 * Math.hypot(re[k], im[k])) / HANN_SUM;
    out[k] = a * a; // potencia, para promediar
  }
}

type State = {
  last: number;
  clean: Float32Array;
  out: Float32Array;
  diff: Float32Array;
  re: Float64Array;
  im: Float64Array;
  tmp: Float64Array;
  avg: { clean: Float64Array; out: Float64Array; diff: Float64Array };
  snr: number;
  primed: boolean;
};

const makeState = (): State => ({
  last: -Infinity,
  clean: new Float32Array(N),
  out: new Float32Array(N),
  diff: new Float32Array(N),
  re: new Float64Array(N),
  im: new Float64Array(N),
  tmp: new Float64Array(N / 2),
  avg: { clean: new Float64Array(N / 2), out: new Float64Array(N / 2), diff: new Float64Array(N / 2) },
  snr: NaN,
  primed: false,
});

// Espectro de la salida de la cadena en verde, la referencia
// limpia en gris y, si se pide, el ruido solo en naranja. Eje de
// frecuencia logarítmico de 0,1 a 500 Hz.
export function SpectrumView({
  engine,
  options,
  band,
}: {
  engine: BioEngine;
  options: SpectrumOptions;
  band: [number, number] | null; // banda resaltada (el ruido bajo el cursor)
}) {
  const state = useRef<State>(makeState());

  const ref = useCanvasLoop((g, w, h) => {
    const s = state.current;
    const now = performance.now();
    if (now - s.last >= UPDATE_MS) {
      s.last = now;
      update(engine, s);
    }

    if (band) {
      const x0 = Math.max(0, freqToX(band[0], w));
      const x1 = Math.min(w, freqToX(band[1], w));
      g.fillStyle = COLORS.highlight;
      g.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    }

    drawGrid(g, w, h);

    const fs = engine.fs;
    if (options.reference) curve(g, w, h, s.avg.clean, fs, COLORS.reference, 1.2);
    curve(g, w, h, s.avg.out, fs, COLORS.trace, 1.5);
    if (options.noise) curve(g, w, h, s.avg.diff, fs, COLORS.noise, 1.2);

    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = COLORS.trace;
    const snr = Number.isFinite(s.snr) ? `${dec(s.snr, 1)} dB` : '∞';
    g.fillText(`SNR ${snr}`, w - 10, 20);
    g.textAlign = 'left';
  });

  return <canvas ref={ref} className="view-canvas spectrum" aria-label="Espectro de la señal" />;
}

function update(engine: BioEngine, s: State) {
  engine.copyLatest(s.clean, 'clean');
  engine.copyLatest(s.out, 'out');
  let pClean = 0;
  let pNoise = 0;
  for (let i = 0; i < N; i++) {
    s.diff[i] = s.out[i] - s.clean[i];
    pClean += s.clean[i] * s.clean[i];
    pNoise += s.diff[i] * s.diff[i];
  }
  // Relación señal/ruido de la ventana: potencia del ECG sobre potencia
  // de todo lo que se le sumó.
  s.snr = pNoise > 0 ? 10 * Math.log10(pClean / pNoise) : Infinity;

  const a = s.primed ? SMOOTHING : 1;
  for (const key of ['clean', 'out', 'diff'] as const) {
    amplitudeSpectrum(s[key], s.re, s.im, s.tmp);
    const avg = s.avg[key];
    for (let k = 0; k < avg.length; k++) avg[k] += a * (s.tmp[k] - avg[k]);
  }
  s.primed = true;
}

// Dibuja una curva con un punto por píxel: donde varios bins caen en la
// misma columna se queda con el mayor, así no se pierden picos angostos.
function curve(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  power: Float64Array,
  fs: number,
  color: string,
  width: number,
) {
  const df = fs / N;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.beginPath();
  let started = false;
  let col = -1;
  let colMax = 0;
  const flush = () => {
    if (col < 0) return;
    const db = 10 * Math.log10(colMax + 1e-20);
    const y = Math.min(h, Math.max(0, dbToY(db, h)));
    if (started) g.lineTo(col, y);
    else g.moveTo(col, y);
    started = true;
  };
  for (let k = 1; k < power.length; k++) {
    const f = k * df;
    if (f < F_MIN) continue;
    if (f > F_MAX) break;
    const x = Math.round(freqToX(f, w));
    if (x !== col) {
      flush();
      col = x;
      colMax = power[k];
    } else colMax = Math.max(colMax, power[k]);
  }
  flush();
  g.stroke();
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number) {
  g.font = '10px system-ui, sans-serif';
  g.lineWidth = 1;
  g.strokeStyle = COLORS.grid;
  g.fillStyle = COLORS.label;
  let lastLabelEnd = -Infinity;
  for (const f of FREQ_TICKS) {
    const x = Math.round(freqToX(f, w)) + 0.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    const label = `${String(f).replace('.', ',')}`;
    const lx = Math.min(x + 3, w - g.measureText(label).width - 2);
    if (lx < lastLabelEnd + 4) continue;
    g.fillText(label, lx, h - 4);
    lastLabelEnd = lx + g.measureText(label).width;
  }
  for (let db = DB_MIN + 10; db <= DB_MAX; db += 10) {
    const y = Math.round(dbToY(db, h)) + 0.5;
    g.strokeStyle = db === 0 ? COLORS.gridStrong : COLORS.grid;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
    g.fillText(`${db}`, 3, y - 3);
  }
  g.fillText('Hz', w - 18, h - 16);
  g.fillText('dB re 1 mV', 3, 12);
}
