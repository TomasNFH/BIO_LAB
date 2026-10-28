import { NOTCH_C, SHAPES, type FilterKind, type FilterSettings, type NotchSettings } from '../engine/filters';
import { dec } from '../components/Knob';
import { farads, ohms } from '../components/units';
import { Dot, OpAmp, Res } from './AmpSchematic';

// Capacitor: dos placas entre dos puntos (horizontal o vertical).
export function Cap({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  if (y1 === y2) {
    const m = (x1 + x2) / 2;
    return <path d={`M${x1} ${y1}H${m - 4}M${m - 4} ${y1 - 11}v22M${m + 4} ${y1 - 11}v22M${m + 4} ${y1}H${x2}`} />;
  }
  const m = (y1 + y2) / 2;
  return <path d={`M${x1} ${y1}V${m - 4}M${x1 - 11} ${m - 4}h22M${x1 - 11} ${m + 4}h22M${x1} ${m + 4}V${y2}`} />;
}

export const Ground = ({ x, y }: { x: number; y: number }) => (
  <path d={`M${x - 12} ${y}h24M${x - 8} ${y + 5}h16M${x - 3} ${y + 10}h6`} />
);

type Part = { type: 'R' | 'C'; name: string; value: number };
const fmtPart = (p: Part) => `${p.name} ${p.type === 'R' ? ohms(p.value) : farads(p.value)}`;

function Element({ part, x1, y1, x2, y2 }: { part: Part; x1: number; y1: number; x2: number; y2: number }) {
  return part.type === 'R' ? <Res x1={x1} y1={y1} x2={x2} y2={y2} /> : <Cap x1={x1} y1={y1} x2={x2} y2={y2} />;
}

// Esquema del pasa altos o pasa bajos con sus valores: un RC de primer
// orden o un Sallen-Key de segundo orden con ganancia 1.
export function FilterSchematic({ kind, settings }: { kind: FilterKind; settings: FilterSettings }) {
  const { r, c } = settings;
  if (settings.order === 1) {
    const series: Part = kind === 'hp' ? { type: 'C', name: 'C', value: c } : { type: 'R', name: 'R', value: r };
    const shunt: Part = kind === 'hp' ? { type: 'R', name: 'R', value: r } : { type: 'C', name: 'C', value: c };
    return (
      <svg className="schematic rc" viewBox="0 0 300 120" role="img" aria-label="Esquema del filtro RC">
        <text className="sch-label" x={4} y={34}>Ent.</text>
        <text className="sch-label" x={258} y={34}>Sal.</text>
        <path d="M40 30H80M200 30H252M200 30V44" />
        <Element part={series} x1={80} y1={30} x2={200} y2={30} />
        <Dot x={200} y={30} />
        <Element part={shunt} x1={200} y1={44} x2={200} y2={94} />
        <Ground x={200} y={94} />
        <text className="sch-value" x={102} y={14}>{fmtPart(series)}</text>
        <text className="sch-value" x={214} y={74}>{fmtPart(shunt)}</text>
      </svg>
    );
  }
  // Sallen-Key con ganancia 1: el par en serie y el par de realimentación
  // y masa se separan para dar el Q: en el pasa bajos C1 = 2Q·C y
  // C2 = C/(2Q); en el pasa altos R1 = R/(2Q) y R2 = 2Q·R.
  const q = SHAPES[settings.shape].q;
  const [e1, e2, fb, gnd]: Part[] =
    kind === 'lp'
      ? [
          { type: 'R', name: 'R1', value: r },
          { type: 'R', name: 'R2', value: r },
          { type: 'C', name: 'C1', value: 2 * q * c },
          { type: 'C', name: 'C2', value: c / (2 * q) },
        ]
      : [
          { type: 'C', name: 'C1', value: c },
          { type: 'C', name: 'C2', value: c },
          { type: 'R', name: 'R1', value: r / (2 * q) },
          { type: 'R', name: 'R2', value: 2 * q * r },
        ];
  return (
    <svg className="schematic sk" viewBox="0 0 340 160" role="img" aria-label="Esquema del filtro Sallen-Key">
      <text className="sch-label" x={4} y={74}>Ent.</text>
      <text className="sch-label" x={300} y={78}>Sal.</text>
      <path d="M36 70H46M110 70V30H150M220 30H290V85M174 70H230M220 100H210V132H290V85M290 85H298M174 70V84" />
      <Element part={e1} x1={46} y1={70} x2={110} y2={70} />
      <Element part={e2} x1={110} y1={70} x2={174} y2={70} />
      <Element part={fb} x1={150} y1={30} x2={220} y2={30} />
      <Element part={gnd} x1={174} y1={84} x2={174} y2={124} />
      <Ground x={174} y={124} />
      <OpAmp x={230} y={85} topPlus label="" />
      <path d="M220 100H230" />
      <Dot x={110} y={70} />
      <Dot x={174} y={70} />
      <Dot x={290} y={85} />
      <text className="sch-value" x={46} y={54}>{fmtPart(e1)}</text>
      <text className="sch-value" x={116} y={92}>{fmtPart(e2)}</text>
      <text className="sch-value" x={150} y={14}>{fmtPart(fb)}</text>
      <text className="sch-value" x={186} y={148}>{fmtPart(gnd)}</text>
    </svg>
  );
}

// Doble T activa: dos redes en T en paralelo (R, R, 2C arriba y C, C, R/2
// abajo) cancelan exactamente f0 = 1/(2π·R·C). Las patas del medio no van
// a masa sino a una fracción k de la salida: cuanto más cerca de 1, más
// angosta la muesca (Q = 1 / (4·(1 − k))). Con k = 0 es la doble T pasiva,
// de Q = 0,25.
export function NotchSchematic({ settings }: { settings: NotchSettings }) {
  const c = NOTCH_C;
  const r = 1 / (2 * Math.PI * settings.f0 * c);
  const k = Math.max(0, 1 - 1 / (4 * settings.q));
  return (
    <svg className="schematic notch" viewBox="0 0 340 180" role="img" aria-label="Esquema del notch doble T">
      <text className="sch-label" x={4} y={44}>Ent.</text>
      <text className="sch-label" x={300} y={34}>Sal.</text>
      {/* T de arriba: R, R y 2C al medio */}
      <path d="M36 40H60M60 40V150M220 40H330M220 40V150M140 40V50M140 150V140" />
      <Res x1={60} y1={40} x2={140} y2={40} />
      <Res x1={140} y1={40} x2={220} y2={40} />
      <Cap x1={140} y1={50} x2={140} y2={95} />
      {/* T de abajo: C, C y R/2 al medio */}
      <Cap x1={60} y1={150} x2={140} y2={150} />
      <Cap x1={140} y1={150} x2={220} y2={150} />
      <Res x1={140} y1={140} x2={140} y2={95} />
      <Dot x={60} y={40} />
      <Dot x={140} y={40} />
      <Dot x={220} y={40} />
      <Dot x={140} y={150} />
      <Dot x={140} y={95} />
      {/* Realimentación: un buffer de ganancia k desde la salida */}
      <path d="M140 95H268M310 40V95H300M300 80L300 110L268 95Z" />
      <Dot x={310} y={40} />
      <text className="sch-small" x={281} y={99}>k</text>
      <text className="sch-value" x={72} y={26}>R {ohms(r)}</text>
      <text className="sch-value" x={152} y={26}>R {ohms(r)}</text>
      <text className="sch-value" x={150} y={78}>2C {farads(2 * c)}</text>
      <text className="sch-value" x={150} y={124}>R/2 {ohms(r / 2)}</text>
      <text className="sch-value" x={72} y={176}>C {farads(c)}</text>
      <text className="sch-value" x={152} y={176}>C {farads(c)}</text>
      <text className="sch-value" x={232} y={128}>k = {dec(k, 3)}</text>
    </svg>
  );
}
