import type { ReactNode } from 'react';
import { DEFAULT_NOISE, type NoiseId, type NoiseSettings } from '../engine/noise';
import { dec, Knob } from './Knob';

const uv = (v: number) => (v < 1 ? `${dec(v * 1000, 0)} µV` : `${dec(v, 2)} mV`);
const mv = (v: number) => `${dec(v, 2)} mV`;
const mvBig = (v: number) => `${dec(v, 0)} mV`;
const hz = (v: number) => `${dec(v, 2)} Hz`;
const perMin = (v: number) => `${dec(v, 0)}/min`;

type Props = {
  settings: NoiseSettings;
  onChange: (s: NoiseSettings) => void;
  // Ruido bajo el cursor o con el foco, para resaltar su banda.
  onFocusNoise: (id: NoiseId | null) => void;
};

// Panel con cada fuente de ruido: interruptor, nivel y sus parámetros.
// Los niveles están en la entrada, antes de cualquier amplificación.
export function NoisePanel({ settings, onChange, onFocusNoise }: Props) {
  const edit = <K extends NoiseId>(id: K, patch: Partial<NoiseSettings[K]>) =>
    onChange({ ...settings, [id]: { ...settings[id], ...patch } });

  const card = (id: NoiseId, title: string, band: string, help: string, controls: ReactNode) => {
    const on = settings[id].on;
    return (
      <div
        className={`noise-card ${on ? '' : 'off'}`}
        onPointerEnter={() => onFocusNoise(id)}
        onPointerLeave={() => onFocusNoise(null)}
        onFocus={() => onFocusNoise(id)}
        onBlur={() => onFocusNoise(null)}
      >
        <label className="check noise-title">
          <input type="checkbox" checked={on} onChange={(e) => edit(id, { on: e.target.checked })} />
          {title}
        </label>
        <div className="noise-band">{band}</div>
        <div className="knobs compact">{controls}</div>
        <p className="muted small">{help}</p>
      </div>
    );
  };

  const { mains, wander, emg, white, offset, motion } = settings;

  return (
    <section className={`panel ${settings.enabled ? '' : 'noise-disabled'}`}>
      <div className="panel-head">
        <h2>Ruido en la entrada</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
          />
          Ruido activado
        </label>
        <button onClick={() => onChange(DEFAULT_NOISE)}>Restablecer</button>
      </div>
      <p className="muted small top">
        Todo lo que se suma al ECG entre el corazón y el equipo. Con el cursor sobre un ruido, su
        banda se resalta en el espectro; apagando los demás se lo ve solo en el monitor.
      </p>
      <div className="noise-grid">
        {card(
          'mains',
          'Red eléctrica',
          `${mains.freq} Hz${mains.harmonics ? ' y armónicos impares' : ''}`,
          'Los cables y aparatos cercanos inducen la frecuencia de la red en el cuerpo y en los cables de los electrodos. Es una senoidal fija: una línea angosta en el espectro.',
          <>
            <Knob label="Amplitud" size="small" value={mains.level} min={0} max={1} step={0.01} defaultValue={DEFAULT_NOISE.mains.level} format={mv} onChange={(level) => edit('mains', { level })} />
            <div className="noise-switches">
              <div className="seg">
                {([50, 60] as const).map((f) => (
                  <button key={f} className={mains.freq === f ? 'on' : ''} onClick={() => edit('mains', { freq: f })}>
                    {f} Hz
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={mains.harmonics} onChange={(e) => edit('mains', { harmonics: e.target.checked })} />
                Armónicos
              </label>
            </div>
          </>,
        )}
        {card(
          'wander',
          'Deriva de línea de base',
          `${dec(wander.breath, 2)} Hz y más lento`,
          'La respiración mueve el pecho y los electrodos, y la impedancia piel-electrodo cambia despacio. La línea de base sube y baja; en el espectro, energía por debajo de 1 Hz.',
          <>
            <Knob label="Amplitud" size="small" value={wander.level} min={0} max={2} step={0.05} defaultValue={DEFAULT_NOISE.wander.level} format={mv} onChange={(level) => edit('wander', { level })} />
            <Knob label="Respiración" size="small" value={wander.breath} min={0.1} max={0.6} step={0.01} defaultValue={DEFAULT_NOISE.wander.breath} format={hz} onChange={(breath) => edit('wander', { breath })} />
          </>,
        )}
        {card(
          'emg',
          'Ruido muscular (EMG)',
          '20 a 450 Hz',
          'Los músculos también generan potenciales eléctricos. Es ruido de banda ancha que se solapa con el QRS, por eso no se puede quitar del todo sin deformarlo.',
          <>
            <Knob label="Nivel eficaz" size="small" value={emg.level} min={0} max={0.2} step={0.005} defaultValue={DEFAULT_NOISE.emg.level} format={uv} onChange={(level) => edit('emg', { level })} />
            <label className="check">
              <input type="checkbox" checked={emg.bursts} onChange={(e) => edit('emg', { bursts: e.target.checked })} />
              En ráfagas
            </label>
          </>,
        )}
        {card(
          'white',
          'Ruido blanco',
          'Toda la banda',
          'Ruido térmico de los electrodos y del amplificador. Tiene el mismo nivel en todas las frecuencias: es el piso plano del espectro.',
          <Knob label="Nivel eficaz" size="small" value={white.level} min={0} max={0.1} step={0.001} defaultValue={DEFAULT_NOISE.white.level} format={uv} onChange={(level) => edit('white', { level })} />,
        )}
        {card(
          'offset',
          'Offset de electrodos',
          '0 Hz (continua)',
          'Cada electrodo tiene un potencial de media celda; si los dos no son iguales queda una tensión continua de hasta cientos de mV, mucho más grande que el ECG. El trazo se va de la pantalla.',
          <Knob label="Offset" size="small" value={offset.level} min={0} max={300} step={1} defaultValue={DEFAULT_NOISE.offset.level} format={mvBig} onChange={(level) => edit('offset', { level })} />,
        )}
        {card(
          'motion',
          'Artefactos de movimiento',
          'Por debajo de 10 Hz',
          'Un tirón del cable o un movimiento del paciente produce un salto que vuelve despacio a cero. Cae en la misma banda que el ECG: ningún filtro lo quita limpio.',
          <>
            <Knob label="Amplitud" size="small" value={motion.level} min={0} max={5} step={0.1} defaultValue={DEFAULT_NOISE.motion.level} format={mv} onChange={(level) => edit('motion', { level })} />
            <Knob label="Frecuencia" size="small" value={motion.rate} min={1} max={30} step={1} defaultValue={DEFAULT_NOISE.motion.rate} format={perMin} onChange={(rate) => edit('motion', { rate })} />
          </>,
        )}
      </div>
    </section>
  );
}
