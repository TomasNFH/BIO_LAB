import { Adc, DEFAULT_ADC, type AdcSettings } from './adc';
import { DEFAULT_AMP, InstrumentationAmp, type AmpSettings } from './amp';
import { DEFAULT_HP, DEFAULT_LP, DEFAULT_NOTCH, Filter, Notch, type FilterSettings, type NotchSettings } from './filters';

export type Branch = 'a' | 'b';
export const BRANCHES: Branch[] = ['a', 'b'];

export type ChainSettings = {
  amp: AmpSettings;
  hp: FilterSettings;
  lp: FilterSettings;
  notch: NotchSettings;
  adc: AdcSettings;
};

export const DEFAULT_CHAIN: ChainSettings = {
  amp: DEFAULT_AMP,
  hp: DEFAULT_HP,
  lp: DEFAULT_LP,
  notch: DEFAULT_NOTCH,
  adc: DEFAULT_ADC,
};

// Las dos ramas arrancan iguales salvo el pasa altos: A con el de
// monitoreo (0,48 Hz) y B con el de diagnóstico (0,048 Hz).
export const DEFAULT_BRANCHES: Record<Branch, ChainSettings> = {
  a: DEFAULT_CHAIN,
  b: { ...DEFAULT_CHAIN, hp: { ...DEFAULT_HP, c: 3.3e-6 } },
};

// Una cadena de procesamiento completa: amplificador de instrumentación,
// pasa altos, pasa bajos y notch (la parte analógica, que corre a la
// frecuencia interna fa) y el ADC. Después de cada muestra deja la salida
// de cada etapa en sus campos, para los puntos de prueba.
export class Chain {
  readonly amp: InstrumentationAmp;
  readonly hp: Filter;
  readonly lp: Filter;
  readonly notch: Notch;
  readonly adc: Adc;
  ampOut = 0;
  hpOut = 0;
  lpOut = 0;
  notchOut = 0;
  out = 0; // salida del ADC

  constructor(fs: number, s: ChainSettings) {
    this.amp = new InstrumentationAmp(s.amp);
    this.hp = new Filter('hp', fs, s.hp);
    this.lp = new Filter('lp', fs, s.lp);
    this.notch = new Notch(fs, s.notch);
    this.adc = new Adc(s.adc);
  }

  set(s: ChainSettings) {
    this.amp.set(s.amp);
    this.hp.set(s.hp);
    this.lp.set(s.lp);
    this.notch.set(s.notch);
    this.adc.set(s.adc);
  }

  // Ganancia entre los electrodos y la entrada del ADC (los filtros tienen
  // ganancia 1).
  get gain() {
    return this.amp.on ? this.amp.gain : 1;
  }

  // vd: tensión diferencial entre los electrodos; vcm: modo común. En mV.
  // n: índice de esta muestra a la frecuencia interna fa.
  // Todo lo que sale está en mV referido a la entrada.
  process(vd: number, vcm: number, n: number, fa: number) {
    let amp = vd;
    if (this.amp.on) {
      const vo = this.amp.process((vcm + vd / 2) / 1000, (vcm - vd / 2) / 1000);
      amp = (vo * 1000) / this.amp.gain;
    }
    this.ampOut = amp;
    this.hpOut = this.hp.process(amp);
    this.lpOut = this.lp.process(this.hpOut);
    this.notchOut = this.notch.process(this.lpOut);
    if (this.adc.on) {
      // El ADC ve la tensión real (en V) y devuelve el valor convertido,
      // que se vuelve a referir a la entrada.
      const g = this.gain;
      this.out = (this.adc.process((this.notchOut * g) / 1000, n, fa) * 1000) / g;
    } else {
      this.out = this.notchOut;
    }
  }
}
