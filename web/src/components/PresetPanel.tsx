import { useRef, useState } from 'react';
import type { BioEngine } from '../engine/BioEngine';
import { download, stamp, toCsv, type CsvFormat } from '../export';
import { BUILTIN_PRESETS, loadUserPresets, normalize, saveUserPresets, type LabSettings, type Preset } from '../lab';

const SECONDS = [5, 10, 30];

type Props = {
  engine: BioEngine;
  current: LabSettings;
  onApply: (s: LabSettings) => void;
};

// Experimentos listos, ajustes guardados en el navegador, intercambio en
// JSON y exportación de las señales en CSV.
export function PresetPanel({ engine, current, onApply }: Props) {
  const [user, setUser] = useState<Preset[]>(loadUserPresets);
  // Clave de la opción elegida: "b:<índice>" (experimento) o "u:<índice>".
  const [selected, setSelected] = useState('b:0');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(10);
  const [format, setFormat] = useState<CsvFormat>('dot');
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, index] = [selected[0], Number(selected.slice(2))];
  const preset = kind === 'b' ? BUILTIN_PRESETS[index] : user[index];

  const storeUser = (next: Preset[]) => {
    setUser(next);
    if (!saveUserPresets(next)) setMessage('El navegador no deja guardar: el ajuste dura hasta cerrar la página.');
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const p: Preset = { name: n, description: 'Guardado en este navegador.', settings: structuredClone(current) };
    const i = user.findIndex((u) => u.name === n);
    const next = i >= 0 ? user.map((u, k) => (k === i ? p : u)) : [...user, p];
    storeUser(next);
    setSelected(`u:${i >= 0 ? i : next.length - 1}`);
    setName('');
    setMessage(i >= 0 ? `«${n}» reemplazado.` : `«${n}» guardado.`);
  };

  const remove = () => {
    if (kind !== 'u' || !preset) return;
    storeUser(user.filter((_, k) => k !== index));
    setSelected('b:0');
    setMessage(`«${preset.name}» borrado.`);
  };

  const exportJson = () => {
    const p = { name: name.trim() || 'Ajuste de Bio Lab', settings: current };
    download(`bio-lab_ajuste_${stamp()}.json`, JSON.stringify(p, null, 2), 'application/json');
  };

  const importJson = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const p: Preset = {
        name: typeof raw.name === 'string' ? raw.name : file.name.replace(/\.json$/i, ''),
        description: 'Importado de un archivo.',
        settings: normalize(raw.settings ?? raw),
      };
      const next = [...user.filter((u) => u.name !== p.name), p];
      storeUser(next);
      setSelected(`u:${next.length - 1}`);
      onApply(p.settings);
      setMessage(`«${p.name}» importado y cargado.`);
    } catch {
      setMessage('Ese archivo no es un ajuste de Bio Lab (JSON).');
    }
  };

  const exportCsv = () => {
    download(`bio-lab_senales_${stamp()}.csv`, toCsv(engine, seconds, format), 'text/csv');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Experimentos y ajustes</h2>
      </div>
      <div className="row">
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Experimento o ajuste guardado">
          <optgroup label="Experimentos">
            {BUILTIN_PRESETS.map((p, i) => (
              <option key={p.name} value={`b:${i}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {user.length > 0 && (
            <optgroup label="Guardados">
              {user.map((p, i) => (
                <option key={p.name} value={`u:${i}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button className="primary" disabled={!preset} onClick={() => preset && onApply(structuredClone(preset.settings))}>
          Cargar
        </button>
        {kind === 'u' && <button onClick={remove}>Borrar</button>}
      </div>
      {preset && <p className="muted small">{preset.description}</p>}

      <div className="row preset-save">
        <input
          className="text"
          value={name}
          placeholder="Nombre para guardar lo actual"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          aria-label="Nombre del ajuste"
        />
        <button disabled={!name.trim()} onClick={save}>
          Guardar
        </button>
      </div>
      <div className="row preset-save">
        <button onClick={exportJson}>Exportar ajuste (JSON)</button>
        <button onClick={() => fileRef.current?.click()}>Importar ajuste</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
      </div>
      {message && <p className="muted small">{message}</p>}

      <div className="fx-block">
        <span className="sub-title">Exportar señales (CSV)</span>
        <div className="switch-rows">
          <div className="seg">
            {SECONDS.map((s) => (
              <button key={s} className={seconds === s ? 'on' : ''} onClick={() => setSeconds(s)}>
                Últimos {s} s
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={format === 'dot' ? 'on' : ''} onClick={() => setFormat('dot')}>
              Punto decimal (Python, MATLAB)
            </button>
            <button className={format === 'comma' ? 'on' : ''} onClick={() => setFormat('comma')}>
              Coma decimal (planillas)
            </button>
          </div>
          <button onClick={exportCsv}>Descargar CSV</button>
        </div>
        <p className="muted small">
          Una fila por milisegundo con la señal limpia, la entrada y, para cada rama, la salida del
          amplificador, de cada filtro y del ADC, todas en mV referidos a la entrada. La señal limpia
          sirve de referencia para medir por tu cuenta qué hizo cada bloque.
        </p>
      </div>
    </section>
  );
}
