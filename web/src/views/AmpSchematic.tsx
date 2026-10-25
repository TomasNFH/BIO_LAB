import { R1, R2, type AmpSettings } from '../engine/amp';
import { ohms } from '../components/units';

// Resistencia como rectángulo entre dos puntos (horizontal o vertical).
export function Res({ x1, y1, x2, y2, hot }: { x1: number; y1: number; x2: number; y2: number; hot?: boolean }) {
  const horizontal = y1 === y2;
  const len = horizontal ? x2 - x1 : y2 - y1;
  const body = 34;
  const pad = (len - body) / 2;
  return (
    <g className={hot ? 'sch-hot' : undefined}>
      {horizontal ? (
        <>
          <path d={`M${x1} ${y1}h${pad}M${x2} ${y2}h${-pad}`} />
          <rect x={x1 + pad} y={y1 - 6} width={body} height={12} rx={2} />
        </>
      ) : (
        <>
          <path d={`M${x1} ${y1}v${pad}M${x2} ${y2}v${-pad}`} />
          <rect x={x1 - 6} y={y1 + pad} width={12} height={body} rx={2} />
        </>
      )}
    </g>
  );
}

// Op-amp: triángulo con la entrada superior en (x, y-15) y la inferior en
// (x, y+15); salida en (x+60, y).
export function OpAmp({ x, y, topPlus, label }: { x: number; y: number; topPlus: boolean; label: string }) {
  return (
    <g>
      <path d={`M${x} ${y - 30}L${x} ${y + 30}L${x + 60} ${y}Z`} />
      <text className="sch-pin" x={x + 5} y={y - 11}>{topPlus ? '+' : '−'}</text>
      <text className="sch-pin" x={x + 5} y={y + 19}>{topPlus ? '−' : '+'}</text>
      <text className="sch-small" x={x + 18} y={y + 4}>{label}</text>
    </g>
  );
}

export const Dot = ({ x, y }: { x: number; y: number }) => <circle className="sch-dot" cx={x} cy={y} r={2.6} />;

// Esquema del amplificador de instrumentación de tres op-amps con los
// valores actuales. Rg (la perilla de ganancia) va resaltada.
export function AmpSchematic({ settings }: { settings: AmpSettings }) {
  const r3 = settings.g2 * R2;
  const r3p = r3 * (1 + settings.tolerance);
  return (
    <svg className="schematic" viewBox="0 0 520 280" role="img" aria-label="Esquema del amplificador de instrumentación">
      {/* Recuadros de las dos etapas */}
      <rect className="sch-stage" x={36} y={8} width={196} height={252} rx={8} />
      <text className="sch-small sch-muted" x={44} y={24}>Etapa 1</text>
      <rect className="sch-stage" x={240} y={8} width={232} height={262} rx={8} />
      <text className="sch-small sch-muted" x={248} y={24}>Etapa 2</text>

      {/* Entradas */}
      <text className="sch-label" x={2} y={49}>V−</text>
      <text className="sch-label" x={2} y={219}>V+</text>
      <path d="M22 45H100M22 215H100" />

      {/* Etapa 1: V− arriba (va a la entrada inversora de A3) y V+ abajo (a la
          no inversora); Rg entre las entradas inversoras de A1 y A2. */}
      <OpAmp x={100} y={60} topPlus label="A2" />
      <OpAmp x={100} y={200} topPlus={false} label="A1" />
      <path d="M100 75H80V100M100 185H80V160" />
      <Res x1={80} y1={100} x2={80} y2={160} hot />
      <text className="sch-label sch-accent" x={94} y={127}>Rg</text>
      <text className="sch-value sch-accent" x={94} y={145}>{ohms(settings.rg)}</text>
      <Dot x={80} y={100} />
      <Dot x={80} y={160} />
      {/* R1 de realimentación, de cada nodo a su salida */}
      <path d="M80 100H110M80 160H110" />
      <Res x1={110} y1={100} x2={190} y2={100} />
      <Res x1={110} y1={160} x2={190} y2={160} />
      <path d="M190 100H205V60M190 160H205V200M160 60H262M160 200H262" />
      <Dot x={205} y={60} />
      <Dot x={205} y={200} />
      <text className="sch-value" x={150} y={90}>R1 {ohms(R1)}</text>
      <text className="sch-value" x={150} y={180}>R1 {ohms(R1)}</text>

      {/* Etapa 2: resta con R2, R3 y R3' */}
      <Res x1={262} y1={60} x2={322} y2={60} />
      <Res x1={262} y1={200} x2={322} y2={200} />
      <text className="sch-value" x={258} y={46}>R2 {ohms(R2)}</text>
      <text className="sch-value" x={258} y={188}>R2 {ohms(R2)}</text>
      <path d="M322 60H340V115H372M322 200H340V145H372" />
      <Dot x={340} y={60} />
      <Dot x={340} y={200} />
      <OpAmp x={372} y={130} topPlus={false} label="A3" />
      {/* R3 de realimentación y R3' a masa */}
      <path d="M340 60H370" />
      <Res x1={370} y1={60} x2={440} y2={60} />
      <path d="M440 60H452V130M432 130H500" />
      <Dot x={452} y={130} />
      <text className="sch-value" x={366} y={46}>R3 {ohms(r3)}</text>
      <path d="M340 200V212" />
      <Res x1={340} y1={212} x2={340} y2={250} />
      <path d="M340 250V256M328 256H352M332 261H348M337 266H343" />
      <text className="sch-value" x={352} y={236}>R3' {ohms(r3p)}</text>
      <text className="sch-label" x={480} y={122}>Vo</text>
    </svg>
  );
}
