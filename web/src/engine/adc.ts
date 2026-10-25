// Conversor analógico-digital.
//
// Muestrea la salida analógica de la cadena fs veces por segundo, retiene
// cada valor hasta la muestra siguiente y lo redondea al escalón más
// cercano (cuantización). Ve la tensión real de la salida del amplificador,
// en V: por eso la resolución útil depende de la ganancia que hay antes.
//
// Muestrear no deja pasar nada por encima de fs/2 (la frecuencia de
// Nyquist): lo que haya ahí se "dobla" y aparece como una frecuencia más
// baja que no estaba (aliasing). Por eso antes del ADC tiene que haber un
// pasa bajos que deje poco por encima de fs/2.

export type AdcSettings = {
  on: boolean; // apagado: la salida es la señal analógica
  fs: number; // frecuencia de muestreo, Hz
  bits: number; // resolución
  range: number; // rango de entrada ±V
};

// Frecuencias de muestreo posibles: dividen exactamente a la frecuencia
// interna de la parte analógica y a la de las vistas.
export const ADC_RATES = [100, 125, 200, 250, 500, 1000];

export const DEFAULT_ADC: AdcSettings = { on: true, fs: 500, bits: 12, range: 2.5 };

// Escalón de cuantización (1 LSB), en V.
export const lsb = (s: AdcSettings) => (2 * s.range) / 2 ** s.bits;

export class Adc {
  private settings: AdcSettings;
  private held = 0; // último valor convertido, V
  private clipped = false;

  constructor(settings: AdcSettings) {
    this.settings = { ...settings };
  }

  set(settings: AdcSettings) {
    this.settings = { ...settings };
  }

  get on() {
    return this.settings.on;
  }

  get fs() {
    return this.settings.fs;
  }

  // v: tensión de entrada en V. Convierte sólo si esta muestra interna
  // (índice n a la frecuencia analógica fa) cae en un instante de muestreo;
  // si no, devuelve lo retenido.
  process(v: number, n: number, fa: number) {
    const { fs, range } = this.settings;
    if (n % Math.round(fa / fs) === 0) {
      const q = lsb(this.settings);
      let x = v;
      if (x > range) x = range;
      else if (x < -range) x = -range;
      if (x !== v) this.clipped = true;
      // Los códigos van de −2^(bits−1) a 2^(bits−1) − 1.
      const code = Math.max(-(2 ** (this.settings.bits - 1)), Math.min(2 ** (this.settings.bits - 1) - 1, Math.round(x / q)));
      this.held = code * q;
    }
    return this.held;
  }

  // ¿Recortó desde la última lectura?
  takeClipped() {
    const c = this.clipped;
    this.clipped = false;
    return c;
  }
}
