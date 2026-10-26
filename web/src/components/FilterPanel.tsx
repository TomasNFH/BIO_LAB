import { cutoff, DEFAULT_HP, DEFAULT_LP, PRESETS, SHAPES, type FilterKind, type FilterSettings, type Shape } from '../engine/filters';
import { BANDS, rangeText } from './bands';
import type { ChainSettings } from '../engine/chain';
import { Help } from './Help';
import { FilterSchematic } from '../views/FilterSchematic';
import { dec, Knob } from './Knob';
import { farads, hz, ohms, seconds } from './units';

const TEXT: Record<FilterKind, { title: string; help: string }> = {
  hp: {
    title: 'Filtro pasa altos',
    help: 'Bloquea la continua y lo que cambia más lento que fc: quita el offset de los electrodos y la deriva de la línea de base. Si fc es muy alta también se come las partes lentas del ECG y deforma el segmento ST: por eso los equipos de diagnóstico usan 0,05 Hz. Tras un salto grande tarda unas 5 τ en volver a la línea de base.',
  },
  lp: {
    title: 'Filtro pasa bajos',
    help: 'Atenúa lo que cambia más rápido que fc: ruido muscular, ruido blanco y, en parte, la red. Con fc baja también redondea el QRS y le baja la amplitud a la onda R. Uno de primer orden cae sólo 20 dB por década; el de segundo orden, 40.',
  },
};

const SHAPE_HELP: Record<Shape, string> = {
  butterworth: 'la más plana en la banda de paso',
  bessel: 'la que menos deforma la forma de onda',
  chebyshev: 'la que corta más rápido, con 1 dB de ondulación',
};

type Props = {
  kind: FilterKind;
  settings: FilterSettings;
  onChange: (s: FilterSettings) => void;
  chain: ChainSettings; // para mostrar la banda de la rama
  band: number; // banda típica de la rama, o -1
  onBand: (i: number) => void; // fija el pasa altos y el pasa bajos juntos
};

// Panel de un filtro: interruptor, orden, R y C, valores típicos y lo que
// sale de ellos.
export function FilterPanel({ kind, settings, onChange, chain, band, onBand }: Props) {
  const edit = (patch: Partial<FilterSettings>) => onChange({ ...settings, ...patch });
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
        <Help label="Ayuda del filtro">
          <p>{help}</p>
          {settings.order === 2 && (
            <p>
              Respuesta {SHAPES[settings.shape].label}: {SHAPE_HELP[settings.shape]}. R y C son los
              valores base; el esquema muestra cómo se separa cada par para dar ese Q.
            </p>
          )}
        </Help>
      </div>

      <div className="switch-rows">
        <div className="seg">
          <button className={settings.order === 1 ? 'on' : ''} onClick={() => edit({ order: 1 })}>
            1.er orden RC
          </button>
          <button className={settings.order === 2 ? 'on' : ''} onClick={() => edit({ order: 2 })}>
            2.º orden Sallen-Key
          </button>
        </div>
        {settings.order === 2 && (
          <div className="seg">
            {(Object.keys(SHAPES) as Shape[]).map((s) => (
              <button key={s} className={settings.shape === s ? 'on' : ''} onClick={() => edit({ shape: s })}>
                {SHAPES[s].label}
              </button>
            ))}
          </div>
        )}
      </div>

      <FilterSchematic kind={kind} settings={settings} />

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
                  {p.label} {hz(cutoff(p))}
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
        {settings.order === 1 ? (
          <div>
            <dt>τ = R·C</dt>
            <dd>{seconds(settings.r * settings.c)}</dd>
          </div>
        ) : (
          <div>
            <dt>Q ({SHAPES[settings.shape].label})</dt>
            <dd>{dec(SHAPES[settings.shape].q, 3)}</dd>
          </div>
        )}
        <div>
          <dt>Pendiente fuera de banda</dt>
          <dd>{settings.order * 20} dB/década</dd>
        </div>
      </dl>

      {/* Pasa banda: pasa altos y pasa bajos de la rama, de una vez. */}
      <div className="fx-block">
        <span className="switch-label">Banda típica (fija el pasa altos y el pasa bajos de la rama)</span>
        <div className="seg wrap">
          {BANDS.map((b, i) => (
            <button key={b.label} className={band === i ? 'on' : ''} aria-pressed={band === i} onClick={() => onBand(i)}>
              {b.label}
            </button>
          ))}
        </div>
        <span className="muted-inline">La rama deja pasar de {rangeText(chain).replace(' – ', ' a ')}.</span>
      </div>
    </section>
  );
}
