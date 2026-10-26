import { BRANCHES, type Branch, type ChainSettings } from '../engine/chain';
import { cutoff, PRESETS } from '../engine/filters';
import { EMG_HP, EMG_LP } from '../lab';
import { Help } from './Help';
import { hz } from './units';

// Pasa banda = pasa altos y pasa bajos en cascada. Cada opción fija los dos
// filtros de las dos ramas a la vez, sin tocar su orden. El EOG necesita la
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

// Banda que deja pasar la rama según sus filtros prendidos.
export const rangeText = (s: ChainSettings) =>
  `${s.hp.on ? hz(cutoff(s.hp)) : 'CC'} – ${s.lp.on ? hz(cutoff(s.lp)) : 'sin límite'}`;

// Nombre de la banda de la salida (común a las dos ramas).
export function outputName(chains: Record<Branch, ChainSettings>): string {
  const a = bandOf(chains.a);
  const b = bandOf(chains.b);
  if (a === b) return a === -1 ? 'A medida' : BANDS[a].label;
  return 'Distinta en A y B';
}

// Rango de la salida: uno solo si las dos ramas coinciden.
export function outputRange(chains: Record<Branch, ChainSettings>): string {
  const a = rangeText(chains.a);
  const b = rangeText(chains.b);
  return a === b ? a : `A: ${a} · B: ${b}`;
}

type Props = {
  chains: Record<Branch, ChainSettings>;
  onChain: (b: Branch, s: ChainSettings) => void;
};

// La salida de la cadena: el pasa banda que comparten las dos ramas.
export function OutputPanel({ chains, onChain }: Props) {
  const bandA = bandOf(chains.a);
  const current = bandA === bandOf(chains.b) ? bandA : -1;

  const setBand = (i: number) => {
    const band = BANDS[i];
    for (const b of BRANCHES) {
      const c = chains[b];
      onChain(b, {
        ...c,
        hp: band.hp ? { ...c.hp, on: true, r: band.hp.r, c: band.hp.c } : { ...c.hp, on: false },
        lp: { ...c.lp, on: true, r: band.lp.r, c: band.lp.c },
      });
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Salida</h2>
        <Help label="Ayuda de la salida">
          <p>
            La salida es común a las dos ramas: elegir una banda fija el pasa altos y el pasa bajos
            de A y de B a la vez. Un pasa banda es un pasa altos y un pasa bajos en cascada.
          </p>
          <p>
            En el ECG la banda de monitoreo limpia más y la de diagnóstico deforma menos; el EOG
            necesita llegar hasta la continua (CC) y el EMG, hasta 450 Hz (con el ADC a 1 kHz). Para
            comparar dos bandas, cambiá los filtros de cada rama desde sus bloques.
          </p>
        </Help>
      </div>

      <span className="switch-label">Pasa banda de las dos ramas</span>
      <div className="seg wrap out-bands">
        {BANDS.map((band, i) => (
          <button key={band.label} className={current === i ? 'on' : ''} aria-pressed={current === i} onClick={() => setBand(i)}>
            {band.label}
          </button>
        ))}
      </div>

      <dl className="readouts">
        <div>
          <dt>Banda</dt>
          <dd>{outputName(chains)}</dd>
        </div>
        {BRANCHES.map((b) => (
          <div key={b}>
            <dt>Rama {b.toUpperCase()}</dt>
            <dd>{rangeText(chains[b])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
