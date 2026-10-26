import type { ChainSettings } from '../engine/chain';
import { cutoff, PRESETS } from '../engine/filters';
import { EMG_HP, EMG_LP } from '../lab';
import { hz } from './units';

// Pasa banda = pasa altos y pasa bajos en cascada. Cada banda fija los dos
// filtros de una rama a la vez, sin tocar su orden. El EOG necesita la
// continua: sin pasa altos y con un pasa bajos de 30 Hz. El EMG va de 20 a
// 450 Hz.
export const BANDS = [
  { label: 'ECG monitoreo', hp: PRESETS.hp[1], lp: PRESETS.lp[0] },
  { label: 'ECG diagnóstico', hp: PRESETS.hp[0], lp: PRESETS.lp[1] },
  { label: 'EOG', hp: null, lp: { r: 10e3, c: 530e-9 } },
  { label: 'EMG', hp: EMG_HP, lp: EMG_LP },
];

// La banda típica que coincide con los filtros de la rama, o -1.
export function bandOf(s: ChainSettings): number {
  return BANDS.findIndex((band) => {
    const hpOk = band.hp ? s.hp.on && s.hp.r === band.hp.r && s.hp.c === band.hp.c : !s.hp.on;
    return hpOk && s.lp.on && s.lp.r === band.lp.r && s.lp.c === band.lp.c;
  });
}

// La rama con los dos filtros de la banda i.
export function withBand(s: ChainSettings, i: number): ChainSettings {
  const band = BANDS[i];
  return {
    ...s,
    hp: band.hp ? { ...s.hp, on: true, r: band.hp.r, c: band.hp.c } : { ...s.hp, on: false },
    lp: { ...s.lp, on: true, r: band.lp.r, c: band.lp.c },
  };
}

// Banda que deja pasar la rama según sus filtros prendidos.
export const rangeText = (s: ChainSettings) =>
  `${s.hp.on ? hz(cutoff(s.hp)) : 'CC'} – ${s.lp.on ? hz(cutoff(s.lp)) : 'sin límite'}`;
