import { BRANCHES, type Branch, type ChainSettings } from '../engine/chain';
import { Help } from './Help';
import { cutoff, PRESETS } from '../engine/filters';
import { EMG_HP, EMG_LP } from '../lab';
import { hz } from './units';

// Pasa banda = pasa altos y pasa bajos en cascada. Cada botón fija los dos
// filtros de la rama a la vez, sin tocar su orden. El EOG necesita la
// continua: sin pasa altos y con un pasa bajos de 30 Hz. El EMG va de 20 a
// 450 Hz.
const BANDS = [
  { label: 'ECG monitoreo', hp: PRESETS.hp[1], lp: PRESETS.lp[0] },
  { label: 'ECG diagnóstico', hp: PRESETS.hp[0], lp: PRESETS.lp[1] },
  { label: 'EOG', hp: null, lp: { r: 10e3, c: 530e-9 } },
  { label: 'EMG', hp: EMG_HP, lp: EMG_LP },
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
        <Help label="Ayuda de la cadena">
          <p>
            La misma señal (con su ruido) entra a dos cadenas completas, A y B. Los paneles de abajo
            editan la rama elegida y las vistas la muestran; la tecla B cambia de rama. Un pasa
            banda es un pasa altos y un pasa bajos en cascada: en el ECG la banda de monitoreo
            limpia más y la de diagnóstico deforma menos; el EOG necesita llegar hasta la continua
            (CC) y el EMG, hasta 450 Hz (con el ADC a 1 kHz).
          </p>
        </Help>
      </div>
      <div className="row">
        <span className="switch-label">Pasa banda</span>
        <div className="seg">
          {BANDS.map((band) => {
            const hpOk = band.hp ? s.hp.on && s.hp.r === band.hp.r && s.hp.c === band.hp.c : !s.hp.on;
            const on = hpOk && s.lp.on && s.lp.r === band.lp.r && s.lp.c === band.lp.c;
            return (
              <button
                key={band.label}
                className={on ? 'on' : ''}
                onClick={() =>
                  onChange(branch, {
                    ...s,
                    hp: band.hp ? { ...s.hp, on: true, r: band.hp.r, c: band.hp.c } : { ...s.hp, on: false },
                    lp: { ...s.lp, on: true, r: band.lp.r, c: band.lp.c },
                  })
                }
              >
                {band.label} {band.hp ? hz(cutoff(band.hp)) : 'CC'} – {hz(cutoff(band.lp))}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
