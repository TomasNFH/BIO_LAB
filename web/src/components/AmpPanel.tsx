import { useEffect, useState } from 'react';
import { ampGains, DEFAULT_AMP, type AmpSettings, type AmpStats } from '../engine/amp';
import type { BioEngine } from '../engine/BioEngine';
import { AmpSchematic, ohms } from '../views/AmpSchematic';
import { dec, Knob } from './Knob';

const G2_VALUES = [1, 2, 5, 10];

const times = (v: number) => (v >= 100 ? dec(v, 0) : v >= 10 ? dec(v, 1) : dec(v, 2));
const db = (v: number) => (Number.isFinite(v) ? `${dec(20 * Math.log10(v), 1)} dB` : '∞');
const pct = (v: number) => `${dec(v * 100, v < 0.001 ? 3 : v < 0.01 ? 2 : 1)} %`;
const volts = (v: number) => `${dec(v, 2)} V`;

type Props = {
  engine: BioEngine;
  settings: AmpSettings;
  onChange: (s: AmpSettings) => void;
};

// Amplificador de instrumentación: perillas por componente, esquema con
// los valores, ganancias y CMRR calculados, y lo que pasa en la salida.
export function AmpPanel({ engine, settings, onChange }: Props) {
  const edit = (patch: Partial<AmpSettings>) => onChange({ ...settings, ...patch });
  const g = ampGains(settings);
  const stats = useAmpStats(engine);

  return (
    <section className={`panel ${settings.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Amplificador de instrumentación</h2>
        <label className="check">
          <input type="checkbox" checked={settings.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <button onClick={() => onChange(DEFAULT_AMP)}>Restablecer</button>
      </div>
      <p className="muted small top">
        Resta las tensiones de los dos electrodos y amplifica la diferencia. Apagado, la cadena ve
        la resta ideal: ganancia 1 y modo común cancelado del todo.
      </p>

      <AmpSchematic settings={settings} />

      <div className="knobs compact amp-knobs">
        <Knob label="Rg" size="small" value={settings.rg} min={50} max={1e6} scale="log" defaultValue={DEFAULT_AMP.rg} format={ohms} onChange={(rg) => edit({ rg: Math.round(rg) })} />
        <Knob label="Error R3'" size="small" value={settings.tolerance} min={0.0001} max={0.1} scale="log" defaultValue={DEFAULT_AMP.tolerance} format={pct} onChange={(tolerance) => edit({ tolerance })} />
        <Knob label="Alimentación" size="small" value={settings.supply} min={2.5} max={15} step={0.5} defaultValue={DEFAULT_AMP.supply} format={(v) => `±${dec(v, 1)} V`} onChange={(supply) => edit({ supply })} />
        <div className="noise-switches">
          <span className="switch-label">Ganancia etapa 2 (R3/R2)</span>
          <div className="seg">
            {G2_VALUES.map((v) => (
              <button key={v} className={settings.g2 === v ? 'on' : ''} onClick={() => edit({ g2: v })}>
                ×{v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <dl className="readouts">
        <div>
          <dt>Etapa 1: G1 = 1 + 2·R1/Rg</dt>
          <dd>×{times(g.g1)}</dd>
        </div>
        <div>
          <dt>Etapa 2: G2</dt>
          <dd>×{times(g.ad2)}</dd>
        </div>
        <div>
          <dt>Ganancia total</dt>
          <dd>
            ×{times(g.gain)} <span className="muted-inline">({db(g.gain)})</span>
          </dd>
        </div>
        <div>
          <dt>CMRR = G / Acm</dt>
          <dd>{db(g.cmrr)}</dd>
        </div>
        <div>
          <dt>Salida de la etapa 1, pico</dt>
          <dd className={stats && stats.peakStage1 >= g.swing - 1e-9 ? 'bad' : ''}>
            {stats ? volts(stats.peakStage1) : '—'}
          </dd>
        </div>
        <div>
          <dt>Salida Vo, pico (máx. ±{dec(g.swing, 1)} V)</dt>
          <dd className={stats && stats.peakOut >= g.swing - 1e-9 ? 'bad' : ''}>
            {stats ? volts(stats.peakOut) : '—'}
          </dd>
        </div>
      </dl>
      {settings.on && stats?.saturated && (
        <p className="sat-warning">
          ● Saturado: alguna etapa llegó al límite de la alimentación y recorta la señal. El offset
          de electrodos se amplifica igual que el ECG: 300 mV por ganancia 100 pedirían 30 V a la
          salida. Por eso en un equipo real la ganancia antes del pasa altos es baja y el resto se
          pone después, cuando la continua ya no está.
        </p>
      )}
      <p className="muted small">
        La etapa 1 amplifica la diferencia G1 veces pero deja pasar el modo común con ganancia 1;
        la etapa 2 lo resta. Si R3' no es igual a R3, la resta no es perfecta y una parte del modo
        común pasa a la salida. Por eso subir G1 mejora el CMRR: la señal útil crece y el modo
        común no.
      </p>
    </section>
  );
}

// Lee las estadísticas del amplificador cuatro veces por segundo. En
// pausa se queda con la última lectura.
function useAmpStats(engine: BioEngine) {
  const [stats, setStats] = useState<AmpStats | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const s = engine.amp.readStats();
      if (s) setStats(s);
    }, 250);
    return () => clearInterval(id);
  }, [engine]);
  return stats;
}
