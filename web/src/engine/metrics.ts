import type { BioEngine } from './BioEngine';
import type { Branch } from './chain';

// Qué tan fiel es la salida de una rama, comparada con la referencia limpia
// en los últimos segundos. Los filtros retrasan la señal unos milisegundos;
// eso no es deformación (un monitor la muestra igual, un poco más tarde),
// así que antes de comparar se alinea la salida con la referencia en el
// retardo que mejor las hace coincidir. Tampoco cuenta el nivel medio: en
// un ECG todo se mide respecto de la línea de base, y un pasa altos quita
// la continua por diseño, así que a las dos señales se les resta su media.
//
// En el ECG, las mediciones por latido usan los mismos puntos que un
// cardiólogo: la línea de base en el segmento PR, el ST 80 ms después del
// pico R y la altura de la R desde la línea de base.
//
// En el EOG importa que la posición de la mirada se mantenga: tras cada
// sacada grande seguida de una fijación larga se mide qué parte del salto
// sigue ahí 1 s después.
type Common = {
  delay: number; // retardo de la salida respecto de la referencia, s
  snr: number; // dB: potencia de la señal sobre potencia de (salida − señal)
  errorRms: number; // mV
};

export type EcgMetrics = Common & {
  kind: 'ecg';
  rPercent: number; // amplitud de la R medida, en % de la real
  stMeasured: number; // desnivel ST medido en la salida, mV
  stTrue: number; // desnivel ST de la referencia, mV
  beats: number; // latidos usados
};

export type EogMetrics = Common & {
  kind: 'eog';
  angleError: number; // error eficaz expresado en grados de mirada
  stepRetained: number; // % del salto que queda 1 s después de la sacada
  steps: number; // sacadas usadas
};

export type Metrics = EcgMetrics | EogMetrics;

const WINDOW = 8; // s
const MAX_DELAY = 0.04; // retardo máximo que se busca, s
// ECG
const PR = [-0.1, -0.06]; // segmento PR respecto del R, s
const ST_AT = 0.08; // dónde se mide el ST respecto del R, s
const R_SEARCH = 0.03; // ventana para buscar el pico R
// EOG
const HOLD = 1; // s después de la sacada en que se mide lo que queda
const MIN_STEP = 5; // grados: sacadas más chicas no se usan

export function measure(engine: BioEngine, branch: Branch): Metrics | null {
  const fs = engine.fs;
  const end = engine.sampleCount;
  const start = Math.max(engine.oldest, end - WINDOW * fs);
  if (end - start < 2 * fs) return null;

  // Retardo que minimiza el error entre la salida y la referencia, las dos
  // sin su media.
  const maxLag = Math.round(MAX_DELAY * fs);
  const last = end - maxLag;
  const n0 = last - start;
  let cMean = 0;
  for (let i = start; i < last; i++) cMean += engine.cleanAt(i);
  cMean /= n0;
  let pClean = 0;
  for (let i = start; i < last; i++) pClean += (engine.cleanAt(i) - cMean) ** 2;
  let lag = 0;
  let pErr = Infinity;
  for (let l = 0; l <= maxLag; l++) {
    let oMean = 0;
    for (let i = start; i < last; i++) oMean += engine.sampleAt(i + l, branch);
    oMean /= n0;
    let e2 = 0;
    for (let i = start; i < last; i++) e2 += (engine.sampleAt(i + l, branch) - oMean - (engine.cleanAt(i) - cMean)) ** 2;
    if (e2 < pErr) {
      pErr = e2;
      lag = l;
    }
  }
  const common: Common = {
    delay: lag / fs,
    snr: pErr > 0 ? 10 * Math.log10(pClean / pErr) : Infinity,
    errorRms: Math.sqrt(pErr / n0),
  };

  const out = (i: number) => engine.sampleAt(i + lag, branch);
  const clean = (i: number) => engine.cleanAt(i);
  const at = (t: number) => Math.round(t * fs);

  if (engine.source === 'eog') {
    // Sacadas grandes seguidas de una fijación de al menos HOLD segundos,
    // enteras dentro de la ventana.
    const sacs = engine.eog.saccadesBetween(start / fs + 0.05, last / fs - HOLD - 0.1);
    const all = engine.eog.saccadesBetween(start / fs, Infinity);
    let retained = 0;
    let steps = 0;
    for (const s of sacs) {
      const endT = s.t0 + s.dur;
      const next = all.find((x) => x.t0 > s.t0);
      if (Math.abs(s.to - s.from) < MIN_STEP || (next && next.t0 < endT + HOLD + 0.02)) continue;
      const i0 = at(s.t0 - 0.03);
      const i1 = at(endT + HOLD);
      const truth = clean(i1) - clean(i0);
      if (Math.abs(truth) < 1e-6) continue;
      retained += (out(i1) - out(i0)) / truth;
      steps++;
    }
    return {
      ...common,
      kind: 'eog',
      angleError: (common.errorRms * 1000) / engine.eog.sensitivity,
      stepRetained: steps ? (100 * retained) / steps : NaN,
      steps,
    };
  }

  const baseline = (x: (i: number) => number, r: number) => {
    let sum = 0;
    let n = 0;
    for (let i = at(r + PR[0]); i <= at(r + PR[1]); i++, n++) sum += x(i);
    return sum / n;
  };
  const peak = (x: (i: number) => number, r: number) => {
    let max = -Infinity;
    for (let i = at(r - R_SEARCH); i <= at(r + R_SEARCH); i++) max = Math.max(max, x(i));
    return max;
  };

  // Latidos enteros dentro de la ventana (con margen para el PR y el ST).
  const beats = engine.ecg.beatsBetween(start / fs - PR[0], last / fs - ST_AT - 0.01);
  let rOut = 0;
  let rClean = 0;
  let stOut = 0;
  let stClean = 0;
  for (const b of beats) {
    const bo = baseline(out, b.r);
    const bc = baseline(clean, b.r);
    rOut += peak(out, b.r) - bo;
    rClean += peak(clean, b.r) - bc;
    stOut += out(at(b.r + ST_AT)) - bo;
    stClean += clean(at(b.r + ST_AT)) - bc;
  }
  const n = Math.max(1, beats.length);
  return {
    ...common,
    kind: 'ecg',
    rPercent: rClean > 0 ? (100 * rOut) / rClean : NaN,
    stMeasured: stOut / n,
    stTrue: stClean / n,
    beats: beats.length,
  };
}
