import { useEffect, useState } from 'react';
import type { BioEngine, SourceKind } from '../engine/BioEngine';
import { BRANCHES, type Branch } from '../engine/chain';
import { measure, type Metrics } from '../engine/metrics';
import { dec } from './Knob';

const fmtDb = (v: number) => (Number.isFinite(v) ? `${dec(v, 1)} dB` : '∞');
const fmtMv = (v: number) => `${v > 0 ? '+' : ''}${dec(v, 3)} mV`;

type Column = { head: string; title: string; cell: (m: Metrics) => string };

const COMMON: Column[] = [
  { head: 'Retardo', title: 'Cuánto llega tarde la salida respecto de la señal limpia', cell: (m) => `${dec(m.delay * 1000, 0)} ms` },
  { head: 'SNR', title: 'Potencia de la señal sobre potencia de todo lo que la salida tiene de distinto, ya alineadas', cell: (m) => fmtDb(m.snr) },
  { head: 'Error eficaz', title: 'Valor eficaz de salida − señal limpia', cell: (m) => `${dec(m.errorRms * 1000, 0)} µV` },
];

const BY_SOURCE: Record<SourceKind, Column[]> = {
  ecg: [
    {
      head: 'Onda R',
      title: 'Altura de la onda R medida, en % de la real',
      cell: (m) => (m.kind === 'ecg' && Number.isFinite(m.rPercent) ? `${dec(m.rPercent, 0)} %` : '—'),
    },
    {
      head: 'ST medido / real',
      title: 'Desnivel del ST a 80 ms del R, respecto del segmento PR',
      cell: (m) => (m.kind === 'ecg' && m.beats ? `${fmtMv(m.stMeasured)} / ${fmtMv(m.stTrue)}` : '—'),
    },
  ],
  eog: [
    {
      head: 'Error de mirada',
      title: 'El error eficaz expresado en grados, con la sensibilidad del EOG',
      cell: (m) => (m.kind === 'eog' ? `${dec(m.angleError, 1)}°` : '—'),
    },
    {
      head: 'Salto visible a 1 s',
      title: 'Qué parte del cambio de mirada de cada sacada grande se sigue viendo 1 s después, durante la fijación',
      cell: (m) => (m.kind === 'eog' && m.steps ? `${dec(m.stepRetained, 0)} %` : '—'),
    },
  ],
};

// Qué tan fiel es cada rama, medido contra la señal limpia en los últimos
// 8 s, después de alinear la salida en su retardo.
export function MetricsTable({ engine, source }: { engine: BioEngine; source: SourceKind }) {
  const metrics = useMetrics(engine);
  const columns = [...COMMON, ...BY_SOURCE[source]];
  return (
    <div className="metrics">
      <table>
        <thead>
          <tr>
            <th>Rama</th>
            {columns.map((c) => (
              <th key={c.head} title={c.title}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BRANCHES.map((b) => {
            // Al cambiar de fuente, hasta la próxima medición queda la vieja.
            const m = metrics[b]?.kind === source ? metrics[b] : null;
            return (
              <tr key={b}>
                <td>
                  <span className={`branch-dot ${b}`} /> {b.toUpperCase()}
                </td>
                {columns.map((c) => (
                  <td key={c.head}>{m ? c.cell(m) : '—'}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
