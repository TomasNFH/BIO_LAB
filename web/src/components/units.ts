import { dec } from './Knob';

// Formatos de unidades con coma decimal y el prefijo que corresponda.

export const ohms = (r: number) =>
  r >= 1e6 ? `${dec(r / 1e6, r % 1e6 ? 2 : 0)} MΩ` : r >= 1000 ? `${dec(r / 1000, r % 1000 ? 1 : 0)} kΩ` : `${dec(r, 0)} Ω`;

export const farads = (c: number) =>
  c >= 1e-6 ? `${dec(c * 1e6, c >= 1e-5 ? 0 : 2)} µF` : c >= 1e-9 ? `${dec(c * 1e9, c >= 1e-8 ? 0 : 1)} nF` : `${dec(c * 1e12, 0)} pF`;

export const hz = (f: number) =>
  f >= 1000 ? `${dec(f / 1000, 2)} kHz` : f >= 10 ? `${dec(f, 1)} Hz` : f >= 1 ? `${dec(f, 2)} Hz` : `${dec(f, 3)} Hz`;

export const seconds = (t: number) => (t >= 1 ? `${dec(t, 2)} s` : `${dec(t * 1000, t >= 0.01 ? 1 : 2)} ms`);
