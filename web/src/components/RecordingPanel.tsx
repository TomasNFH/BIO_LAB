import { useRef, useState } from 'react';
import { csvToRecording, parseCsv, wfdbToRecording, type CsvTable, type Recording } from '../engine/recording';
import { dec } from './Knob';

type Props = {
  recording: Recording | null;
  channel: number;
  onLoad: (r: Recording) => void;
  onChannel: (c: number) => void;
};

const UNITS = ['mV', 'uV', 'V'];

// Explicación del registro, en el «?» del panel de la fuente.
export const RECORDING_HELP =
  'Un registro real en vez de la señal sintética. Sirve un CSV (una columna por canal, con o sin columna de tiempo; por ejemplo la exportación CSV de PhysioNet o la de este laboratorio) o un registro WFDB de PhysioNet: elegir juntos el .hea, el .dat y, si está, el .atr con los latidos anotados por cardiólogos (como los de la base MIT-BIH de arritmias). Con anotaciones, el detector de QRS se mide contra ellas. El registro se repite en bucle; la «señal limpia» de las métricas es el registro tal cual, así que miden lo que agrega o quita la cadena. El archivo se lee en el navegador y no se sube a ningún lado.';

const minutes = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${dec(s % 60, 0)} s` : `${dec(s, 1)} s`);

// Carga de un registro real desde la computadora: nada se sube a ningún
// lado, el archivo se lee en el navegador.
export function RecordingPanel({ recording, channel, onLoad, onChannel }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  // CSV sin columna de tiempo: hay que pedir la frecuencia de muestreo.
  const [pending, setPending] = useState<{ name: string; table: CsvTable } | null>(null);
  const [fs, setFs] = useState(360);
  const [unit, setUnit] = useState('mV');

  const load = async (list: FileList) => {
    setError('');
    setPending(null);
    try {
      const files = [...list];
      const hea = files.find((f) => f.name.toLowerCase().endsWith('.hea'));
      if (hea) {
        const map = new Map<string, ArrayBuffer>();
        for (const f of files) map.set(f.name, await f.arrayBuffer());
        onLoad(wfdbToRecording(map, hea.name));
        return;
      }
      const csv = files.find((f) => /\.(csv|txt|tsv)$/i.test(f.name)) ?? files[0];
      const table = parseCsv(await csv.text());
      const name = csv.name.replace(/\.[^.]+$/, '');
      if (table.fs && table.units.every((u) => u)) {
        onLoad(csvToRecording(name, table, table.fs, 'mV'));
      } else {
        if (table.fs) setFs(Math.round(table.fs));
        setPending({ name, table });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  };

  const rec = recording;
  const duration = rec ? rec.channels[0].data.length / rec.fs : 0;
  const beats = rec?.annotations?.filter((a) => a.beat) ?? [];
  const ventricular = beats.filter((a) => a.ventricular).length;

  return (
    <>
      <div className="row">
        <button className="primary" onClick={() => fileRef.current?.click()}>
          Cargar archivo…
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept=".csv,.txt,.tsv,.hea,.dat,.atr"
          onChange={(e) => {
            if (e.target.files?.length) load(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="sat-warning">{error}</p>}

      {pending && (
        <div className="fx-block">
          <span className="sub-title">«{pending.name}»: faltan datos</span>
          <div className="row">
            {!pending.table.fs && (
              <label className="check">
                Frecuencia de muestreo
                <input className="text short" type="number" min={50} max={20000} value={fs} onChange={(e) => setFs(Number(e.target.value))} />
                Hz
              </label>
            )}
            {pending.table.units.some((u) => !u) && (
              <div className="seg">
                {UNITS.map((u) => (
                  <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>
                    {u === 'uV' ? 'µV' : u}
                  </button>
                ))}
              </div>
            )}
            <button
              disabled={!(fs > 0)}
              onClick={() => {
                onLoad(csvToRecording(pending.name, pending.table, pending.table.fs ?? fs, unit));
                setPending(null);
              }}
            >
              Usar
            </button>
          </div>
        </div>
      )}

      {rec && (
        <dl className="readouts">
          <div>
            <dt>Registro</dt>
            <dd>{rec.name}</dd>
          </div>
          <div>
            <dt>Frecuencia de muestreo · duración</dt>
            <dd>
              {dec(rec.fs, rec.fs % 1 ? 1 : 0)} Hz · {minutes(duration)}
            </dd>
          </div>
          <div>
            <dt>Anotaciones</dt>
            <dd>{rec.annotations ? `${beats.length} latidos (${ventricular} V)` : 'no tiene'}</dd>
          </div>
        </dl>
      )}
      {rec && rec.channels.length > 1 && (
        <div className="switch-rows post-gain">
          <span className="switch-label">Canal</span>
          <div className="seg wrap">
            {rec.channels.map((c, i) => (
              <button key={i} className={channel === i ? 'on' : ''} onClick={() => onChannel(i)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
