import { cutoff, DEFAULT_HP, DEFAULT_LP, PRESETS, type RcKind, type RcSettings } from '../engine/filters';
import { RcSchematic } from '../views/RcSchematic';
import { Knob } from './Knob';
import { farads, hz, ohms, seconds } from './units';

const TEXT: Record<RcKind, { title: string; help: string }> = {
  hp: {
    title: 'Filtro RC pasa altos',
    help: 'Bloquea la continua y lo que cambia más lento que fc: quita el offset de los electrodos y la deriva de la línea de base. Si fc es muy alta también se come las partes lentas del ECG, como el segmento ST y la onda T. Tras un salto grande tarda unas 5 τ en volver a la línea de base.',
  },
  lp: {
    title: 'Filtro RC pasa bajos',
    help: 'Atenúa lo que cambia más rápido que fc: ruido muscular, ruido blanco y, en parte, la red. Con fc baja también redondea el QRS y le baja la amplitud a la onda R. Un solo polo cae sólo 20 dB por década, así que a 50 Hz atenúa poco.',
  },
};

type Props = {
  kind: RcKind;
  settings: RcSettings;
  onChange: (s: RcSettings) => void;
};

// Panel de un filtro RC: interruptor, R y C, valores típicos y lo que sale
// de ellos (frecuencia de corte y constante de tiempo).
export function FilterPanel({ kind, settings, onChange }: Props) {
  const edit = (patch: Partial<RcSettings>) => onChange({ ...settings, ...patch });
  const fallback = kind === 'hp' ? DEFAULT_HP : DEFAULT_LP;
  const fc = cutoff(settings);
  const { title, help } = TEXT[kind];

  return (
    <section className={`panel ${settings.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>{title}</h2>
        <label className="check">
          <input type="checkbox" checked={settings.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
      </div>

      <RcSchematic kind={kind} settings={settings} />

      <div className="knobs compact amp-knobs">
        <Knob label="R" size="small" value={settings.r} min={1e3} max={10e6} scale="log" defaultValue={fallback.r} format={ohms} onChange={(r) => edit({ r })} />
        <Knob label="C" size="small" value={settings.c} min={1e-9} max={10e-6} scale="log" defaultValue={fallback.c} format={farads} onChange={(c) => edit({ c })} />
        <div className="noise-switches">
          <span className="switch-label">Valores típicos</span>
          <div className="seg">
            {PRESETS[kind].map((p) => {
              const on = p.r === settings.r && p.c === settings.c;
              return (
                <button key={p.label} className={on ? 'on' : ''} onClick={() => edit({ r: p.r, c: p.c })}>
                  {p.label} {hz(cutoff({ on: true, r: p.r, c: p.c }))}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <dl className="readouts">
        <div>
          <dt>fc = 1 / (2π·R·C)</dt>
          <dd>{hz(fc)}</dd>
        </div>
        <div>
          <dt>τ = R·C</dt>
          <dd>{seconds(settings.r * settings.c)}</dd>
        </div>
      </dl>
      <p className="muted small">{help}</p>
    </section>
  );
}
