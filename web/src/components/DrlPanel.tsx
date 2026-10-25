import { useEffect, useState } from 'react';
import type { BioEngine } from '../engine/BioEngine';
import type { Branch } from '../engine/chain';
import { DEFAULT_DRL, DRL_RA, drlGain, type DrlSettings } from '../engine/drl';
import { Dot, OpAmp, Res } from '../views/AmpSchematic';
import { dec, Knob } from './Knob';
import { ohms } from './units';

const mv = (v: number) => (v >= 1000 ? `${dec(v / 1000, 2)} V` : v >= 1 ? `${dec(v, 1)} mV` : `${dec(v * 1000, 0)} µV`);

type Props = {
  engine: BioEngine;
  branch: Branch;
  settings: DrlSettings;
  onChange: (s: DrlSettings) => void;
  cm0: number; // modo común de pico del cuerpo sin DRL, mV
  swing: number; // tensión máxima de salida del op-amp, V
};

// Circuito de pierna derecha: perilla de Rf, esquema y cuánto baja el modo
// común del cuerpo.
export function DrlPanel({ engine, branch, settings, onChange, cm0, swing }: Props) {
  const edit = (patch: Partial<DrlSettings>) => onChange({ ...settings, ...patch });
  const g = drlGain(settings);
  // Lo que queda en el cuerpo: Vcm0 / (1 + G), salvo que el op-amp no llegue.
  const linear = cm0 / (1 + g);
  const needed = (g * cm0) / (1 + g) / 1000; // V de salida que hacen falta
  const left = settings.on ? (needed > swing ? cm0 - swing * 1000 : linear) : cm0;
  const stats = useDrlStats(engine, branch);

  return (
    <section className={`panel ${settings.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Pierna derecha (DRL)</h2>
        <label className="check">
          <input type="checkbox" checked={settings.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <button onClick={() => onChange(DEFAULT_DRL)}>Restablecer</button>
      </div>
      <p className="muted small top">
        En vez de conectar la pierna derecha a masa, un op-amp mide el modo común en las entradas,
        lo invierte y lo devuelve al cuerpo: el lazo empuja todo el cuerpo hacia 0 V. Apagado, la
        pierna derecha va a masa y el cuerpo queda al modo común de la red.
      </p>

      <svg className="schematic drl" viewBox="0 0 340 130" role="img" aria-label="Esquema del circuito de pierna derecha">
        <text className="sch-label" x={2} y={36}>V+</text>
        <text className="sch-label" x={2} y={96}>V−</text>
        <path d="M28 30H44M28 90H44M106 30H130V90H106M130 60H182M182 90H172V104M150 60V18H168M228 18H262V77M242 77H262" />
        <Res x1={44} y1={30} x2={106} y2={30} />
        <Res x1={44} y1={90} x2={106} y2={90} />
        <Res x1={168} y1={18} x2={228} y2={18} />
        <path d="M160 104h24M164 109h16M169 114h6" />
        <OpAmp x={182} y={75} topPlus={false} label="" />
        <Res x1={262} y1={77} x2={316} y2={77} />
        <Dot x={130} y={60} />
        <Dot x={150} y={60} />
        <Dot x={262} y={77} />
        <text className="sch-value" x={50} y={16}>Ra {ohms(DRL_RA)}</text>
        <text className="sch-value" x={50} y={118}>Ra {ohms(DRL_RA)}</text>
        <text className="sch-value sch-accent" x={170} y={8}>Rf {ohms(settings.rf)}</text>
        <text className="sch-value" x={272} y={64}>R0</text>
        <text className="sch-value" x={222} y={104}>→ pierna derecha</text>
      </svg>

      <div className="knobs compact amp-knobs">
        <Knob label="Rf" size="small" value={settings.rf} min={25_000} max={2.5e6} scale="log" defaultValue={DEFAULT_DRL.rf} format={ohms} onChange={(rf) => edit({ rf: Math.round(rf) })} />
      </div>

      <dl className="readouts">
        <div>
          <dt>Ganancia G = 2·Rf / Ra</dt>
          <dd>×{dec(g, g < 10 ? 1 : 0)}</dd>
        </div>
        <div>
          <dt>Reducción = 1 + G</dt>
          <dd>{dec(20 * Math.log10(1 + g), 1)} dB</dd>
        </div>
        <div>
          <dt>Modo común sin DRL (pico)</dt>
          <dd>{mv(cm0)}</dd>
        </div>
        <div>
          <dt>Modo común que queda (pico)</dt>
          <dd>{mv(left)}</dd>
        </div>
        <div>
          <dt>Salida del DRL, pico (máx. ±{dec(swing, 1)} V)</dt>
          <dd className={settings.on && stats?.saturated ? 'bad' : ''}>{settings.on && stats ? `${dec(stats.peak, 2)} V` : '—'}</dd>
        </div>
      </dl>
      {settings.on && stats?.saturated && (
        <p className="sat-warning">
          ● El DRL satura: para cancelar el modo común tendría que sacar más tensión que su
          alimentación, y sólo resta lo que alcanza.
        </p>
      )}
      <p className="muted small">
        El DRL ayuda de dos formas. Baja lo que el CMRR del amplificador deja pasar, y evita que un
        modo común de varios volts sature la etapa 1, que lo deja pasar con ganancia 1. En un equipo
        real Rf lleva un capacitor en paralelo para que el lazo no oscile, y R0 limita la corriente
        que puede llegar al paciente si algo falla.
      </p>
    </section>
  );
}

// Lee cuatro veces por segundo la salida del DRL; en pausa se queda con la
// última lectura.
function useDrlStats(engine: BioEngine, branch: Branch) {
  const [stats, setStats] = useState<{ peak: number; saturated: boolean } | null>(null);
  useEffect(() => {
    setStats(null);
    const id = setInterval(() => {
      const s = engine.chains[branch].drl.readStats();
      if (s) setStats(s);
    }, 250);
    return () => clearInterval(id);
  }, [engine, branch]);
  return stats;
}
