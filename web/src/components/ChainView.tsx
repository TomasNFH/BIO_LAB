import type { ReactNode } from 'react';
import { ampGains } from '../engine/amp';
import type { SourceKind } from '../engine/BioEngine';
import { BRANCHES, type Branch, type ChainSettings } from '../engine/chain';
import { drlGain } from '../engine/drl';
import { RHYTHMS, type EcgSettings } from '../engine/ecg';
import { EMG_PATTERNS, type EmgSettings } from '../engine/emg';
import { PATTERNS, type EogSettings } from '../engine/eog';
import { cutoff, type FilterSettings } from '../engine/filters';
import type { NoiseId, NoiseSettings } from '../engine/noise';
import type { Recording } from '../engine/recording';
import { Help } from './Help';
import { DEVICES, type OutputSettings } from '../output';
import { dec } from './Knob';
import { hz } from './units';

// Bloques de cada rama, en el orden de la señal: la parte analógica, el ADC
// y la etapa digital (pasa bajos digital y umbral).
export type BlockId = 'amp' | 'drl' | 'hp' | 'lp' | 'notch' | 'adc' | 'dlp' | 'thr';
// Lo que se abre debajo de la cadena: un bloque común o el de una rama.
export type Selection = 'presets' | 'source' | 'noise' | 'output' | { branch: Branch; block: BlockId };

const BLOCKS: { id: BlockId; label: string }[] = [
  { id: 'amp', label: 'Amplificador' },
  { id: 'drl', label: 'Pierna derecha' },
  { id: 'hp', label: 'Pasa altos' },
  { id: 'lp', label: 'Pasa bajos' },
  { id: 'notch', label: 'Notch' },
  { id: 'adc', label: 'ADC' },
];

const DIGITAL_BLOCKS: { id: BlockId; label: string }[] = [
  { id: 'dlp', label: 'Pasa bajos digital' },
  { id: 'thr', label: 'Umbral' },
];

const mv = (v: number) => `${dec(v, 2)} mV`;

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
    // Sin ADC no hay muestras para la etapa digital.
    case 'dlp':
      return { on: s.dsp.lp.on && s.adc.on, detail: s.adc.on ? hz(s.dsp.lp.fc) : 'necesita el ADC' };
    case 'thr': {
      const t = s.dsp.thr;
      const detail = !s.adc.on ? 'necesita el ADC' : t.mode === 'one' ? `1 nivel · ${mv(t.level)}` : `izq ${mv(t.low)} · der ${mv(t.high)}`;
      return { on: t.on && s.adc.on, detail };
    }
  }
}

// Interruptor de cada bloque (los digitales están dentro de `dsp`).
function isOn(s: ChainSettings, block: BlockId) {
  if (block === 'dlp') return s.dsp.lp.on;
  if (block === 'thr') return s.dsp.thr.on;
  return s[block].on;
}

function toggled(s: ChainSettings, block: BlockId): ChainSettings {
  if (block === 'dlp') return { ...s, dsp: { ...s.dsp, lp: { ...s.dsp.lp, on: !s.dsp.lp.on } } };
  if (block === 'thr') return { ...s, dsp: { ...s.dsp, thr: { ...s.dsp.thr, on: !s.dsp.thr.on } } };
  return { ...s, [block]: { ...s[block], on: !s[block].on } };
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
  output: OutputSettings;
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
  const { selection, onSelect, branch, chains, onChain, source, ecg, eog, emg, recording, noise, onNoise, output } = props;
  const isSel = (b: Branch, block: BlockId) => typeof selection === 'object' && selection.branch === b && selection.block === block;
  const toggle = (b: Branch, block: BlockId) => onChain(b, toggled(chains[b], block));
  const cells = (blocks: typeof BLOCKS) =>
    blocks.map((blk) =>
      BRANCHES.map((b) => {
        const d = describe(chains[b], blk.id);
        const on = isOn(chains[b], blk.id);
        return (
          <Cell
            key={`${b}-${blk.id}`}
            className={`branch-${b}`}
            label={blk.label}
            detail={d.on || !chains[b].adc.on ? d.detail : 'apagado'}
            on={d.on}
            selected={isSel(b, blk.id)}
            onOpen={() => onSelect({ branch: b, block: blk.id })}
            power={
              <Power
                on={on}
                label={`${on ? 'Apagar' : 'Prender'} ${blk.label.toLowerCase()} de la rama ${b.toUpperCase()}`}
                onClick={() => toggle(b, blk.id)}
              />
            }
          />
        );
      }),
    );

  const sourceDetail =
    source === 'ecg'
      ? `ECG · ${RHYTHMS[ecg.rhythm]}${ecg.rhythm === 'vt' ? '' : ` · ${ecg.bpm} lpm`}`
      : source === 'eog'
        ? `EOG · ${PATTERNS[eog.pattern]}`
        : source === 'emg'
          ? `EMG · ${EMG_PATTERNS[emg.pattern]}`
          : `Registro · ${recording ? recording.name : 'sin cargar'}`;
  const activeNoises = NOISE_IDS.filter((id) => noise[id].on).length;

  const other: Branch = branch === 'a' ? 'b' : 'a';
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
            Después del ADC viene la etapa digital (pasa bajos digital y umbral) y al final la
            salida: el dispositivo que usa la señal de la rama que se ve en el monitor.
          </p>
        </Help>
      </div>

      {/* La entrada de las dos ramas es la suma de la fuente y el ruido. */}
      <div className="ch-frame" role="group" aria-label="Entrada: fuente más ruido">
        <div className="ch-grid">
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

      <div className="ch-grid ch-branches">
        {BRANCHES.map((b) => (
          <span key={b} className={`ch-branch ${b} ${branch === b ? 'live' : ''}`}>
            Rama {b.toUpperCase()}
          </span>
        ))}
        {/* Entre los dos títulos: copia los ajustes de la rama que se ve a la otra. */}
        <button
          className="ch-copy"
          onClick={() => onChain(other, structuredClone(chains[branch]))}
          aria-label={`Copiar los ajustes de la rama ${branch.toUpperCase()} a la ${other.toUpperCase()}`}
          title={`Copiar los ajustes de la rama ${branch.toUpperCase()} a la ${other.toUpperCase()}`}
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6A1.5 1.5 0 0 0 3 10.5h.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {branch === 'a' ? 'A → B' : 'A ← B'}
        </button>
        {cells(BLOCKS)}
        {/* Desde acá, cuentas sobre las muestras del ADC. */}
        <span className="ch-sep" aria-hidden="true">
          Digital
        </span>
        {cells(DIGITAL_BLOCKS)}
      </div>

      {/* La salida, común a las dos ramas: el dispositivo que usa la señal de
          la rama que se ve en el monitor. Al tocarla se abre su panel. */}
      <div className="ch-grid">
        <Arrow />
        <Arrow />
      </div>
      <div className="ch-frame" role="group" aria-label="Salida de las dos ramas">
        <Cell
          className="ch-out"
          label="Salida"
          detail={`${DEVICES.find((d) => d.id === output.device)?.label} · rama ${branch.toUpperCase()}`}
          on
          selected={selection === 'output'}
          onOpen={() => onSelect('output')}
        />
      </div>
    </section>
  );
}
