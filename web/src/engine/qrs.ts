import { Biquad } from './dsp';

// Detector de complejos QRS de Pan y Tompkins (1985), en tiempo real.
//
// 1. Pasa banda de 5 a 15 Hz: deja la energía del QRS y saca la deriva, la
//    onda T (más lenta) y el ruido muscular y de red (más rápidos).
// 2. Derivada: resalta las pendientes empinadas del QRS.
// 3. Cuadrado: todo positivo, y lo grande pesa mucho más que lo chico.
// 4. Integración en una ventana de 150 ms (lo que dura un QRS ancho): un
//    solo lomo por latido.
// 5. Umbrales que se adaptan solos: uno sigue el nivel de los picos que
//    fueron QRS (SPKI) y otro el de los que fueron ruido (NPKI); un pico es
//    QRS si supera NPKI + 0,25·(SPKI − NPKI).
// Reglas extra: nada en 200 ms después de un QRS (período refractario);
// entre 200 y 360 ms, un pico con poca pendiente es una onda T; y si pasa
// 1,66 veces el RR medio sin detectar nada, se vuelve a buscar con la mitad
// del umbral (búsqueda hacia atrás).

export type QrsPoint = 'x' | 'bp' | 'der' | 'sq' | 'int' | 'thr';
export const QRS_POINTS: QrsPoint[] = ['x', 'bp', 'der', 'sq', 'int', 'thr'];

export type Detection = {
  i: number; // muestra del pico R
  searchback: boolean; // encontrado por búsqueda hacia atrás
};

type Peak = { k: number; p: number; slope: number };

const LEARN = 2; // s para aprender los niveles iniciales
const WINDOW = 0.15; // s de integración
const REFRACTORY = 0.2; // s
const T_WAVE = 0.36; // s
const SEARCHBACK = 1.66; // veces el RR medio
const KEEP = 30; // s de detecciones guardadas

export class QrsDetector {
  private lp: Biquad;
  private hp: Biquad;
  private buf: Record<QrsPoint, Float32Array>;
  private len: number;
  private d: number; // separación de la derivada (5 puntos a 200 Hz)
  private w: number; // muestras de la ventana de integración
  private sum = 0;
  private start = -1; // primera muestra procesada
  private learnMax = 0;
  private learnSum = 0;
  private spki = 0;
  private npki = 0;
  private thr1 = 0;
  private lastQrs = -Infinity; // muestra del pico integrado del último QRS
  private lastSlope = 0;
  private lastR = -Infinity;
  private rr: number[] = []; // últimos intervalos RR, en muestras
  private candidate: Peak | null = null; // mayor pico de ruido desde el último QRS
  readonly detections: Detection[] = [];

  constructor(private fs: number, len: number) {
    this.len = len;
    this.lp = Biquad.lowpass(15, Math.SQRT1_2, fs);
    this.hp = Biquad.highpass(5, Math.SQRT1_2, fs);
    this.buf = Object.fromEntries(QRS_POINTS.map((p) => [p, new Float32Array(len)])) as Record<QrsPoint, Float32Array>;
    this.d = Math.max(1, Math.round(fs / 200));
    this.w = Math.round(WINDOW * fs);
  }

  // Valor de una etapa en la muestra i.
  tapAt(point: QrsPoint, i: number) {
    return this.buf[point][i % this.len];
  }

  // Primera muestra en que el detector ya aprendió y puede juzgarse.
  get readyFrom() {
    return this.start < 0 ? Infinity : this.start + LEARN * this.fs;
  }

  get rrMean() {
    return this.rr.length ? this.rr.reduce((a, b) => a + b, 0) / this.rr.length : this.fs;
  }

  detectionsBetween(i0: number, i1: number) {
    return this.detections.filter((d) => d.i >= i0 && d.i <= i1);
  }

  // Procesa la muestra i (en mV) de la salida de la cadena.
  process(x: number, i: number) {
    if (this.start < 0) this.start = i;
    const { buf, len, d, w } = this;
    const at = (p: QrsPoint, k: number) => (k < this.start ? 0 : buf[p][k % len]);

    const bp = this.lp.process(this.hp.process(x));
    const der = (2 * bp + at('bp', i - d) - at('bp', i - 3 * d) - 2 * at('bp', i - 4 * d)) / 8;
    const sq = der * der;
    this.sum += sq - at('sq', i - w);
    const int = Math.max(0, this.sum / w);
    const j = i % len;
    buf.x[j] = x;
    buf.bp[j] = bp;
    buf.der[j] = der;
    buf.sq[j] = sq;
    buf.int[j] = int;

    // Aprendizaje: los primeros segundos sólo miden niveles.
    if (i - this.start < LEARN * this.fs) {
      this.learnMax = Math.max(this.learnMax, int);
      this.learnSum += int;
      buf.thr[j] = 0;
      return;
    }
    if (this.spki === 0 && this.npki === 0) {
      this.spki = this.learnMax / 3;
      this.npki = this.learnSum / (LEARN * this.fs) / 2;
      this.updateThreshold();
    }

    // ¿La muestra anterior fue un pico de la señal integrada?
    const k = i - 1;
    const p = at('int', k);
    if (p > at('int', k - 1) && p >= int && p > 0) this.onPeak(k, p);

    // Búsqueda hacia atrás: pasó demasiado sin un QRS.
    if (this.candidate && i - this.lastQrs > SEARCHBACK * this.rrMean && this.candidate.p > this.thr1 / 2) {
      const c = this.candidate;
      this.spki = 0.25 * c.p + 0.75 * this.spki;
      this.accept(c, true);
    }
    buf.thr[j] = this.thr1;

    // Olvida lo viejo.
    const cut = i - KEEP * this.fs;
    while (this.detections.length && this.detections[0].i < cut) this.detections.shift();
  }

  private onPeak(k: number, p: number) {
    const fs = this.fs;
    if (k - this.lastQrs < REFRACTORY * fs) return;
    const slope = this.maxSlope(k);
    if (p > this.thr1) {
      // Entre 200 y 360 ms del QRS anterior, poca pendiente = onda T.
      if (k - this.lastQrs < T_WAVE * fs && slope < 0.5 * this.lastSlope) {
        this.noise(p, k, slope);
        return;
      }
      this.spki = 0.125 * p + 0.875 * this.spki;
      this.accept({ k, p, slope }, false);
    } else {
      this.noise(p, k, slope);
    }
  }

  private noise(p: number, k: number, slope: number) {
    this.npki = 0.125 * p + 0.875 * this.npki;
    this.updateThreshold();
    if (!this.candidate || p > this.candidate.p) this.candidate = { k, p, slope };
  }

  private accept(peak: Peak, searchback: boolean) {
    const { fs, buf, len } = this;
    // El pico integrado llega tarde: el QRS está en la ventana anterior.
    // Primero el máximo del pasa banda, después el máximo de la señal cerca.
    const from = Math.max(this.start, peak.k - this.w - Math.round(0.05 * fs));
    let b = peak.k;
    let best = -1;
    for (let m = from; m <= peak.k; m++) {
      const v = Math.abs(buf.bp[m % len]);
      if (v > best) {
        best = v;
        b = m;
      }
    }
    let r = b;
    let top = -Infinity;
    const span = Math.round(0.04 * fs);
    for (let m = Math.max(this.start, b - span); m <= b + span && m <= peak.k; m++) {
      const v = buf.x[m % len];
      if (v > top) {
        top = v;
        r = m;
      }
    }
    if (r - this.lastR > REFRACTORY * fs) {
      if (Number.isFinite(this.lastR)) {
        const rr = r - this.lastR;
        if (rr < 3 * fs) {
          this.rr.push(rr);
          if (this.rr.length > 8) this.rr.shift();
        }
      }
      this.detections.push({ i: r, searchback });
      this.lastR = r;
    }
    this.lastQrs = peak.k;
    this.lastSlope = peak.slope;
    this.candidate = null;
    this.updateThreshold();
  }

  // Mayor pendiente (|derivada|) en la ventana que termina en k.
  private maxSlope(k: number) {
    let s = 0;
    for (let m = Math.max(this.start, k - this.w); m <= k; m++) s = Math.max(s, Math.abs(this.buf.der[m % this.len]));
    return s;
  }

  private updateThreshold() {
    this.thr1 = this.npki + 0.25 * (this.spki - this.npki);
  }
}
