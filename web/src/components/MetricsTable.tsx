import { useEffect, useState } from 'react';
import type { BioEngine, SourceKind } from '../engine/BioEngine';
import { BRANCHES, type Branch } from '../engine/chain';
import { measure, type Metrics } from '../engine/metrics';
import { dec } from './Knob';

const signed = (v: number, digits: number) => `${v > 0 ? '+' : ''}${dec(v, digits)}`;
const pct = (v: number) => (Number.isFinite(v) ? dec(v, 0) : '—');

// Una fila de la tabla: un valor por rama, o uno solo para las dos (lo
// real, que no depende de la cadena).
type Row = {
  label: string;
  title: string;
  value?: (m: Metrics) => string;
  shared?: (m: Metrics) => string;
};

const COMMON: Row[] = [
  { label: 'Retardo (ms)', title: 'Cuánto llega tarde la salida respecto de la señal limpia', value: (m) => dec(m.delay * 1000, 0) },
  {
    label: 'SNR (dB)',
    title: 'Potencia de la señal sobre potencia de todo lo que la salida tiene de distinto, ya alineadas',
    value: (m) => (Number.isFinite(m.snr) ? dec(m.snr, 1) : '∞'),
  },
  { label: 'Error (µV)', title: 'Valor eficaz de salida − señal limpia', value: (m) => dec(m.errorRms * 1000, 0) },
];

const ECG_ROWS: Row[] = [
  { label: 'Onda R (%)', title: 'Altura de la onda R medida, en % de la real', value: (m) => (m.kind === 'ecg' ? pct(m.rPercent) : '—') },
  {
    label: 'ST (mV)',
    title: 'Desnivel del ST a 80 ms del R, respecto del segmento PR',
    value: (m) => (m.kind === 'ecg' && m.beats ? signed(m.stMeasured, 3) : '—'),
  },
  { label: 'ST real', title: 'El desnivel ST de la señal limpia', shared: (m) => (m.kind === 'ecg' && m.beats ? signed(m.stTrue, 3) : '—') },
  {
    label: 'QRS Se (%)',
    title: 'Detector de QRS en los últimos 20 s: % de los latidos reales que encontró (sensibilidad)',
    value: (m) => (m.kind === 'ecg' && m.qrs ? pct(m.qrs.sensitivity) : '—'),
  },
  {
    label: 'QRS VPP (%)',
    title: 'Detector de QRS: % de sus detecciones que eran latidos (valor predictivo positivo)',
    value: (m) => (m.kind === 'ecg' && m.qrs ? pct(m.qrs.ppv) : '—'),
  },
  {
    label: 'FC (lpm)',
    title: 'Frecuencia cardíaca según las detecciones, en los últimos 20 s',
    value: (m) => (m.kind === 'ecg' && m.qrs && Number.isFinite(m.qrs.bpmMeasured) ? dec(m.qrs.bpmMeasured, 0) : '—'),
  },
  {
    label: 'FC real',
    title: 'La frecuencia de los latidos reales en la misma ventana',
    shared: (m) => (m.kind === 'ecg' && m.qrs && Number.isFinite(m.qrs.bpmTrue) ? dec(m.qrs.bpmTrue, 0) : '—'),
  },
];

const BY_SOURCE: Record<SourceKind, Row[]> = {
  ecg: ECG_ROWS,
  // Un registro real se mide como un ECG (sin anotaciones, las filas de
  // latidos quedan vacías).
  rec: ECG_ROWS,
  emg: [
    {
      label: 'Amplitud (%)',
      title: 'Valor eficaz de la salida, en % del real: cuánta fuerza parecería que hace el músculo',
      value: (m) => (m.kind === 'emg' ? pct(m.rmsPercent) : '—'),
    },
    {
      label: 'Mediana (Hz)',
      title: 'Frecuencia que parte la potencia del espectro en dos mitades (baja con la fatiga, y también si se filtra o se muestrea mal)',
      value: (m) => (m.kind === 'emg' && Number.isFinite(m.medianMeasured) ? dec(m.medianMeasured, 0) : '—'),
    },
    {
      label: 'Mediana real',
      title: 'La frecuencia mediana de la señal limpia',
      shared: (m) => (m.kind === 'emg' && Number.isFinite(m.medianTrue) ? dec(m.medianTrue, 0) : '—'),
    },
    {
      label: 'Envolvente (%)',
      title: 'Correlación entre la envolvente medida y la real (valor eficaz en 100 ms): si se ve bien cuándo y cuánto se activa el músculo',
      value: (m) => (m.kind === 'emg' ? pct(m.envelopeCorr) : '—'),
    },
  ],
  eog: [
    {
      label: 'Mirada (°)',
      title: 'El error eficaz expresado en grados, con la sensibilidad del EOG',
      value: (m) => (m.kind === 'eog' ? dec(m.angleError, 1) : '—'),
    },
    {
      label: 'Salto a 1 s (%)',
      title: 'Qué parte del cambio de mirada de cada sacada grande se sigue viendo 1 s después, durante la fijación',
      value: (m) => (m.kind === 'eog' && m.steps ? pct(m.stepRetained) : '—'),
    },
  ],
};

// Qué tan fiel es cada rama, medido contra la señal limpia en los últimos
// 8 s, después de alinear la salida en su retardo. Una fila por medida y
// una columna por rama, para que entre al costado del monitor.
export function MetricsTable({ engine, source }: { engine: BioEngine; source: SourceKind }) {
  const metrics = useMetrics(engine);
  const rows = [...COMMON, ...BY_SOURCE[source]];
  // Al cambiar de fuente, hasta la próxima medición queda la vieja.
  const kind = source === 'rec' ? 'ecg' : source;
  const m = (b: Branch) => (metrics[b]?.kind === kind ? metrics[b] : null);
  const first = m('a') ?? m('b');
  return (
    <table className="metrics-v" aria-label="Métricas de cada rama">
      <thead>
        <tr>
          <th />
          {BRANCHES.map((b) => (
            <th key={b}>
              <span className={`branch-dot ${b}`} /> {b.toUpperCase()}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className={r.shared ? 'shared' : ''}>
            <th scope="row" title={r.title}>
              {r.label}
            </th>
            {r.shared ? (
              <td colSpan={2}>{first ? r.shared(first) : '—'}</td>
            ) : (
              BRANCHES.map((b) => {
                const mb = m(b);
                return <td key={b}>{mb && r.value ? r.value(mb) : '—'}</td>;
              })
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Mide las dos ramas cuatro veces por segundo; en pausa no cambia nada, así
// que se queda con la última medición.
function useMetrics(engine: BioEngine) {
  const [metrics, setMetrics] = useState<Record<Branch, Metrics | null>>({ a: null, b: null });
  useEffect(() => {
    let lastCount = -1;
    const id = setInterval(() => {
      if (engine.sampleCount === lastCount) return;
      lastCount = engine.sampleCount;
      setMetrics({ a: measure(engine, 'a'), b: measure(engine, 'b') });
    }, 250);
    return () => clearInterval(id);
  }, [engine]);
  return metrics;
}
