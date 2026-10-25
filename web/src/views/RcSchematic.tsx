import type { RcKind, RcSettings } from '../engine/filters';
import { farads, ohms } from '../components/units';
import { Res } from './AmpSchematic';

// Capacitor: dos placas entre dos puntos (horizontal o vertical).
function Cap({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  if (y1 === y2) {
    const m = (x1 + x2) / 2;
    return <path d={`M${x1} ${y1}H${m - 4}M${m - 4} ${y1 - 11}v22M${m + 4} ${y1 - 11}v22M${m + 4} ${y1}H${x2}`} />;
  }
  const m = (y1 + y2) / 2;
  return <path d={`M${x1} ${y1}V${m - 4}M${x1 - 11} ${m - 4}h22M${x1 - 11} ${m + 4}h22M${x1} ${m + 4}V${y2}`} />;
}

const Ground = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 12} ${y}h24M${x - 8} ${y + 5}h16M${x - 3} ${y + 10}h6`} />
);

// Esquema del filtro RC: el pasa altos tiene el C en serie y la R a masa;
// el pasa bajos, al revés.
export function RcSchematic({ kind, settings }: { kind: RcKind; settings: RcSettings }) {
  const series = kind === 'hp' ? 'C' : 'R';
  return (
    <svg className="schematic rc" viewBox="0 0 300 120" role="img" aria-label={`Esquema del filtro ${kind === 'hp' ? 'pasa altos' : 'pasa bajos'}`}>
      <text className="sch-label" x={4} y={34}>Ent.</text>
      <text className="sch-label" x={258} y={34}>Sal.</text>
      <path d="M40 30H80M200 30H252" />
      {kind === 'hp' ? <Cap x1={80} y1={30} x2={200} y2={30} /> : <Res x1={80} y1={30} x2={200} y2={30} />}
      <circle className="sch-dot" cx={200} cy={30} r={2.6} />
      <path d="M200 30V44" />
      {kind === 'hp' ? <Res x1={200} y1={44} x2={200} y2={94} /> : <Cap x1={200} y1={44} x2={200} y2={94} />}
      <Ground x={200} y={94} />
      <text className="sch-value" x={102} y={14}>
        {series} {series === 'C' ? farads(settings.c) : ohms(settings.r)}
      </text>
      <text className="sch-value" x={214} y={74}>
        {series === 'C' ? `R ${ohms(settings.r)}` : `C ${farads(settings.c)}`}
      </text>
    </svg>
  );
}
