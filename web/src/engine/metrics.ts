import type { BioEngine } from './BioEngine';
import type { Branch } from './chain';
import { fft } from './dsp';

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
  qrs: QrsScore | null;
};

// Qué tan bien detecta los QRS el detector de la rama, contra los latidos
// reales que conoce la fuente.
export type QrsScore = {
  sensitivity: number; // % de latidos reales detectados
  ppv: number; // % de detecciones que eran latidos (valor predictivo positivo)
  missed: number;
  extra: number;
  bpmMeasured: number; // frecuencia según las detecciones
  bpmTrue: number;
};

export type EogMetrics = Common & {
  kind: 'eog';
  angleError: number; // error eficaz expresado en grados de mirada
  stepRetained: number; // % del salto que queda 1 s después de la sacada
  steps: number; // sacadas usadas
};

// En el EMG lo que se usa es la amplitud (cuánta fuerza), la frecuencia
// mediana del espectro (cambia con la fatiga, y también si los filtros o el
// ADC deforman la señal) y la envolvente (cuándo se activa el músculo).
export type EmgMetrics = Common & {
  kind: 'emg';
  rmsPercent: number; // valor eficaz medido, en % del real
  medianMeasured: number; // frecuencia mediana de la salida, Hz
  medianTrue: number; // frecuencia mediana de la referencia, Hz
  envelopeCorr: number; // correlación de las envolventes (RMS en 100 ms), %
};

export type Metrics = EcgMetrics | EogMetrics | EmgMetrics;

const WINDOW = 8; // s
const MAX_DELAY = 0.04; // retardo máximo que se busca, s
// ECG
const PR = [-0.1, -0.06]; // segmento PR respecto del R, s
const ST_AT = 0.08; // dónde se mide el ST respecto del R, s
const R_SEARCH = 0.03; // ventana para buscar el pico R
// Detección de QRS
const QRS_WINDOW = 20; // s
const QRS_LATENCY = 2; // s más nuevos que no se juzgan (búsqueda hacia atrás)
const QRS_TOLERANCE = 0.1; // s entre el R real y la detección
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

  if (engine.source === 'emg') {
    const adc = engine.chains[branch].adc;
    const adcOn = adc.on;
    const step = Math.round(fs / adc.fs);
    let pOut = 0;
    let pRef = 0;
    for (let i = start; i < last; i++) {
      pOut += out(i) ** 2;
      pRef += clean(i) ** 2;
    }
    return {
      ...common,
      kind: 'emg',
      rmsPercent: pRef > 0 ? 100 * Math.sqrt(pOut / pRef) : NaN,
      // La salida del ADC se analiza en sus muestras, a su frecuencia: el
      // escalón con que se dibuja entre muestras no es parte de la señal.
      medianMeasured: adcOn ? medianFrequency((k) => out(k * step), Math.floor(last / step), fs / step) : medianFrequency(out, last, fs),
      medianTrue: medianFrequency(clean, last, fs),
      envelopeCorr: envelopeCorrelation(out, clean, start, last, fs),
    };
  }

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

  // Latidos normales enteros dentro de la ventana (con margen para el PR y
  // el ST); los ventriculares no tienen PR ni ST comparables. Con un
  // registro real salen de sus anotaciones (si tiene).
  const t0 = start / fs - PR[0];
  const t1 = last / fs - ST_AT - 0.01;
  const beats = engine.source === 'rec' ? engine.rec.beatsBetween(t0, t1).filter((b) => b.kind === 'N') : engine.ecg.normalBetween(t0, t1);
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
    qrs: scoreQrs(engine, branch),
  };
}

function scoreQrs(engine: BioEngine, branch: Branch): QrsScore | null {
  const fs = engine.fs;
  const end = engine.sampleCount / fs - QRS_LATENCY;
  // Mientras el detector aprende (al arrancar o al cambiar de fuente) no se
  // juzga; se deja un segundo más para que se asienten los umbrales.
  const start = Math.max(engine.oldest / fs, engine.qrs[branch].readyFrom / fs + 1, end - QRS_WINDOW);
  if (end - start < 4) return null;
  // Los latidos con QRS: una P bloqueada no es un latido que detectar. Con
  // un registro real, los que anotaron los cardiólogos.
  const truth = engine.source === 'rec' ? engine.rec.beatsBetween(start, end) : engine.ecg.qrsBetween(start, end);
  const found = engine.qrs[branch]
    .detectionsBetween(Math.round((start - QRS_TOLERANCE) * fs), Math.round((end + QRS_TOLERANCE) * fs))
    .map((d) => d.i / fs);
  if (!truth.length) return null;
  // Cada latido real se empareja con la detección libre más cercana.
  const used = new Set<number>();
  let hits = 0;
  for (const b of truth) {
    let best = -1;
    let bestD = QRS_TOLERANCE;
    found.forEach((t, k) => {
      const d = Math.abs(t - b.r);
      if (!used.has(k) && d <= bestD) {
        best = k;
        bestD = d;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits++;
    }
  }
  const inside = found.filter((t) => t >= start && t <= end).length;
  const extra = Math.max(0, inside - hits);
  const rr = (times: number[]) => (times.length > 1 ? (times[times.length - 1] - times[0]) / (times.length - 1) : NaN);
  return {
    sensitivity: (100 * hits) / truth.length,
    ppv: hits + extra ? (100 * hits) / (hits + extra) : NaN,
    missed: truth.length - hits,
    extra,
    bpmMeasured: 60 / rr(found.filter((t) => t >= start && t <= end)),
    bpmTrue: 60 / rr(truth.map((b) => b.r)),
  };
}

const MEDIAN_N = 4096;
const HANN = Float64Array.from({ length: MEDIAN_N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (MEDIAN_N - 1)));

// Frecuencia que parte la potencia en dos mitades iguales, entre 10 Hz y
// 500 Hz (o la mitad de fs, si es menos), en las últimas 4096 muestras.
function medianFrequency(x: (i: number) => number, end: number, fs: number) {
  const re = new Float64Array(MEDIAN_N);
  const im = new Float64Array(MEDIAN_N);
  let mean = 0;
  for (let k = 0; k < MEDIAN_N; k++) mean += x(end - MEDIAN_N + k);
  mean /= MEDIAN_N;
  for (let k = 0; k < MEDIAN_N; k++) re[k] = (x(end - MEDIAN_N + k) - mean) * HANN[k];
  fft(re, im);
  const df = fs / MEDIAN_N;
  const k0 = Math.ceil(10 / df);
  const k1 = Math.min(MEDIAN_N / 2 - 1, Math.floor(Math.min(500, fs / 2) / df));
  let total = 0;
  for (let k = k0; k <= k1; k++) total += re[k] ** 2 + im[k] ** 2;
  if (total <= 0) return NaN;
  let acc = 0;
  for (let k = k0; k <= k1; k++) {
    acc += re[k] ** 2 + im[k] ** 2;
    if (acc >= total / 2) return k * df;
  }
  return NaN;
}

// Correlación (en %) entre las envolventes de las dos señales: el valor
// eficaz en ventanas de 100 ms, cada 20 ms.
function envelopeCorrelation(a: (i: number) => number, b: (i: number) => number, start: number, end: number, fs: number) {
  const win = Math.round(0.1 * fs);
  const step = Math.round(0.02 * fs);
  const ea: number[] = [];
  const eb: number[] = [];
  for (let i = start; i + win <= end; i += step) {
    let sa = 0;
    let sb = 0;
    for (let k = i; k < i + win; k++) {
      sa += a(k) ** 2;
      sb += b(k) ** 2;
    }
    ea.push(Math.sqrt(sa / win));
    eb.push(Math.sqrt(sb / win));
  }
  const n = ea.length;
  if (n < 3) return NaN;
  const ma = ea.reduce((s, v) => s + v, 0) / n;
  const mb = eb.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let k = 0; k < n; k++) {
    cov += (ea[k] - ma) * (eb[k] - mb);
    va += (ea[k] - ma) ** 2;
    vb += (eb[k] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? (100 * cov) / Math.sqrt(va * vb) : NaN;
}
