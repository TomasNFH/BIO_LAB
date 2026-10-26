import { DEFAULT_NOTCH, type NotchSettings } from '../engine/filters';
import { Help } from './Help';
import { NotchSchematic } from '../views/FilterSchematic';
import { dec, Knob } from './Knob';

type Props = {
  settings: NotchSettings;
  onChange: (s: NotchSettings) => void;
};

// Notch doble T para la interferencia de red.
export function NotchPanel({ settings, onChange }: Props) {
  const edit = (patch: Partial<NotchSettings>) => onChange({ ...settings, ...patch });
  // Ancho de la muesca a −3 dB.
  const width = settings.f0 / settings.q;

  return (
    <section className={`panel ${settings.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Filtro notch (doble T)</h2>
        <label className="check">
          <input type="checkbox" checked={settings.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <Help label="Ayuda del notch">
          <p>
            Cancela una sola frecuencia: la de la red. Tiene que coincidir con la red del lugar (50
            o 60 Hz). Con Q alto la muesca es angosta y casi no toca el ECG, pero el filtro tarda en
            asentarse y deja una oscilación (ringing) después de cada cambio brusco, como el QRS.
            Con Q bajo se asienta rápido pero se come más banda alrededor de f0.
          </p>
        </Help>
      </div>

      <NotchSchematic settings={settings} />

      <div className="knobs compact amp-knobs">
        <Knob label="Q" size="small" value={settings.q} min={0.25} max={30} scale="log" defaultValue={DEFAULT_NOTCH.q} format={(q) => dec(q, q < 1 ? 2 : 1)} onChange={(q) => edit({ q })} />
        <div className="noise-switches">
          <span className="switch-label">Frecuencia de la red</span>
          <div className="seg">
            {([50, 60] as const).map((f) => (
              <button key={f} className={settings.f0 === f ? 'on' : ''} onClick={() => edit({ f0: f })}>
                {f} Hz
              </button>
            ))}
          </div>
        </div>
      </div>

      <dl className="readouts">
        <div>
          <dt>Ancho de la muesca (−3 dB)</dt>
          <dd>{dec(width, width < 10 ? 1 : 0)} Hz</dd>
        </div>
        <div>
          <dt>Tiempo de asentamiento ≈ Q / (π·f0)</dt>
          <dd>{dec((1000 * settings.q) / (Math.PI * settings.f0), 0)} ms</dd>
        </div>
      </dl>
    </section>
  );
}
