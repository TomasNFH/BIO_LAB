// Etapa digital: lo que haría un microcontrolador con las muestras del ADC.
//
// Corre sólo cuando el ADC convierte una muestra nueva, a su frecuencia de
// muestreo fs, y trabaja con el valor ya cuantizado. Tiene dos bloques:
//
// 1. Pasa bajos digital de primer orden (IIR): y += a·(x − y), con
//    a = 1 − e^(−2π·fc/fs). Es el mismo RC del pasa bajos analógico, pero
//    hecho con cuentas: suaviza la señal antes de compararla.
// 2. Umbral, en dos modos:
//    - Un umbral: un pulso cada vez que la señal lo cruza (hacia arriba si
//      el nivel es positivo, hacia abajo si es negativo). Para contar
//      latidos con la onda R. Después de un cruce no acepta otro durante el
//      período refractario, y para volver a armarse la señal tiene que bajar
//      del nivel menos la histéresis (si no, el ruido sobre el pico daría
//      varios cruces).
//    - Dos umbrales: izquierda (nivel bajo) y derecha (nivel alto). La
//      salida vale −1, 0 o +1: hacia dónde se mira, con el EOG. También con
//      histéresis, para que no tiemble cerca de cada nivel.
//
// Todo en mV referidos a la entrada, como el resto de la cadena.

export type ThresholdMode = 'one' | 'two';

export type DigitalSettings = {
  lp: { on: boolean; fc: number }; // Hz
  thr: {
    on: boolean;
    mode: ThresholdMode;
    level: number; // un umbral, mV
    low: number; // dos umbrales: izquierda, mV
    high: number; // dos umbrales: derecha, mV
    hyst: number; // histéresis, mV
    refractory: number; // s
  };
};

export const DEFAULT_DIGITAL: DigitalSettings = {
  lp: { on: false, fc: 20 },
  thr: { on: false, mode: 'one', level: 0.5, low: -0.16, high: 0.16, hyst: 0.05, refractory: 0.2 },
};

export class DigitalStage {
  private settings: DigitalSettings;
  private y = 0; // estado del pasa bajos
  private primed = false;
  private armed = true; // un umbral: listo para el próximo cruce
  private lastCross = -Infinity; // s
  private crossed = false; // hubo un cruce desde la última lectura
  lpOut = 0; // salida del pasa bajos digital (o su entrada, si está apagado)
  thrOut = 0; // un umbral: 1 por encima, 0 debajo; dos umbrales: −1, 0 o +1

  constructor(settings: DigitalSettings) {
    this.settings = structuredClone(settings);
  }

  set(settings: DigitalSettings) {
    const was = this.settings.thr;
    this.settings = structuredClone(settings);
    const thr = this.settings.thr;
    // Al cambiar de modo o apagarlo, el umbral arranca de cero.
    if (thr.mode !== was.mode || !thr.on) {
      this.armed = true;
      this.thrOut = 0;
    }
  }

  // Sin ADC no hay muestras: la etapa deja pasar la señal y no decide nada.
  bypass(x: number) {
    this.lpOut = x;
    this.thrOut = 0;
    this.armed = true;
    this.primed = false;
  }

  // x: muestra recién convertida, mV; t: su instante, s; fs: la del ADC.
  process(x: number, t: number, fs: number) {
    const { lp, thr } = this.settings;
    if (lp.on) {
      // Arranca en el valor actual, para no empezar con un escalón desde 0.
      if (!this.primed) this.y = x;
      const fc = Math.min(lp.fc, 0.45 * fs);
      this.y += (1 - Math.exp((-2 * Math.PI * fc) / fs)) * (x - this.y);
      this.lpOut = this.y;
    } else {
      this.y = x;
      this.lpOut = x;
    }
    this.primed = true;

    if (!thr.on) {
      this.thrOut = 0;
      return;
    }
    const v = this.lpOut;
    if (thr.mode === 'one') {
      // Con nivel negativo se busca el cruce hacia abajo.
      const s = thr.level < 0 ? -1 : 1;
      const above = s * v > Math.abs(thr.level);
      if (above && this.armed && t - this.lastCross >= thr.refractory) {
        this.armed = false;
        this.lastCross = t;
        this.crossed = true;
      } else if (!this.armed && s * v < Math.abs(thr.level) - thr.hyst) {
        this.armed = true;
      }
      this.thrOut = above ? 1 : 0;
    } else {
      const prev = this.thrOut;
      if (v > thr.high) this.thrOut = 1;
      else if (v < thr.low) this.thrOut = -1;
      else if (prev === 1 && v < thr.high - thr.hyst) this.thrOut = 0;
      else if (prev === -1 && v > thr.low + thr.hyst) this.thrOut = 0;
    }
  }

  // ¿Hubo un cruce (un pulso) desde la última vez que se preguntó?
  takeCrossing() {
    const c = this.crossed;
    this.crossed = false;
    return c;
  }
}
