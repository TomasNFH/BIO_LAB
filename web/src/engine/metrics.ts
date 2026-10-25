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
// Las mediciones por latido usan los mismos puntos que un cardiólogo: la
// línea de base en el segmento PR, el ST 80 ms después del pico R y la
// altura de la R desde la línea de base.
export type Metrics = {
  delay: number; // retardo de la salida respecto de la referencia, s
  snr: number; // dB: potencia del ECG sobre potencia de (salida − ECG)
  errorRms: number; // mV
  rPercent: number; // amplitud de la R medida, en % de la real
  stMeasured: number; // desnivel ST medido en la salida, mV
  stTrue: number; // desnivel ST de la referencia, mV
  beats: number; // latidos usados
};

const WINDOW = 8; // s
const PR = [-0.1, -0.06]; // segmento PR respecto del R, s
const ST_AT = 0.08; // dónde se mide el ST respecto del R, s
const R_SEARCH = 0.03; // ventana para buscar el pico R
const MAX_DELAY = 0.04; // retardo máximo que se busca, s

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

  const out = (i: number) => engine.sampleAt(i + lag, branch);
  const clean = (i: number) => engine.cleanAt(i);
  const at = (t: number) => Math.round(t * fs);
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
    delay: lag / fs,
    snr: pErr > 0 ? 10 * Math.log10(pClean / pErr) : Infinity,
    errorRms: Math.sqrt(pErr / n0),
    rPercent: rClean > 0 ? (100 * rOut) / rClean : NaN,
    stMeasured: stOut / n,
    stTrue: stClean / n,
    beats: beats.length,
  };
}
