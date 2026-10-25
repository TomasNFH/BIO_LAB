// Bloques de procesamiento de señal básicos, muestra a muestra.

// Pasa bajos de un polo (como un RC), con frecuencia de corte fc.
export class OnePoleLowpass {
  private a: number;
  private y = 0;
  constructor(fc: number, fs: number) {
    this.a = 1 - Math.exp((-2 * Math.PI * fc) / fs);
  }
  process(x: number) {
    this.y += this.a * (x - this.y);
    return this.y;
  }
}

// Filtro de segundo orden en forma directa I.
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(
    private b0: number,
    private b1: number,
    private b2: number,
    private a1: number,
    private a2: number,
  ) {}

  // Pasa banda con ganancia 1 en f0 (fórmulas de R. Bristow-Johnson).
  static bandpass(f0: number, q: number, fs: number) {
    const w0 = (2 * Math.PI * f0) / fs;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    return new Biquad(alpha / a0, 0, -alpha / a0, (-2 * Math.cos(w0)) / a0, (1 - alpha) / a0);
  }

  // Pasa bajos y pasa altos de segundo orden con el Q dado (0,707 =
  // Butterworth).
  static lowpass(fc: number, q: number, fs: number) {
    const w0 = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b = (1 - cos) / 2 / a0;
    return new Biquad(b, 2 * b, b, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  static highpass(fc: number, q: number, fs: number) {
    const w0 = (2 * Math.PI * fc) / fs;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b = (1 + cos) / 2 / a0;
    return new Biquad(b, -2 * b, b, (-2 * cos) / a0, (1 - alpha) / a0);
  }

  process(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// FFT radix 2 en el lugar. re e im deben tener largo potencia de 2.
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
