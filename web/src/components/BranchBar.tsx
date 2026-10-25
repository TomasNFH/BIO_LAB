import { BRANCHES, type Branch, type ChainSettings } from '../engine/chain';
import { cutoff, PRESETS } from '../engine/filters';
import { hz } from './units';

// Pasa banda = pasa altos y pasa bajos en cascada. Cada botón fija los dos
// filtros de la rama a la vez, sin tocar su orden.
const BANDS = [
  { label: 'Monitoreo', hp: PRESETS.hp[1], lp: PRESETS.lp[0] },
  { label: 'Diagnóstico', hp: PRESETS.hp[0], lp: PRESETS.lp[1] },
];

type Props = {
  branch: Branch;
  onBranch: (b: Branch) => void;
  chains: Record<Branch, ChainSettings>;
  onChange: (b: Branch, s: ChainSettings) => void;
};

// Elige qué rama se edita y se ve, copia una rama en la otra y aplica las
// bandas típicas.
export function BranchBar({ branch, onBranch, chains, onChange }: Props) {
  const other: Branch = branch === 'a' ? 'b' : 'a';
  const s = chains[branch];
  return (
    <section className="panel branch-bar">
      <div className="panel-head">
        <h2>Cadena</h2>
        <div className="seg branch-seg">
          {BRANCHES.map((b) => (
            <button key={b} className={`${b} ${branch === b ? 'on' : ''}`} onClick={() => onBranch(b)}>
              Rama {b.toUpperCase()}
            </button>
          ))}
        </div>
        <button onClick={() => onChange(other, structuredClone(s))}>
          Copiar {branch.toUpperCase()} → {other.toUpperCase()}
        </button>
      </div>
      <div className="row">
        <span className="switch-label">Pasa banda</span>
        <div className="seg">
          {BANDS.map((band) => {
            const on = s.hp.on && s.lp.on && s.hp.r === band.hp.r && s.hp.c === band.hp.c && s.lp.r === band.lp.r && s.lp.c === band.lp.c;
            return (
              <button
                key={band.label}
                className={on ? 'on' : ''}
                onClick={() =>
                  onChange(branch, {
                    ...s,
                    hp: { ...s.hp, on: true, r: band.hp.r, c: band.hp.c },
                    lp: { ...s.lp, on: true, r: band.lp.r, c: band.lp.c },
                  })
                }
              >
                {band.label} {hz(cutoff(band.hp))} – {hz(cutoff(band.lp))}
              </button>
            );
          })}
        </div>
      </div>
      <p className="muted small">
        La misma señal (ECG más ruido) entra a dos cadenas completas, A y B. Los paneles de abajo
        editan la rama elegida y las vistas la muestran; la tecla B cambia de rama. Un pasa banda
        es un pasa altos y un pasa bajos en cascada: la banda de monitoreo limpia más, la de
        diagnóstico deforma menos.
      </p>
    </section>
  );
}
