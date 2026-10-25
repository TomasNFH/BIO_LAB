// Circuito de pierna derecha (DRL, "driven right leg"), Winter y Webster
// (1983).
//
// La red se acopla al cuerpo por capacidad y le inyecta una corriente
// chica. Sin DRL, el cuerpo vuelve a masa por el electrodo de la pierna
// derecha, y esa corriente por su impedancia deja a todo el cuerpo a una
// tensión de modo común Vcm0 (la perilla de modo común del ruido).
//
// Con DRL, un op-amp mide el modo común en el amplificador de
// instrumentación (el promedio de las dos entradas, con dos resistencias
// Ra), lo invierte con ganancia G = 2·Rf/Ra y lo devuelve al cuerpo por la
// pierna derecha. El lazo deja el cuerpo a Vcm0 / (1 + G). Si la salida que
// hace falta (≈ Vcm0) no entra en la alimentación, el op-amp satura y la
// reducción es sólo lo que alcanza a restar.

export const DRL_RA = 25_000; // Ω

export type DrlSettings = {
  on: boolean;
  rf: number; // Ω
};

export const DEFAULT_DRL: DrlSettings = { on: false, rf: 500_000 }; // G = 40

export const drlGain = (s: DrlSettings) => (2 * s.rf) / DRL_RA;

export class Drl {
  private settings: DrlSettings;
  private peak = 0; // |salida| máxima desde la última lectura, V
  private saturated = false;
  private samples = 0;
  private readAt = 0;

  constructor(settings: DrlSettings) {
    this.settings = { ...settings };
  }

  set(settings: DrlSettings) {
    this.settings = { ...settings };
  }

  get on() {
    return this.settings.on;
  }

  // vcm0: modo común del cuerpo sin DRL, en mV. swing: tensión máxima de
  // salida del op-amp, en V. Devuelve el modo común que queda, en mV.
  process(vcm0: number, swing: number) {
    this.samples++;
    if (!this.settings.on) return vcm0;
    const g = drlGain(this.settings);
    let vb = vcm0 / (1 + g);
    let out = -g * vb; // mV
    const lim = swing * 1000;
    if (out > lim || out < -lim) {
      out = out > 0 ? lim : -lim;
      vb = vcm0 + out;
      this.saturated = true;
    }
    this.peak = Math.max(this.peak, Math.abs(out) / 1000);
    return vb;
  }

  // Lo que pasó desde la última lectura (null si no se procesó nada nuevo).
  readStats() {
    if (this.samples === this.readAt) return null;
    this.readAt = this.samples;
    const s = { peak: this.peak, saturated: this.saturated };
    this.peak = 0;
    this.saturated = false;
    return s;
  }
}
