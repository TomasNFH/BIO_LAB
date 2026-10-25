import { useEffect, useState } from 'react';
import type { BioEngine } from '../engine/BioEngine';
import { BRANCHES, type Branch } from '../engine/chain';
import { measure, type Metrics } from '../engine/metrics';
import { dec } from './Knob';

const fmtDb = (v: number) => (Number.isFinite(v) ? `${dec(v, 1)} dB` : '∞');
const fmtMv = (v: number) => `${v > 0 ? '+' : ''}${dec(v, 3)} mV`;

// Qué tan fiel es cada rama, medido contra el ECG limpio en los últimos 8 s,
// después de alinear la salida en su retardo.
export function MetricsTable({ engine }: { engine: BioEngine }) {
  const metrics = useMetrics(engine);
  return (
    <div className="metrics">
      <table>
        <thead>
          <tr>
            <th>Rama</th>
            <th title="Cuánto llega tarde la salida respecto del ECG limpio">Retardo</th>
            <th title="Potencia del ECG sobre potencia de todo lo que la salida tiene de distinto, ya alineadas">SNR</th>
            <th title="Valor eficaz de salida − ECG limpio">Error eficaz</th>
            <th title="Altura de la onda R medida, en % de la real">Onda R</th>
            <th title="Desnivel del ST a 80 ms del R, respecto del segmento PR">ST medido / real</th>
          </tr>
        </thead>
        <tbody>
          {BRANCHES.map((b) => {
            const m = metrics[b];
            return (
              <tr key={b} className={`branch-${b}`}>
                <td>
                  <span className={`branch-dot ${b}`} /> {b.toUpperCase()}
                </td>
                <td>{m ? `${dec(m.delay * 1000, 0)} ms` : '—'}</td>
                <td>{m ? fmtDb(m.snr) : '—'}</td>
                <td>{m ? `${dec(m.errorRms * 1000, 0)} µV` : '—'}</td>
                <td>{m && Number.isFinite(m.rPercent) ? `${dec(m.rPercent, 0)} %` : '—'}</td>
                <td>{m && m.beats ? `${fmtMv(m.stMeasured)} / ${fmtMv(m.stTrue)}` : '—'}</td>
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
