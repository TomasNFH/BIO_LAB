import type { ReactNode } from 'react';
import { ampGains } from '../engine/amp';
import type { SourceKind } from '../engine/BioEngine';
import { BRANCHES, type Branch, type ChainSettings } from '../engine/chain';
import { drlGain } from '../engine/drl';
import { RHYTHMS, type EcgSettings } from '../engine/ecg';
import { EMG_PATTERNS, type EmgSettings } from '../engine/emg';
import { PATTERNS, type EogSettings } from '../engine/eog';
import { cutoff, PRESETS, type FilterSettings } from '../engine/filters';
import type { NoiseId, NoiseSettings } from '../engine/noise';
import type { Recording } from '../engine/recording';
import { EMG_HP, EMG_LP } from '../lab';
import { Help } from './Help';
import { dec } from './Knob';
import { hz } from './units';

// Bloques de cada rama, en el orden de la señal.
export type BlockId = 'amp' | 'drl' | 'hp' | 'lp' | 'notch' | 'adc';
// Lo que se abre debajo de la cadena: un bloque común o el de una rama.
export type Selection = 'presets' | 'source' | 'noise' | { branch: Branch; block: BlockId };

const BLOCKS: { id: BlockId; label: string }[] = [
  { id: 'amp', label: 'Amplificador' },
  { id: 'drl', label: 'Pierna derecha' },
  { id: 'hp', label: 'Pasa altos' },
  { id: 'lp', label: 'Pasa bajos' },
  { id: 'notch', label: 'Notch' },
  { id: 'adc', label: 'ADC' },
];

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

const filterText = (f: FilterSettings) => `${hz(cutoff(f))} · ${f.order === 1 ? 'RC' : 'Sallen-Key'}`;

// Lo que muestra cada celda: si está prendido y su ajuste principal.
function describe(s: ChainSettings, block: BlockId): { on: boolean; detail: string } {
  switch (block) {
    case 'amp': {
      const g = ampGains(s.amp).gain * s.post.gain;
      return { on: s.amp.on, detail: s.amp.on ? `×${dec(g, 0)}` : 'ideal' };
    }
    case 'drl':
      return { on: s.drl.on, detail: `G = ${dec(drlGain(s.drl), 0)}` };
    case 'hp':
      return { on: s.hp.on, detail: filterText(s.hp) };
    case 'lp':
      return { on: s.lp.on, detail: filterText(s.lp) };
    case 'notch':
      return { on: s.notch.on, detail: `${s.notch.f0} Hz · Q ${dec(s.notch.q, s.notch.q < 10 ? 1 : 0)}` };
    case 'adc':
      return { on: s.adc.on, detail: `${s.adc.fs} Hz · ${s.adc.bits} bits` };
  }
}

const NOISE_IDS: NoiseId[] = ['mains', 'wander', 'emg', 'white', 'offset', 'motion'];

type Props = {
  selection: Selection;
  onSelect: (s: Selection) => void;
  branch: Branch;
  chains: Record<Branch, ChainSettings>;
  onChain: (b: Branch, s: ChainSettings) => void;
  source: SourceKind;
  ecg: EcgSettings;
  eog: EogSettings;
  emg: EmgSettings;
  recording: Recording | null;
  noise: NoiseSettings;
  onNoise: (n: NoiseSettings) => void;
};

const Power = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button className={`chain-power ${on ? 'is-on' : ''}`} onClick={onClick} aria-label={label} title={on ? 'Apagar' : 'Prender'}>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M8 2v6M4.5 4.5a5 5 0 1 0 7 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  </button>
);

// Una celda de la cadena: el botón que la abre y, si tiene, su interruptor.
function Cell(props: {
  label: string;
  detail: string;
  on: boolean;
  selected: boolean;
  onOpen: () => void;
  power?: ReactNode;
  className?: string;
}) {
  const { label, detail, on, selected, onOpen, power, className = '' } = props;
  return (
    <div className={['ch-cell', className, on ? '' : 'off', selected ? 'selected' : ''].filter(Boolean).join(' ')}>
      <button className="ch-main" onClick={onOpen} aria-pressed={selected}>
        <span className="ch-label">{label}</span>
        <span className="ch-detail">{detail}</span>
      </button>
      {power}
    </div>
  );
}

const Arrow = () => (
  <span className="ch-arrow" aria-hidden="true">
    <svg viewBox="0 0 12 14" width="12" height="14">
      <path d="M6 1v11M2 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

// La cadena de adquisición, de arriba hacia abajo: la fuente y el ruido son
// comunes; después la señal se divide en dos cadenas completas, A y B. Al
// tocar un bloque se abre su panel debajo, uno por vez.
export function ChainView(props: Props) {
  const { selection, onSelect, branch, chains, onChain, source, ecg, eog, emg, recording, noise, onNoise } = props;
  const isSel = (b: Branch, block: BlockId) => typeof selection === 'object' && selection.branch === b && selection.block === block;
  const toggle = (b: Branch, block: BlockId) => {
    const s = chains[b];
    onChain(b, { ...s, [block]: { ...s[block], on: !s[block].on } });
  };

  const sourceDetail =
    source === 'ecg'
      ? `ECG · ${RHYTHMS[ecg.rhythm]}${ecg.rhythm === 'vt' ? '' : ` · ${ecg.bpm} lpm`}`
      : source === 'eog'
        ? `EOG · ${PATTERNS[eog.pattern]}`
        : source === 'emg'
          ? `EMG · ${EMG_PATTERNS[emg.pattern]}`
          : `Registro · ${recording ? recording.name : 'sin cargar'}`;
  const activeNoises = NOISE_IDS.filter((id) => noise[id].on).length;

  const s = chains[branch];
  const other: Branch = branch === 'a' ? 'b' : 'a';
  // La banda típica que coincide con los filtros de la rama, si alguna.
  const currentBand = BANDS.findIndex((band) => {
    const hpOk = band.hp ? s.hp.on && s.hp.r === band.hp.r && s.hp.c === band.hp.c : !s.hp.on;
    return hpOk && s.lp.on && s.lp.r === band.lp.r && s.lp.c === band.lp.c;
  });

  return (
    <section className="panel chain-view" aria-label="Cadena de adquisición">
      <div className="panel-head">
        <h2>Cadena</h2>
        <button className={`ch-presets ${selection === 'presets' ? 'on' : ''}`} aria-pressed={selection === 'presets'} onClick={() => onSelect('presets')}>
          Experimentos y ajustes
        </button>
        <Help label="Ayuda de la cadena">
          <p>
            La señal va de arriba hacia abajo. La fuente y el ruido son comunes; después la misma
            señal entra a dos cadenas completas, A y B, para comparar ajustes. Tocar un bloque abre
            su panel debajo (uno por vez) y, si es de una rama, el monitor pasa a mostrar esa rama.
            El botón de cada bloque lo prende o lo apaga.
          </p>
          <p>
            Un pasa banda es un pasa altos y un pasa bajos en cascada: en el ECG la banda de
            monitoreo limpia más y la de diagnóstico deforma menos; el EOG necesita llegar hasta la
            continua (CC) y el EMG, hasta 450 Hz (con el ADC a 1 kHz).
          </p>
        </Help>
      </div>

      {/* La entrada de las dos ramas es la suma de la fuente y el ruido. */}
      <div className="ch-input" role="group" aria-label="Entrada: fuente más ruido">        <div className="ch-grid">
          <Cell label="Fuente" detail={sourceDetail} on selected={selection === 'source'} onOpen={() => onSelect('source')} />
          <Cell
            label="+ Ruido"
            detail={noise.enabled ? `${activeNoises} de ${NOISE_IDS.length} fuentes` : 'apagado'}
            on={noise.enabled}
            selected={selection === 'noise'}
            onOpen={() => onSelect('noise')}
            power={<Power on={noise.enabled} label={noise.enabled ? 'Apagar el ruido' : 'Prender el ruido'} onClick={() => onNoise({ ...noise, enabled: !noise.enabled })} />}
          />
        </div>
      </div>
      <Arrow />

      <div className="ch-grid">
        {BRANCHES.map((b) => (
          <span key={b} className={`ch-branch ${b} ${branch === b ? 'live' : ''}`}>
            Rama {b.toUpperCase()}
          </span>
        ))}
        {BLOCKS.map((blk) =>
          BRANCHES.map((b) => {
            const d = describe(chains[b], blk.id);
            return (
              <Cell
                key={`${b}-${blk.id}`}
                className={`branch-${b}`}
                label={blk.label}
                detail={d.on ? d.detail : 'apagado'}
                on={d.on}
                selected={isSel(b, blk.id)}
                onOpen={() => onSelect({ branch: b, block: blk.id })}
                power={
                  <Power
                    on={d.on}
                    label={`${d.on ? 'Apagar' : 'Prender'} ${blk.label.toLowerCase()} de la rama ${b.toUpperCase()}`}
                    onClick={() => toggle(b, blk.id)}
                  />
                }
              />
            );
          }),
        )}
      </div>

      <div className="ch-actions">
        <select
          className="compact"
          aria-label={`Pasa banda de la rama ${branch.toUpperCase()}`}
          value={currentBand}
          onChange={(e) => {
            const band = BANDS[Number(e.target.value)];
            if (!band) return;
            onChain(branch, {
              ...s,
              hp: band.hp ? { ...s.hp, on: true, r: band.hp.r, c: band.hp.c } : { ...s.hp, on: false },
              lp: { ...s.lp, on: true, r: band.lp.r, c: band.lp.c },
            });
          }}
        >
          <option value="-1">Pasa banda en {branch.toUpperCase()}…</option>
          {BANDS.map((band, i) => (
            <option key={band.label} value={i}>
              {band.label} ({band.hp ? hz(cutoff(band.hp)) : 'CC'} – {hz(cutoff(band.lp))})
            </option>
          ))}
        </select>
        <button onClick={() => onChain(other, structuredClone(s))}>
          Copiar {branch.toUpperCase()} → {other.toUpperCase()}
        </button>
      </div>
    </section>
  );
}
