import { useState, type ReactNode } from 'react';
import { Derive, Eq, Example, F, M, Note, Sqrt, jw, wRC, x } from './theory/notation';
import { dec } from '../components/Knob';
import { farads, hz, ohms, seconds } from '../components/units';
import { Dot, OpAmp, Res } from './AmpSchematic';
import { Cap, Ground } from './FilterSchematic';
import { AcSource, Box, Diode, Rail } from './theory/symbols';
import { TransistorSection } from './theory/transistors';

// Página de fundamentos teóricos: filtros RC, diodos, transistores y amplificadores
// operacionales, con las deducciones paso a paso y gráficos calculados.

// ---------- Gráficos ----------

type Pt = [number, number];
const pathOf = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// Ejes de un gráfico: marco, grilla y etiquetas. Devuelve las funciones que
// llevan del dominio a píxeles.
type Axes = {
  w: number;
  h: number;
  x: [number, number];
  y: [number, number];
  xTicks: { v: number; label: string }[];
  yTicks: { v: number; label: string }[];
  xLabel: string;
  yLabel: string;
};
const PAD = { l: 50, r: 12, t: 12, b: 34 };
function scales(a: Axes) {
  const sx = (v: number) => PAD.l + ((v - a.x[0]) / (a.x[1] - a.x[0])) * (a.w - PAD.l - PAD.r);
  const sy = (v: number) => a.h - PAD.b - ((v - a.y[0]) / (a.y[1] - a.y[0])) * (a.h - PAD.t - PAD.b);
  return { sx, sy };
}
function Plot({ axes, label, children }: { axes: Axes; label: string; children: (sx: (v: number) => number, sy: (v: number) => number) => ReactNode }) {
  const { sx, sy } = scales(axes);
  const { w, h } = axes;
  return (
    <svg className="th-plot" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      {axes.xTicks.map((t, i) => (
        <g key={`x${t.v}`}>
          <path className="grid" d={`M${sx(t.v)} ${PAD.t}V${h - PAD.b}`} />
          {/* La última etiqueta se alinea a la derecha para que no se corte. */}
          <text className="tick" x={sx(t.v)} y={h - PAD.b + 14} textAnchor={i === axes.xTicks.length - 1 ? 'end' : 'middle'}>
            {t.label}
          </text>
        </g>
      ))}
      {axes.yTicks.map((t) => (
        <g key={`y${t.v}`}>
          <path className="grid" d={`M${PAD.l} ${sy(t.v)}H${w - PAD.r}`} />
          <text className="tick" x={PAD.l - 5} y={sy(t.v) + 4} textAnchor="end">
            {t.label}
          </text>
        </g>
      ))}
      <rect className="frame" x={PAD.l} y={PAD.t} width={w - PAD.l - PAD.r} height={h - PAD.t - PAD.b} />
      <text className="axis" x={(PAD.l + w - PAD.r) / 2} y={h - 4} textAnchor="middle">
        {axes.xLabel}
      </text>
      <text className="axis" transform={`translate(12 ${(PAD.t + h - PAD.b) / 2}) rotate(-90)`} textAnchor="middle">
        {axes.yLabel}
      </text>
      {children(sx, sy)}
    </svg>
  );
}

const DECADES = [-2, -1, 0, 1, 2];
const fTicks = (fc: number) => DECADES.map((u) => ({ v: u, label: hz(fc * 10 ** u) }));

// Bode del RC de primer orden: módulo o fase, pasa bajos y pasa altos, con
// las asíntotas. El eje x es log10(f/fc).
function RcBode({ fc, part }: { fc: number; part: 'mag' | 'phase' }) {
  const us = range(-2, 2, 200);
  const mag = part === 'mag';
  const axes: Axes = {
    w: 520,
    h: mag ? 210 : 170,
    x: [-2, 2],
    y: mag ? [-45, 5] : [-90, 90],
    xTicks: fTicks(fc),
    yTicks: mag
      ? [0, -10, -20, -30, -40].map((v) => ({ v, label: `${v === 0 ? '0' : '−' + -v} dB` }))
      : [90, 45, 0, -45, -90].map((v) => ({ v, label: `${v < 0 ? '−' + -v : v}°` })),
    xLabel: 'Frecuencia',
    yLabel: mag ? 'Módulo' : 'Fase',
  };
  const lp = (u: number) => (mag ? -10 * Math.log10(1 + 10 ** (2 * u)) : (-Math.atan(10 ** u) * 180) / Math.PI);
  const hp = (u: number) => (mag ? 20 * u + lp(u) : 90 + lp(u));
  return (
    <Plot axes={axes} label={mag ? 'Módulo de la respuesta en frecuencia del RC' : 'Fase de la respuesta en frecuencia del RC'}>
      {(sx, sy) => {
        const clip = (v: number) => Math.max(axes.y[0], v);
        return (
          <>
            {mag && (
              <>
                <path className="mark" d={`M${sx(-2)} ${sy(-3)}H${sx(2)}`} />
                <text className="tick mark-label" x={sx(-2) + 4} y={sy(-3) + 13}>
                  −3 dB
                </text>
                <path className="asym lp" d={pathOf([[sx(-2), sy(0)], [sx(0), sy(0)], [sx(2), sy(-40)]])} />
                <path className="asym hp" d={pathOf([[sx(-2), sy(-40)], [sx(0), sy(0)], [sx(2), sy(0)]])} />
              </>
            )}
            <path className="mark" d={`M${sx(0)} ${PAD.t}V${axes.h - PAD.b}`} />
            <path className="curve lp" d={pathOf(us.map((u) => [sx(u), sy(clip(lp(u)))]))} />
            <path className="curve hp" d={pathOf(us.map((u) => [sx(u), sy(clip(hp(u)))]))} />
            <circle className="pt lp" cx={sx(0)} cy={sy(mag ? -3.01 : -45)} r={3.5} />
            <circle className="pt hp" cx={sx(0)} cy={sy(mag ? -3.01 : 45)} r={3.5} />
          </>
        );
      }}
    </Plot>
  );
}

// Respuesta al escalón del RC: carga (pasa bajos) y descarga (pasa altos).
function RcStep({ tau }: { tau: number }) {
  const ts = range(0, 5, 150);
  const axes: Axes = {
    w: 520,
    h: 200,
    x: [0, 5],
    y: [0, 1],
    xTicks: [0, 1, 2, 3, 4, 5].map((k) => ({ v: k, label: k === 0 ? '0' : `${k}τ` })),
    yTicks: [0, 0.368, 0.632, 1].map((v) => ({ v, label: v === 0 || v === 1 ? String(v) : dec(v, 2) })),
    xLabel: `Tiempo desde el escalón (τ = ${seconds(tau)})`,
    yLabel: 'vo / Vi',
  };
  return (
    <Plot axes={axes} label="Respuesta al escalón del RC">
      {(sx, sy) => (
        <>
          <path className="mark" d={`M${sx(1)} ${sy(0)}V${sy(1)}`} />
          <path className="curve lp" d={pathOf(ts.map((t) => [sx(t), sy(1 - Math.exp(-t))]))} />
          <path className="curve hp" d={pathOf(ts.map((t) => [sx(t), sy(Math.exp(-t))]))} />
          <circle className="pt lp" cx={sx(1)} cy={sy(0.632)} r={3.5} />
          <circle className="pt hp" cx={sx(1)} cy={sy(0.368)} r={3.5} />
        </>
      )}
    </Plot>
  );
}

const Legend = () => (
  <div className="row view-options th-legend">
    <span className="legend">
      <span className="swatch lp" /> Pasa bajos
    </span>
    <span className="legend">
      <span className="swatch hp" /> Pasa altos
    </span>
    <span className="legend">
      <span className="swatch lp dashed" /> Asíntotas
    </span>
  </div>
);

// Curva corriente–tensión del diodo: la exponencial de Shockley y los dos
// modelos simples (ideal y caída constante).
const IS = 2.5e-9; // A, del orden de un 1N4148
const N = 1.75;
const VT = 0.02585; // V a 300 K
function DiodeIV() {
  const vs = range(-0.4, 0.9, 400);
  const axes: Axes = {
    w: 520,
    h: 230,
    x: [-0.4, 0.9],
    y: [-2, 20],
    xTicks: [-0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8].map((v) => ({ v, label: `${v < 0 ? '−' + dec(-v) : dec(v)} V` })),
    yTicks: [0, 5, 10, 15, 20].map((v) => ({ v, label: `${v} mA` })),
    xLabel: 'Tensión en el diodo VD',
    yLabel: 'Corriente ID',
  };
  return (
    <Plot axes={axes} label="Curva corriente–tensión del diodo">
      {(sx, sy) => {
        const pts: Pt[] = [];
        for (const v of vs) {
          const i = IS * (Math.exp(v / (N * VT)) - 1) * 1000;
          if (i > 20) break;
          pts.push([sx(v), sy(i)]);
        }
        return (
          <>
            <path className="mark" d={`M${sx(0)} ${PAD.t}V${axes.h - PAD.b}M${PAD.l} ${sy(0)}H${axes.w - PAD.r}`} />
            <path className="asym ideal" d={`M${sx(-0.4)} ${sy(0)}H${sx(0)}V${sy(20)}`} />
            <path className="asym drop" d={`M${sx(-0.4)} ${sy(0)}H${sx(0.7)}V${sy(20)}`} />
            <path className="curve diode" d={pathOf(pts)} />
          </>
        );
      }}
    </Plot>
  );
}

// ---------- Esquemas ----------

// Con `values` (p. ej. ['R 10 kΩ', 'C 100 nF']) se rotulan los elementos
// en serie y a masa; con `out`, la salida.
function RcSchematic({ kind, values, out = 'vo' }: { kind: 'lp' | 'hp'; values?: [string, string]; out?: string }) {
  const series = kind === 'lp' ? 'R' : 'C';
  const shunt = kind === 'lp' ? 'C' : 'R';
  const [seriesLabel, shuntLabel] = values ?? [series, shunt];
  const El = ({ t, ...p }: { t: string; x1: number; y1: number; x2: number; y2: number }) => (t === 'R' ? <Res {...p} /> : <Cap {...p} />);
  return (
    <svg className="schematic th-sch" viewBox="0 0 275 120" role="img" aria-label={kind === 'lp' ? 'Esquema del pasa bajos RC' : 'Esquema del pasa altos RC'}>
      <text className="sch-label" x={4} y={35}>
        vi
      </text>
      <text className="sch-label" x={232} y={35}>
        {out}
      </text>
      <path d="M28 30H60M170 30H226M170 30V44" />
      <El t={series} x1={60} y1={30} x2={150} y2={30} />
      <path d="M150 30H170" />
      <Dot x={170} y={30} />
      <El t={shunt} x1={170} y1={44} x2={170} y2={94} />
      <Ground x={170} y={94} />
      <text className="sch-value" x={105} y={16} textAnchor="middle">
        {seriesLabel}
      </text>
      <text className="sch-value" x={186} y={74}>
        {shuntLabel}
      </text>
    </svg>
  );
}

function DiodeSymbol() {
  return (
    <svg className="schematic th-sch small" viewBox="0 0 220 60" role="img" aria-label="Símbolo del diodo">
      <path d="M20 30H90M130 30H200M90 12V48L130 30ZM130 12V48" />
      <text className="sch-value" x={14} y={20}>
        ánodo
      </text>
      <text className="sch-value" x={152} y={20}>
        cátodo
      </text>
      <text className="sch-small sch-muted" x={92} y={58}>
        ID →
      </text>
    </svg>
  );
}

function InvertingSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 290 140" role="img" aria-label="Esquema del amplificador inversor">
      <text className="sch-label" x={4} y={70}>
        vi
      </text>
      <path d="M26 65H40M100 65H160M130 65V30M130 30H160M230 30H250V80M220 80H280M160 95H140V108" />
      <Res x1={40} y1={65} x2={100} y2={65} />
      <Res x1={160} y1={30} x2={230} y2={30} />
      <Dot x={130} y={65} />
      <Dot x={250} y={80} />
      <Ground x={140} y={108} />
      <OpAmp x={160} y={80} topPlus={false} label="" />
      <text className="sch-value" x={58} y={52}>
        R1
      </text>
      <text className="sch-value" x={186} y={18}>
        R2
      </text>
      <text className="sch-label" x={262} y={72}>
        vo
      </text>
    </svg>
  );
}

function NonInvertingSchematic({ r1 = 'R1', r2 = 'R2' }: { r1?: string; r2?: string }) {
  return (
    <svg className="schematic th-sch" viewBox="0 0 290 190" role="img" aria-label="Esquema del amplificador no inversor">
      <text className="sch-label" x={4} y={70}>
        vi
      </text>
      <path d="M26 65H160M160 95H130V130M220 80H280M250 80V130M130 130H140M230 130H250" />
      <Res x1={140} y1={130} x2={230} y2={130} />
      <Res x1={130} y1={130} x2={130} y2={175} />
      <Ground x={130} y={175} />
      <Dot x={130} y={130} />
      <Dot x={250} y={80} />
      <OpAmp x={160} y={80} topPlus label="" />
      <text className="sch-value" x={185} y={118} textAnchor="middle">
        {r2}
      </text>
      <text className="sch-value" x={140} y={158}>
        {r1}
      </text>
      <text className="sch-label" x={262} y={72}>
        vo
      </text>
    </svg>
  );
}

function FollowerSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 290 140" role="img" aria-label="Esquema del seguidor de tensión">
      <text className="sch-label" x={4} y={70}>
        vi
      </text>
      <path d="M26 65H160M160 95H140V120H250V80M220 80H280" />
      <Dot x={250} y={80} />
      <OpAmp x={160} y={80} topPlus label="" />
      <text className="sch-label" x={262} y={72}>
        vo
      </text>
    </svg>
  );
}

// ---------- Esquemas de los ejemplos ----------

function BandpassSchematic() {
  return (
    <svg className="schematic th-sch wide" viewBox="0 0 450 140" role="img" aria-label="Pasa banda: pasa altos, seguidor y pasa bajos">
      <text className="sch-label" x={4} y={35}>
        vi
      </text>
      <path d="M26 30H50M110 30H170M130 30V44M170 60H158V84H245V45M230 45H270M340 45H400M360 45V59" />
      <Cap x1={50} y1={30} x2={110} y2={30} />
      <Dot x={130} y={30} />
      <Res x1={130} y1={44} x2={130} y2={100} />
      <Ground x={130} y={100} />
      <OpAmp x={170} y={45} topPlus label="" />
      <Dot x={245} y={45} />
      <Res x1={270} y1={45} x2={340} y2={45} />
      <Dot x={360} y={45} />
      <Cap x1={360} y1={59} x2={360} y2={105} />
      <Ground x={360} y={105} />
      <text className="sch-label" x={406} y={50}>
        vo
      </text>
      <text className="sch-value" x={80} y={14} textAnchor="middle">
        C1 1 µF
      </text>
      <text className="sch-value" x={122} y={76} textAnchor="end">
        R1 330 kΩ
      </text>
      <text className="sch-value" x={305} y={30} textAnchor="middle">
        R2 39 kΩ
      </text>
      <text className="sch-value" x={376} y={88}>
        C2 100 nF
      </text>
      <text className="sch-small sch-muted" x={80} y={130} textAnchor="middle">
        pasa altos
      </text>
      <text className="sch-small sch-muted" x={205} y={110} textAnchor="middle">
        seguidor
      </text>
      <text className="sch-small sch-muted" x={320} y={130} textAnchor="middle">
        pasa bajos
      </text>
    </svg>
  );
}

function ResetSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 230 165" role="img" aria-label="Retardo de encendido RC">
      <Rail x={60} y={22} label="+5 V" />
      <Res x1={60} y1={22} x2={60} y2={80} />
      <path d="M60 80V95H140" />
      <Dot x={60} y={95} />
      <Cap x1={60} y1={95} x2={60} y2={140} />
      <Ground x={60} y={140} />
      <Box x={140} y={95} w={74} label="RESET" />
      <text className="sch-value" x={74} y={56}>
        R 100 kΩ
      </text>
      <text className="sch-value" x={78} y={124}>
        C 10 µF
      </text>
    </svg>
  );
}

function LedSchematic() {
  return (
    <svg className="schematic th-sch narrow" viewBox="0 0 200 170" role="img" aria-label="LED con resistencia limitadora">
      <Rail x={60} y={22} label="+5 V" />
      <Res x1={60} y1={22} x2={60} y2={80} />
      <Diode a={[60, 80]} c={[60, 136]} led />
      <Ground x={60} y={136} />
      <text className="sch-value" x={74} y={56}>
        R 330 Ω
      </text>
      <text className="sch-value" x={88} y={112}>
        LED rojo
      </text>
    </svg>
  );
}

function RectifierSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 300 160" role="img" aria-label="Rectificador de media onda con filtro">
      <AcSource x={30} y={75} />
      <path d="M30 62V30H80M30 88V120H240M150 30H260" />
      <Diode a={[80, 30]} c={[150, 30]} />
      <Dot x={180} y={30} />
      <Dot x={240} y={30} />
      <Dot x={180} y={120} />
      <Cap x1={180} y1={30} x2={180} y2={120} />
      <Res x1={240} y1={30} x2={240} y2={120} />
      <Ground x={110} y={120} />
      <Dot x={110} y={120} />
      <text className="sch-label" x={266} y={35}>
        vo
      </text>
      <text className="sch-value" x={115} y={16} textAnchor="middle">
        D
      </text>
      <text className="sch-value" x={190} y={70}>
        C
      </text>
      <text className="sch-value" x={250} y={80}>
        RL
      </text>
      <text className="sch-value" x={48} y={66}>
        12 V
      </text>
      <text className="sch-value" x={48} y={82}>
        50 Hz
      </text>
    </svg>
  );
}

function ProtectionSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 330 175" role="img" aria-label="Protección de entrada con diodos">
      <text className="sch-label" x={4} y={85}>
        electrodo
      </text>
      <path d="M84 80H90M150 80H230M230 110H220V140H300V95M290 95H320" />
      <Res x1={90} y1={80} x2={150} y2={80} />
      <Dot x={180} y={80} />
      <Diode a={[180, 80]} c={[180, 30]} />
      <Rail x={180} y={30} label="+V" />
      <Diode a={[180, 136]} c={[180, 80]} />
      <Rail x={180} y={136} label="−V" below />
      <OpAmp x={230} y={95} topPlus label="" />
      <Dot x={300} y={95} />
      <text className="sch-value" x={120} y={66} textAnchor="middle">
        R 100 kΩ
      </text>
      <text className="sch-value" x={192} y={58}>
        D1
      </text>
      <text className="sch-value" x={192} y={114}>
        D2
      </text>
    </svg>
  );
}

function LevelShiftSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 320 200" role="img" aria-label="Desplazador de nivel para el ADC">
      <text className="sch-label" x={4} y={70}>
        vi
      </text>
      <Rail x={130} y={22} label="Vref = 1,65 V" />
      <Res x1={130} y1={22} x2={130} y2={65} />
      <path d="M26 65H40M110 65H190M190 95H165V130M250 80H300M275 80V130" />
      <Res x1={40} y1={65} x2={110} y2={65} />
      <Dot x={130} y={65} />
      <OpAmp x={190} y={80} topPlus label="" />
      <Res x1={165} y1={130} x2={275} y2={130} />
      <Dot x={165} y={130} />
      <Dot x={275} y={80} />
      <Res x1={165} y1={130} x2={165} y2={180} />
      <Ground x={165} y={180} />
      <text className="sch-value" x={75} y={52} textAnchor="middle">
        R
      </text>
      <text className="sch-value" x={142} y={48}>
        R
      </text>
      <text className="sch-value" x={220} y={118} textAnchor="middle">
        R
      </text>
      <text className="sch-value" x={153} y={160} textAnchor="end">
        R
      </text>
      <text className="sch-label" x={282} y={72}>
        vo
      </text>
    </svg>
  );
}

function ActiveLpSchematic() {
  return (
    <svg className="schematic th-sch" viewBox="0 0 300 170" role="img" aria-label="Pasa bajos activo inversor">
      <text className="sch-label" x={4} y={100}>
        vi
      </text>
      <path d="M26 95H40M100 95H160M130 95V24H160M130 60H160M230 24H250V110M230 60H250M220 110H285M160 125H140V138" />
      <Res x1={40} y1={95} x2={100} y2={95} />
      <Cap x1={160} y1={24} x2={230} y2={24} />
      <Res x1={160} y1={60} x2={230} y2={60} />
      <Dot x={130} y={95} />
      <Dot x={130} y={60} />
      <Dot x={250} y={60} />
      <Dot x={250} y={110} />
      <OpAmp x={160} y={110} topPlus={false} label="" />
      <Ground x={140} y={138} />
      <text className="sch-value" x={70} y={82} textAnchor="middle">
        R1 10 kΩ
      </text>
      <text className="sch-value" x={195} y={50} textAnchor="middle">
        R2 100 kΩ
      </text>
      <text className="sch-value" x={124} y={20} textAnchor="end">
        C 39 nF
      </text>
      <text className="sch-label" x={262} y={102}>
        vo
      </text>
    </svg>
  );
}

// ---------- Calculadoras ----------

// Redondea a dos cifras significativas (los valores comerciales no son
// continuos y así los números quedan legibles).
const snap = (v: number) => {
  const p = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
};
function LogSlider({ label, min, max, value, onChange, format }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void; format: (v: number) => string }) {
  const lo = Math.log10(min);
  const hi = Math.log10(max);
  return (
    <label className="th-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(((Math.log10(value) - lo) / (hi - lo)) * 1000)}
        onChange={(e) => onChange(snap(10 ** (lo + ((hi - lo) * Number(e.target.value)) / 1000)))}
      />
      <output>{format(value)}</output>
    </label>
  );
}

function RcCalculator() {
  const [r, setR] = useState(1e6);
  const [c, setC] = useState(330e-9);
  const tau = r * c;
  const fc = 1 / (2 * Math.PI * tau);
  return (
    <div className="th-calc">
      <div className="th-calc-head">Probalo: elegí R y C</div>
      <div className="th-calc-inputs">
        <LogSlider label="R" min={100} max={10e6} value={r} onChange={setR} format={ohms} />
        <LogSlider label="C" min={1e-9} max={10e-6} value={c} onChange={setC} format={farads} />
      </div>
      <dl className="readouts th-readouts">
        <div>
          <dt>τ = RC</dt>
          <dd>{seconds(tau)}</dd>
        </div>
        <div>
          <dt>fc = 1/(2πRC)</dt>
          <dd>{hz(fc)}</dd>
        </div>
      </dl>
      <RcBode fc={fc} part="mag" />
      <RcBode fc={fc} part="phase" />
      <Legend />
      <RcStep tau={tau} />
    </div>
  );
}

// Valores típicos de hoja de datos (aproximados, a 25 °C y ±15 V).
const OPAMPS = {
  '741': { a0: 2e5, gbw: 1e6, sr: 0.5, vos: 1e-3 },
  TL072: { a0: 2e5, gbw: 3e6, sr: 13, vos: 3e-3 },
  OPA2188: { a0: 6e6, gbw: 2e6, sr: 0.8, vos: 6e-6 },
};
const sig = (v: number, digits = 3) => {
  if (v >= 10 ** digits) return Math.round(v).toLocaleString('es-AR');
  return dec(v, Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(v)))));
};
// hz() de las unidades llega a kHz; el GBW de un op-amp va en MHz.
const hzWide = (f: number) => (f >= 1e6 ? `${sig(f / 1e6)} MHz` : hz(f));
const volts = (v: number) => (v >= 1 ? `${sig(v)} V` : v >= 1e-3 ? `${sig(v * 1e3)} mV` : `${sig(v * 1e6)} µV`);

function OpAmpCalculator() {
  const [g, setG] = useState(100);
  const [a0, setA0] = useState(2e5);
  const [gbw, setGbw] = useState(1e6);
  const [sr, setSr] = useState(0.5);
  const [vp, setVp] = useState(10);
  const [vos, setVos] = useState(1e-3);
  const beta = 1 / g;
  const real = a0 / (1 + a0 * beta);
  const err = (1 - real / g) * 100;
  const bw = gbw * beta;
  const fmax = (sr * 1e6) / (2 * Math.PI * vp);
  const load = (k: keyof typeof OPAMPS) => {
    const o = OPAMPS[k];
    setA0(o.a0);
    setGbw(o.gbw);
    setSr(o.sr);
    setVos(o.vos);
  };
  return (
    <div className="th-calc">
      <div className="th-calc-head">
        Probalo: un no inversor con un op-amp real
        <span className="th-presets">
          {(Object.keys(OPAMPS) as (keyof typeof OPAMPS)[]).map((k) => (
            <button key={k} className="compact" onClick={() => load(k)}>
              {k}
            </button>
          ))}
        </span>
      </div>
      <div className="th-calc-inputs">
        <LogSlider label="1 + R2/R1" min={1} max={1000} value={g} onChange={setG} format={(v) => sig(v)} />
        <LogSlider label="A₀" min={1e3} max={1e7} value={a0} onChange={setA0} format={(v) => `${sig(v)} (${dec(20 * Math.log10(v), 0)} dB)`} />
        <LogSlider label="GBW" min={1e5} max={1e8} value={gbw} onChange={setGbw} format={hzWide} />
        <LogSlider label="SR" min={0.1} max={100} value={sr} onChange={setSr} format={(v) => `${sig(v, 2)} V/µs`} />
        <LogSlider label="Vp salida" min={0.1} max={15} value={vp} onChange={setVp} format={volts} />
        <LogSlider label="Vos" min={1e-6} max={10e-3} value={vos} onChange={setVos} format={volts} />
      </div>
      <dl className="readouts th-readouts">
        <div>
          <dt>Ganancia real</dt>
          <dd>{sig(real, 4)}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{err < 0.01 ? `${dec(err * 1e4, 1)} ppm` : `${sig(err, 2)} %`}</dd>
        </div>
        <div>
          <dt>Ancho de banda</dt>
          <dd>{hzWide(bw)}</dd>
        </div>
        <div>
          <dt>fmax a plena excursión</dt>
          <dd>{hzWide(fmax)}</dd>
        </div>
        <div>
          <dt>Offset en la salida</dt>
          <dd>{volts(vos * g)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ---------- Página ----------

const TOC: { id: string; label: string; sub?: { id: string; label: string }[] }[] = [
  {
    id: 'rc',
    label: 'Filtros RC',
    sub: [
      { id: 'rc-cap', label: 'El capacitor' },
      { id: 'rc-lp', label: 'Pasa bajos' },
      { id: 'rc-hp', label: 'Pasa altos' },
      { id: 'rc-time', label: 'En el tiempo' },
      { id: 'rc-load', label: 'Carga y cascada' },
      { id: 'rc-ex', label: 'Ejemplos' },
    ],
  },
  {
    id: 'diode',
    label: 'Diodos',
    sub: [
      { id: 'diode-eq', label: 'Ecuación de Shockley' },
      { id: 'diode-models', label: 'Modelos' },
      { id: 'diode-uses', label: 'Usos' },
      { id: 'diode-ex', label: 'Ejemplos' },
    ],
  },
  {
    id: 'tr',
    label: 'Transistores',
    sub: [
      { id: 'tr-bjt', label: 'Bipolar (BJT)' },
      { id: 'tr-mos', label: 'MOSFET' },
      { id: 'tr-cmp', label: '¿Cuál conviene?' },
      { id: 'tr-ex', label: 'Ejemplos' },
    ],
  },
  {
    id: 'opamp',
    label: 'Amplificadores operacionales',
    sub: [
      { id: 'opamp-ideal', label: 'El ideal' },
      { id: 'opamp-circuits', label: 'Circuitos básicos' },
      { id: 'opamp-real', label: 'No idealidades' },
      { id: 'opamp-ex', label: 'Ejemplos' },
    ],
  },
];

export function Theory() {
  return (
    <div className="theory-layout">
      <nav className="panel th-toc" aria-label="Índice">
        <h2>Fundamentos</h2>
        <ol>
          {TOC.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.label}</a>
              {s.sub && (
                <ol>
                  {s.sub.map((t) => (
                    <li key={t.id}>
                      <a href={`#${t.id}`}>{t.label}</a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <div className="th-content">
        <RcSection />
        <DiodeSection />
        <TransistorSection />
        <OpAmpSection />
      </div>
    </div>
  );
}

function RcSection() {
  return (
    <section className="panel th-section" id="rc">
      <h2>Filtros RC</h2>
      <p>
        Un filtro deja pasar algunas frecuencias y atenúa otras. El más simple se arma con una resistencia y un
        capacitor: es un divisor de tensión en el que una de las dos «resistencias» cambia con la frecuencia. En una
        cadena de biopotenciales se usan para sacar lo que no es señal: el pasa altos quita el offset de los electrodos
        y la deriva de la respiración; el pasa bajos quita el ruido rápido (músculo, radiofrecuencia) y evita el
        aliasing antes del ADC.
      </p>

      <h3 id="rc-cap">El capacitor y su impedancia</h3>
      <p>
        En un capacitor la corriente es proporcional a la velocidad con que cambia la tensión:
      </p>
      <Eq>
        {x('i')} = {x('C')} <F n={<>d{x('v')}</>} d={<>d{x('t')}</>} />
      </Eq>
      <p>
        Con una senoidal <M>{x('v')} = {x('V')} cos(<i>ω</i>{x('t')})</M>, donde <M><i>ω</i> = 2π{x('f')}</M>, la corriente
        es otra senoidal de la misma frecuencia, adelantada 90° y con amplitud proporcional a <i>ω</i>. Con fasores
        (derivar es multiplicar por {jw}) eso queda como una ley de Ohm con una impedancia compleja:
      </p>
      <Eq>
        {x('Z', 'C')} = <F n={x('V')} d={x('I')} /> = <F n="1" d={<>{jw}{x('C')}</>} />, &nbsp; |{x('Z', 'C')}| = <F n="1" d={<>2π{x('f')}{x('C')}</>} />
      </Eq>
      <p>
        La idea clave: <strong>a baja frecuencia el capacitor es casi un circuito abierto</strong> (|Z<sub>C</sub>| → ∞; en
        continua no pasa corriente) y <strong>a alta frecuencia es casi un cortocircuito</strong> (|Z<sub>C</sub>| → 0).
        La resistencia vale lo mismo a cualquier frecuencia. Según dónde se ponga el capacitor, el divisor deja pasar las
        bajas o las altas.
      </p>

      <h3 id="rc-lp">Pasa bajos RC</h3>
      <div className="th-split">
        <RcSchematic kind="lp" />
        <p>
          La R va en serie y el C a masa; la salida se toma sobre el capacitor. A baja frecuencia el C está «abierto» y{' '}
          <M>{x('v', 'o')} ≈ {x('v', 'i')}</M>. A alta frecuencia el C «cortocircuita» la salida a masa y{' '}
          <M>{x('v', 'o')} → 0</M>.
        </p>
      </div>
      <Derive>
        <li>
          Es un divisor de tensión entre R y Z<sub>C</sub>:
          <Eq>
            {x('H')}({jw}) = <F n={x('v', 'o')} d={x('v', 'i')} /> = <F n={x('Z', 'C')} d={<>{x('R')} + {x('Z', 'C')}</>} /> ={' '}
            <F n={<F n="1" d={<>{jw}{x('C')}</>} />} d={<>{x('R')} + <F n="1" d={<>{jw}{x('C')}</>} /></>} />
          </Eq>
        </li>
        <li>
          Se multiplica arriba y abajo por {jw}{x('C')}:
          <Eq>
            {x('H')}({jw}) = <F n="1" d={<>1 + {jw}{x('R')}{x('C')}</>} />
          </Eq>
        </li>
        <li>
          El módulo de un cociente es el cociente de los módulos, y |<i>a</i> + <i>jb</i>| = √(<i>a</i>² + <i>b</i>²):
          <Eq>
            |{x('H')}| = <F n="1" d={<Sqrt>1 + ({wRC})²</Sqrt>} />, &nbsp; <i>φ</i> = −arctan({wRC})
          </Eq>
        </li>
        <li>
          La frecuencia de corte es donde la parte real y la imaginaria del denominador son iguales:{' '}
          <M>{wRC} = 1</M>. Ahí |H| = 1/√2 ≈ 0,707, es decir, <strong>−3 dB</strong> (la mitad de la potencia) y la
          fase vale −45°:
          <Eq>
            {x('f', 'c')} = <F n="1" d={<>2π{x('R')}{x('C')}</>} /> = <F n="1" d={<>2π<i>τ</i></>} />, &nbsp; <i>τ</i> = {x('R')}{x('C')}
          </Eq>
        </li>
        <li>
          Muy por encima de f<sub>c</sub>, el 1 del denominador no pesa y |H| ≈ f<sub>c</sub>/f: cada vez que la frecuencia
          se multiplica por 10, la salida se divide por 10. Es una pendiente de <strong>−20 dB por década</strong>{' '}
          (−6 dB por octava), típica de un filtro de primer orden.
        </li>
      </Derive>
      <p className="th-example">
        <strong>Ejemplo.</strong> Con R = 100 kΩ y C = 47 nF: τ = 4,7 ms y f<sub>c</sub> = 1/(2π · 4,7 ms) ≈ 33,9 Hz. Una
        señal de 50 Hz sale atenuada a 1/√(1 + (50/33,9)²) ≈ 0,56; una de 500 Hz, a ≈ 0,068 (−23 dB).
      </p>

      <h3 id="rc-hp">Pasa altos RC</h3>
      <div className="th-split">
        <RcSchematic kind="hp" />
        <p>
          Se intercambian los lugares: el C en serie y la R a masa, salida sobre la R. Ahora el capacitor bloquea la
          continua (en f = 0 está abierto y la salida queda en 0) y deja pasar las altas frecuencias.
        </p>
      </div>
      <Derive>
        <li>
          Mismo divisor, con la salida sobre R:
          <Eq>
            {x('H')}({jw}) = <F n={x('R')} d={<>{x('R')} + <F n="1" d={<>{jw}{x('C')}</>} /></>} /> ={' '}
            <F n={<>{jw}{x('R')}{x('C')}</>} d={<>1 + {jw}{x('R')}{x('C')}</>} />
          </Eq>
        </li>
        <li>
          Módulo y fase (el {jw} del numerador suma +90°):
          <Eq>
            |{x('H')}| = <F n={wRC} d={<Sqrt>1 + ({wRC})²</Sqrt>} />, &nbsp; <i>φ</i> = 90° − arctan({wRC})
          </Eq>
        </li>
        <li>
          El corte está en el mismo lugar, <M>{x('f', 'c')} = 1/(2π{x('R')}{x('C')})</M>, con −3 dB y +45°. Por debajo de f
          <sub>c</sub> la pendiente es de +20 dB por década.
        </li>
      </Derive>
      <p>
        Notá que <M>{x('H', 'PA')} = 1 − {x('H', 'PB')}</M>: lo que el pasa bajos deja sobre el capacitor es justo lo que el
        pasa altos no deja sobre la resistencia.
      </p>
      <Note>
        El pasa altos de la cadena es un RC de 1 MΩ y 330 nF: f<sub>c</sub> ≈ 0,48 Hz, el valor típico de un monitor. Para
        ECG de diagnóstico se usa 0,05 Hz (τ ≈ 3,2 s), que respeta mejor el segmento ST pero tarda mucho más en
        recuperarse de un salto de offset.
      </Note>

      <h3 id="rc-time">En el tiempo: la constante τ</h3>
      <p>
        El mismo circuito se puede mirar en el tiempo. En el pasa bajos, la corriente por R es la que carga a C:
      </p>
      <Derive>
        <li>
          <Eq>
            <F n={<>{x('v', 'i')} − {x('v', 'o')}</>} d={x('R')} /> = {x('C')} <F n={<>d{x('v', 'o')}</>} d={<>d{x('t')}</>} /> &nbsp; ⇒ &nbsp; <i>τ</i>{' '}
            <F n={<>d{x('v', 'o')}</>} d={<>d{x('t')}</>} /> + {x('v', 'o')} = {x('v', 'i')}
          </Eq>
        </li>
        <li>
          Ante un escalón de 0 a V<sub>i</sub> con el capacitor descargado, la solución de esta ecuación diferencial de
          primer orden es una exponencial:
          <Eq>
            {x('v', 'o')}({x('t')}) = {x('V', 'i')} (1 − <i>e</i>
            <sup>−t/τ</sup>) &nbsp; (pasa bajos), &nbsp; {x('v', 'o')}({x('t')}) = {x('V', 'i')} <i>e</i>
            <sup>−t/τ</sup> &nbsp; (pasa altos)
          </Eq>
        </li>
        <li>
          En <M>{x('t')} = <i>τ</i></M> la carga llegó al 63 % (1 − e<sup>−1</sup>) y la descarga quedó en el 37 %. A los 5τ
          la diferencia con el final es menor al 1 %.
        </li>
      </Derive>
      <p>
        Frecuencia de corte y constante de tiempo son la misma información: <M>{x('f', 'c')} = 1/(2π<i>τ</i>)</M>. Un filtro
        que corta más bajo responde más lento.
      </p>
      <RcCalculator />

      <h3 id="rc-load">Carga y filtros en cascada</h3>
      <p>
        Todas las fórmulas de arriba suponen que a la salida no se conecta nada (o algo de impedancia mucho mayor que R).
        Si la siguiente etapa tiene una resistencia de entrada R<sub>L</sub>, queda en paralelo con el elemento a masa y
        cambia la ganancia y el corte. Por eso dos RC en cascada <em>no</em> dan exactamente el producto de las dos
        transferencias: el segundo carga al primero. La solución es separarlos con un seguidor (un op-amp con ganancia 1,
        ver más abajo) o elegir el segundo con una impedancia unas 10 veces mayor.
      </p>
      <p>
        Encadenar filtros de primer orden suma pendientes (−40 dB/década con dos), pero el codo queda «blando». Para un
        corte más neto se usan filtros activos de segundo orden, como el Sallen-Key, en los que un op-amp da forma a la
        respuesta (Butterworth, Bessel, Chebyshev).
      </p>
      <Note>El pasa bajos de la cadena es un Sallen-Key de segundo orden; en su panel se puede elegir la forma.</Note>

      <h3 id="rc-ex">Ejemplos de circuitos</h3>
      <Example n={1} title="Filtro antialiasing antes del ADC" sch={<RcSchematic kind="lp" values={['R 10 kΩ', 'C 100 nF']} out="ADC" />}>
        <p>
          El ADC toma 500 muestras por segundo: todo lo que esté por encima de 250 Hz (Nyquist) se dobla a una frecuencia
          más baja. Un RC con R = 10 kΩ y C = 100 nF da τ = 1 ms y f<sub>c</sub> ≈ 159 Hz.
        </p>
        <ul className="th-steps">
          <li>
            A 40 Hz (dentro del ECG): |H| = 1/√(1 + (40/159)²) ≈ 0,97. Casi no toca la señal.
          </li>
          <li>A 250 Hz: |H| ≈ 0,54 (−5,4 dB).</li>
          <li>
            Un ruido de 400 Hz sale con |H| ≈ 0,37 (−8,6 dB) y el ADC lo dobla a 500 − 400 = 100 Hz, en plena banda.
          </li>
        </ul>
        <p>
          Conclusión: un solo RC es un antialiasing débil. Se usa un filtro de orden mayor o se muestrea mucho más rápido
          y se filtra después en digital.
        </p>
      </Example>
      <Example n={2} title="Pasa banda 0,5–40 Hz para ECG de monitor" wide sch={<BandpassSchematic />}>
        <ul className="th-steps">
          <li>
            <strong>Pasa altos:</strong> τ<sub>1</sub> = 330 kΩ · 1 µF = 0,33 s → f<sub>c1</sub> = 1/(2π · 0,33 s) ≈ 0,48
            Hz. Saca el offset de los electrodos y la deriva de la respiración.
          </li>
          <li>
            <strong>Pasa bajos:</strong> τ<sub>2</sub> = 39 kΩ · 100 nF = 3,9 ms → f<sub>c2</sub> ≈ 40,8 Hz. Saca el ruido
            de músculo y suaviza.
          </li>
          <li>
            <strong>El seguidor:</strong> sin él, la entrada del pasa bajos (R2 en serie con C2) quedaría en paralelo con R1.
            A 10 Hz, por ejemplo, C2 vale unos 160 kΩ y R1 «vería» unos 200 kΩ a masa en lugar de nada: el corte y la
            ganancia de la banda cambian. Con el seguidor, cada filtro trabaja como dice su fórmula y la transferencia
            total es el producto de las dos.
          </li>
        </ul>
      </Example>
      <Example n={3} title="Retardo de encendido (reset RC)" sch={<ResetSchematic />}>
        <p>
          Al encender, el capacitor arranca descargado y se carga por R. Un circuito digital queda en reset hasta que la
          tensión pasa su umbral, por ejemplo 0,7 · V<sub>cc</sub>.
        </p>
        <ul className="th-steps">
          <li>
            <M>
              {x('v')}({x('t')}) = {x('V', 'cc')} (1 − <i>e</i>
              <sup>−t/τ</sup>) = {x('V', 'th')}
            </M>{' '}
            ⇒{' '}
            <M>
              {x('t')} = −<i>τ</i> ln(1 − {x('V', 'th')}/{x('V', 'cc')})
            </M>
            .
          </li>
          <li>Con τ = 100 kΩ · 10 µF = 1 s: t = −1 s · ln(0,3) ≈ 1,2 s.</li>
        </ul>
        <p>
          Es la misma cuenta que dice cuánto tarda el pasa altos del laboratorio en recuperarse de un salto de offset: con τ
          = 0,33 s, la señal vuelve al centro en unos 5τ ≈ 1,6 s.
        </p>
      </Example>
    </section>
  );
}

function DiodeSection() {
  return (
    <section className="panel th-section" id="diode">
      <h2>Diodos</h2>
      <div className="th-split">
        <DiodeSymbol />
        <p>
          Un diodo es una unión PN: un trozo de semiconductor con exceso de electrones (N) pegado a otro con exceso de
          huecos (P). Conduce con facilidad cuando el ánodo está más positivo que el cátodo (polarización directa) y casi
          no conduce al revés (polarización inversa). Es la «válvula» de los circuitos.
        </p>
      </div>

      <h3 id="diode-eq">La ecuación de Shockley</h3>
      <p>La corriente crece de forma exponencial con la tensión:</p>
      <Eq>
        {x('I', 'D')} = {x('I', 'S')} (<i>e</i>
        <sup>
          V<sub>D</sub> / (n V<sub>T</sub>)
        </sup>{' '}
        − 1), &nbsp; {x('V', 'T')} = <F n={<>{x('k')}{x('T')}</>} d={x('q')} /> ≈ 25,9 mV a 300 K
      </Eq>
      <ul>
        <li>
          <strong>I<sub>S</sub></strong>, la corriente de saturación: muy chica (de 10<sup>−15</sup> a 10<sup>−9</sup> A),
          crece mucho con la temperatura.
        </li>
        <li>
          <strong>n</strong>, el factor de idealidad: entre 1 y 2 según el diodo.
        </li>
        <li>
          <strong>V<sub>T</sub></strong>, la tensión térmica: k es la constante de Boltzmann, T la temperatura absoluta y q
          la carga del electrón. A 37 °C vale 26,7 mV.
        </li>
      </ul>
      <Derive>
        <li>
          En directa, apenas V<sub>D</sub> supera unos 100 mV la exponencial es enorme y el −1 no importa:{' '}
          <M>
            {x('I', 'D')} ≈ {x('I', 'S')} <i>e</i>
            <sup>
              V<sub>D</sub> / (n V<sub>T</sub>)
            </sup>
          </M>
          .
        </li>
        <li>
          Despejando, <M>{x('V', 'D')} = <i>n</i>{x('V', 'T')} ln({x('I', 'D')}/{x('I', 'S')})</M>. Para dos corrientes:{' '}
          <M>
            {x('V', '2')} − {x('V', '1')} = <i>n</i>{x('V', 'T')} ln({x('I', '2')}/{x('I', '1')})
          </M>
          .
        </li>
        <li>
          Si la corriente se multiplica por 10, la tensión sube <M><i>n</i>{x('V', 'T')} ln 10 ≈ 60 mV · <i>n</i></M>. Por eso
          la tensión en directa cambia poco: de 1 µA a 10 mA (cuatro décadas) sube apenas unos 0,24 V con n = 1.
        </li>
        <li>
          En inversa la exponencial se va a cero y queda <M>{x('I', 'D')} ≈ −{x('I', 'S')}</M>: una corriente de fuga
          diminuta, hasta que la tensión inversa llega a la de ruptura y la corriente se dispara (en los Zener esa ruptura
          es justamente lo que se usa).
        </li>
      </Derive>
      <DiodeIV />
      <div className="row view-options th-legend">
        <span className="legend">
          <span className="swatch diode" /> Shockley (I<sub>S</sub> = 2,5 nA, n = 1,75)
        </span>
        <span className="legend">
          <span className="swatch ideal dashed" /> Ideal
        </span>
        <span className="legend">
          <span className="swatch drop dashed" /> Caída constante 0,7 V
        </span>
      </div>

      <h3 id="diode-models">Modelos para resolver circuitos</h3>
      <p>
        La exponencial no se puede despejar a mano en un circuito con resistencias. Se usan modelos más simples, del más
        burdo al más fino:
      </p>
      <dl className="th-defs">
        <dt>Ideal</dt>
        <dd>Una llave: cortocircuito en directa (V<sub>D</sub> = 0) y circuito abierto en inversa (I<sub>D</sub> = 0).</dd>
        <dt>Caída constante</dt>
        <dd>
          En directa tiene una tensión fija V<sub>γ</sub> ≈ 0,6–0,7 V (silicio), ≈ 0,3 V (Schottky) o 1,8–3 V (LED); si no
          llega a V<sub>γ</sub>, no conduce.
        </dd>
        <dt>Lineal por tramos</dt>
        <dd>
          V<sub>γ</sub> más una resistencia en serie r<sub>D</sub>: <M>{x('V', 'D')} = {x('V', 'γ')} + {x('r', 'D')} {x('I', 'D')}</M>.
        </dd>
        <dt>Pequeña señal</dt>
        <dd>
          Alrededor de un punto de trabajo I<sub>D</sub>, la pendiente de la curva es una resistencia dinámica:{' '}
          <M>
            {x('r', 'd')} = <F n={<>d{x('V', 'D')}</>} d={<>d{x('I', 'D')}</>} /> = <F n={<><i>n</i>{x('V', 'T')}</>} d={x('I', 'D')} />
          </M>{' '}
          (con 1 mA y n = 1, unos 26 Ω).
        </dd>
      </dl>
      <p>
        Para usar los modelos: se supone un estado (conduce o no), se resuelve el circuito y se verifica. Si se supuso que
        conduce, la corriente tiene que dar positiva; si se supuso que no, la tensión tiene que dar menor que V<sub>γ</sub>.
        Si no se cumple, se prueba el otro estado.
      </p>
      <p>
        Con la temperatura, a corriente fija, V<sub>D</sub> baja unos 2 mV por °C. Eso sirve para hacer termómetros y es un
        problema en circuitos de precisión.
      </p>

      <h3 id="diode-uses">Usos en bioinstrumentación</h3>
      <ul>
        <li>
          <strong>Protección de las entradas.</strong> Dos diodos de cada entrada a los rieles de alimentación (más una
          resistencia en serie) recortan las sobretensiones de una descarga electrostática o de un desfibrilador (miles de
          voltios) antes de que lleguen al amplificador. Con la señal normal, de milivoltios, no conducen y no molestan.
        </li>
        <li>
          <strong>Rectificación.</strong> Quedarse con un solo semiciclo: fuentes de alimentación, detectores de envolvente
          (por ejemplo, del EMG). Para rectificar señales de milivoltios, más chicas que V<sub>γ</sub>, se pone el diodo
          dentro de la realimentación de un op-amp (rectificador de precisión).
        </li>
        <li>
          <strong>Referencias de tensión.</strong> Un Zener polarizado en inversa mantiene una tensión casi fija.
        </li>
        <li>
          <strong>LED y fotodiodos.</strong> El oxímetro de pulso ilumina el dedo con LED rojo e infrarrojo y mide la luz
          que llega con un fotodiodo, que da una corriente proporcional a la luz.
        </li>
      </ul>

      <h3 id="diode-ex">Ejemplos de circuitos</h3>
      <Example n={1} title="LED con resistencia limitadora" sch={<LedSchematic />}>
        <p>
          Un LED rojo cae unos 2 V y se quiere que lleve unos 10 mA. Con el modelo de caída constante, la resistencia toma
          lo que sobra:
        </p>
        <ul className="th-steps">
          <li>
            <M>{x('R')} = (5 − 2) V / 10 mA = 300 Ω</M> → 330 Ω comercial, I = 3 V / 330 Ω ≈ 9,1 mA.
          </li>
          <li>La resistencia disipa 3 V · 9,1 mA ≈ 27 mW: alcanza una de 1/8 W.</li>
          <li>
            Sin resistencia, la corriente la fijaría la exponencial: unos pocos milivoltios de más y el LED se quema.
          </li>
        </ul>
      </Example>
      <Example n={2} title="Rectificador de media onda con capacitor" sch={<RectifierSchematic />}>
        <p>Una alterna de 12 V de pico y 50 Hz se convierte en una continua para alimentar un circuito.</p>
        <ul className="th-steps">
          <li>
            El diodo conduce sólo cerca del pico positivo y carga C a <M>12 − 0,7 = 11,3 V</M>.
          </li>
          <li>
            Entre picos, C alimenta a R<sub>L</sub> = 1 kΩ sólo, con I ≈ 11,3 mA. De <M>{x('i')} = {x('C')} d{x('v')}/d{x('t')}</M>
            , en un período T = 20 ms la tensión baja:
            <Eq>
              Δ{x('V')} ≈ <F n={<>{x('I')} {x('T')}</>} d={x('C')} /> = <F n="11,3 mA · 20 ms" d="1000 µF" /> ≈ 0,23 V
            </Eq>
            Es el <em>ripple</em>: más C o más corriente de carga lo cambian en proporción.
          </li>
          <li>
            Cuando la entrada está en su pico negativo, el diodo soporta en inversa unos 12 + 11,3 ≈ 23 V: hay que elegirlo
            con una tensión inversa máxima mayor.
          </li>
        </ul>
      </Example>
      <Example n={3} title="Protección de una entrada de electrodo" sch={<ProtectionSchematic />}>
        <p>
          La resistencia en serie y los dos diodos a los rieles dejan pasar los milivoltios del ECG y recortan una
          sobretensión.
        </p>
        <ul className="th-steps">
          <li>
            Con la señal normal (unos mV más el offset del electrodo, hasta ±300 mV) la entrada está lejos de ±(V + 0,7 V):
            los dos diodos están en inversa y no hacen nada.
          </li>
          <li>
            Ante un pulso de desfibrilador de, por ejemplo, 5 kV, D1 conduce y la entrada queda en +V + 0,7 V. La corriente
            la limita R: (5000 − 5,7) V / 100 kΩ ≈ 50 mA durante unos milisegundos. R tiene que aguantar esa tensión (se
            usan resistencias de alta tensión) y el riel tiene que poder absorber esa corriente.
          </li>
          <li>
            El precio: la fuga de los diodos (1 nA · 100 kΩ = 0,1 mV de offset) y el ruido térmico de R,{' '}
            <M>
              <Sqrt>4{x('k')}{x('T')}{x('R')}</Sqrt> ≈ 40 nV/√Hz
            </M>
            .
          </li>
        </ul>
      </Example>
    </section>
  );
}

function OpAmpSection() {
  return (
    <section className="panel th-section" id="opamp">
      <h2>Amplificadores operacionales</h2>
      <p>
        Un amplificador operacional (op-amp) amplifica la diferencia entre sus dos entradas, la no inversora (+) y la
        inversora (−), con una ganancia enorme: <M>{x('v', 'o')} = {x('A')} ({x('v', '+')} − {x('v', '−')})</M>, con A de
        10<sup>5</sup> o más. Solo, se satura enseguida; su gracia está en usarlo con realimentación negativa, para que unas
        pocas resistencias fijen la ganancia.
      </p>

      <h3 id="opamp-ideal">El op-amp ideal</h3>
      <div className="th-table-wrap">
        <table className="th-table">
          <tbody>
            <tr>
              <td>Ganancia de lazo abierto</td>
              <td>A → ∞</td>
            </tr>
            <tr>
              <td>Impedancia de entrada</td>
              <td>Z<sub>in</sub> → ∞ (no entra corriente)</td>
            </tr>
            <tr>
              <td>Impedancia de salida</td>
              <td>Z<sub>out</sub> = 0 (entrega cualquier corriente)</td>
            </tr>
            <tr>
              <td>Ancho de banda</td>
              <td>infinito</td>
            </tr>
            <tr>
              <td>Offset, ruido, deriva</td>
              <td>ninguno</td>
            </tr>
            <tr>
              <td>Rechazo de modo común</td>
              <td>CMRR → ∞</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        De ahí salen las dos <strong>reglas de oro</strong>, válidas sólo con realimentación negativa:
      </p>
      <ol className="th-rules">
        <li>
          <strong>No entra corriente</strong> por las entradas: <M>{x('i', '+')} = {x('i', '−')} = 0</M>.
        </li>
        <li>
          <strong>Las entradas están a la misma tensión</strong>: <M>{x('v', '+')} = {x('v', '−')}</M> (cortocircuito
          virtual). Como <M>{x('v', '+')} − {x('v', '−')} = {x('v', 'o')}/{x('A')}</M> y A → ∞, la diferencia tiende a cero
          para cualquier salida finita. La realimentación ajusta la salida hasta que eso se cumple.
        </li>
      </ol>

      <h3 id="opamp-circuits">Circuitos básicos</h3>
      <h4>Inversor</h4>
      <div className="th-split">
        <InvertingSchematic />
        <Derive>
          <li>
            Por la regla 2, v<sub>−</sub> = v<sub>+</sub> = 0: el nodo es una <em>masa virtual</em>.
          </li>
          <li>
            Por la regla 1, la corriente que llega por R1 sigue por R2:{' '}
            <M>
              <F n={<>{x('v', 'i')} − 0</>} d={x('R', '1')} /> = <F n={<>0 − {x('v', 'o')}</>} d={x('R', '2')} />
            </M>
          </li>
          <li>
            <Eq>
              <F n={x('v', 'o')} d={x('v', 'i')} /> = −<F n={x('R', '2')} d={x('R', '1')} />, &nbsp; {x('Z', 'in')} = {x('R', '1')}
            </Eq>
          </li>
        </Derive>
      </div>
      <h4>No inversor</h4>
      <div className="th-split">
        <NonInvertingSchematic />
        <Derive>
          <li>
            R2 y R1 forman un divisor desde la salida:{' '}
            <M>
              {x('v', '−')} = {x('v', 'o')} <F n={x('R', '1')} d={<>{x('R', '1')} + {x('R', '2')}</>} /> = <i>β</i> {x('v', 'o')}
            </M>
          </li>
          <li>
            Por la regla 2, v<sub>−</sub> = v<sub>i</sub>:
            <Eq>
              <F n={x('v', 'o')} d={x('v', 'i')} /> = <F n="1" d={<i>β</i>} /> = 1 + <F n={x('R', '2')} d={x('R', '1')} />, &nbsp; {x('Z', 'in')} → ∞
            </Eq>
          </li>
        </Derive>
      </div>
      <h4>Seguidor de tensión</h4>
      <div className="th-split">
        <FollowerSchematic />
        <p>
          El no inversor con R2 = 0 y R1 = ∞: ganancia 1. No amplifica, pero <strong>adapta impedancias</strong>: toma
          la señal sin cargarla (impedancia de entrada altísima) y la entrega con impedancia de salida casi nula. Es clave
          con electrodos, cuya impedancia puede ser de cientos de kΩ, y para separar filtros en cascada.
        </p>
      </div>
      <h4>Restador (amplificador diferencial)</h4>
      <p>
        Con v<sub>1</sub> entrando por R1 a la entrada inversora y v<sub>2</sub> por un divisor R1–R2 a la no inversora,
        por superposición:
      </p>
      <Eq>
        {x('v', 'o')} = −<F n={x('R', '2')} d={x('R', '1')} /> {x('v', '1')} + (1 + <F n={x('R', '2')} d={x('R', '1')} />) <F n={x('R', '2')} d={<>{x('R', '1')} + {x('R', '2')}</>} />{' '}
        {x('v', '2')} = <F n={x('R', '2')} d={x('R', '1')} /> ({x('v', '2')} − {x('v', '1')})
      </Eq>
      <p>
        Amplifica la diferencia y rechaza lo que es común a las dos entradas (la interferencia de 50 Hz que el cuerpo
        capta por igual en ambos electrodos). Pero su rechazo depende de que las resistencias sean iguales, y su impedancia
        de entrada es baja. El <strong>amplificador de instrumentación</strong> le agrega adelante dos no inversores: alta
        impedancia de entrada y la ganancia fijada por una sola resistencia, R<sub>g</sub>.
      </p>
      <Note>El bloque «Amplificador» de la cadena es un amplificador de instrumentación de tres op-amps; su panel muestra el esquema.</Note>

      <h3 id="opamp-real">No idealidades</h3>
      <p>Un op-amp real se aparta del ideal en varios puntos. Conviene saber cuál limita en cada aplicación.</p>

      <h4>Ganancia finita</h4>
      <Derive>
        <li>
          Sin la regla 2, en el no inversor: <M>{x('v', 'o')} = {x('A')} ({x('v', 'i')} − <i>β</i>{x('v', 'o')})</M>.
        </li>
        <li>
          Despejando:
          <Eq>
            <F n={x('v', 'o')} d={x('v', 'i')} /> = <F n={x('A')} d={<>1 + {x('A')}<i>β</i></>} /> = <F n="1" d={<i>β</i>} /> ·{' '}
            <F n="1" d={<>1 + <F n="1" d={<>{x('A')}<i>β</i></>} /></>} />
          </Eq>
        </li>
        <li>
          A<i>β</i> es la <em>ganancia de lazo</em>. El error relativo es ≈ 1/(A<i>β</i>): con A = 200 000 y ganancia 100,
          A<i>β</i> = 2000 y el error es 0,05 %. Cuanto más se le pide de ganancia, menos lazo sobra para corregir.
        </li>
      </Derive>

      <h4>Ancho de banda finito (GBW)</h4>
      <p>
        La ganancia de lazo abierto cae con la frecuencia como un pasa bajos de primer orden con un polo muy bajo (unos
        pocos Hz): <M>{x('A')}({x('f')}) = {x('A', '0')} / (1 + {x('j')}{x('f')}/{x('f', 'p')})</M>. El producto{' '}
        <M>GBW = {x('A', '0')} {x('f', 'p')}</M> es constante. Reemplazando en la fórmula anterior, el lazo cerrado queda
        también como un primer orden, con corte en:
      </p>
      <Eq>
        {x('f', '−3dB')} ≈ <i>β</i> · GBW = <F n="GBW" d={<>1 + {x('R', '2')}/{x('R', '1')}</>} />
      </Eq>
      <p>
        Ganancia por ancho de banda se conserva: un op-amp de 1 MHz con ganancia 100 llega a 10 kHz. En el inversor se usa
        la misma fórmula con 1 + R2/R1 (la «ganancia de ruido»), no con R2/R1.
      </p>

      <h4>Slew rate</h4>
      <p>
        La salida no puede cambiar más rápido que cierto valor, SR (en V/µs). Una senoidal de amplitud V<sub>p</sub> tiene
        pendiente máxima 2π f V<sub>p</sub>, así que se deforma (se vuelve triangular) por encima de:
      </p>
      <Eq>
        {x('f', 'max')} = <F n="SR" d={<>2π{x('V', 'p')}</>} />
      </Eq>
      <p>A diferencia del GBW, es un límite de señal grande: depende de la amplitud.</p>

      <h4>Tensión de offset y corrientes de polarización</h4>
      <p>
        Aunque las dos entradas estén a masa, la salida no da cero: es como si hubiera una pequeña fuente V<sub>os</sub>{' '}
        (de µV a mV) en serie con una entrada. Se amplifica con la ganancia de ruido:{' '}
        <M>{x('V', 'o,os')} = {x('V', 'os')} (1 + {x('R', '2')}/{x('R', '1')})</M>. Además entran pequeñas corrientes de
        polarización I<sub>B</sub> (de fA a µA según la tecnología) que, al pasar por las resistencias, generan más tensión
        de error. Dos consecuencias prácticas:
      </p>
      <ul>
        <li>
          Cada entrada necesita un camino de continua a masa. Una entrada acoplada sólo con un capacitor se va a la
          saturación de a poco porque I<sub>B</sub> lo carga.
        </li>
        <li>
          Para que I<sub>B</sub> genere la misma caída en las dos entradas, se pone en la no inversora una resistencia
          igual a R1 ∥ R2; queda sólo el efecto de la diferencia I<sub>os</sub>.
        </li>
      </ul>

      <h4>Saturación</h4>
      <p>
        La salida no puede pasar de la alimentación (y en muchos op-amps se queda a 1 o 2 V de ella; los «rail-to-rail»
        llegan casi al borde). En biopotenciales esto importa mucho: los electrodos tienen un offset de continua de hasta
        ±300 mV, mucho mayor que el ECG. Si la primera etapa tiene demasiada ganancia, ese offset la satura. Por eso se
        amplifica poco antes del pasa altos y el resto después.
      </p>

      <h4>Rechazo de modo común finito</h4>
      <p>
        Lo que es igual en las dos entradas (modo común) no se anula del todo:{' '}
        <M>
          CMRR = {x('A', 'd')}/{x('A', 'cm')}
        </M>
        , que suele expresarse en dB. Con 90 dB (≈ 31 600), 1 V de modo común a 50 Hz aparece como si fuera una señal
        diferencial de 32 µV, comparable a los detalles finos del ECG. Influyen también los desbalances de impedancia de los
        electrodos, por eso se agrega el circuito de pierna derecha (DRL), que reduce el modo común.
      </p>

      <h4>Otras</h4>
      <ul>
        <li>
          <strong>Impedancias.</strong> La de entrada es finita (de MΩ a TΩ) y la de salida, de decenas de ohms. Con
          realimentación negativa mejoran por el factor 1 + A<i>β</i>.
        </li>
        <li>
          <strong>Ruido.</strong> Tensión (e<sub>n</sub>, en nV/√Hz) y corriente (i<sub>n</sub>, en pA/√Hz) de entrada; el
          ruido de corriente pesa más cuanto mayor es la impedancia de la fuente. A bajas frecuencias aparece además el ruido
          1/f.
        </li>
        <li>
          <strong>Rechazo a la fuente (PSRR)</strong> y <strong>deriva térmica</strong> del offset (µV/°C).
        </li>
      </ul>

      <div className="th-table-wrap">
        <table className="th-table">
          <thead>
            <tr>
              <th>Valores típicos</th>
              <th>Ideal</th>
              <th>741</th>
              <th>TL072</th>
              <th>OPA2188</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>A<sub>0</sub></td>
              <td>∞</td>
              <td>106 dB</td>
              <td>106 dB</td>
              <td>136 dB</td>
            </tr>
            <tr>
              <td>GBW</td>
              <td>∞</td>
              <td>1 MHz</td>
              <td>3 MHz</td>
              <td>2 MHz</td>
            </tr>
            <tr>
              <td>SR</td>
              <td>∞</td>
              <td>0,5 V/µs</td>
              <td>13 V/µs</td>
              <td>0,8 V/µs</td>
            </tr>
            <tr>
              <td>V<sub>os</sub></td>
              <td>0</td>
              <td>1 mV</td>
              <td>3 mV</td>
              <td>6 µV</td>
            </tr>
            <tr>
              <td>I<sub>B</sub></td>
              <td>0</td>
              <td>80 nA</td>
              <td>65 pA</td>
              <td>160 pA</td>
            </tr>
            <tr>
              <td>CMRR</td>
              <td>∞</td>
              <td>90 dB</td>
              <td>86 dB</td>
              <td>146 dB</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="th-small">
        Valores típicos aproximados de hoja de datos. El 741 es bipolar y clásico; el TL072 tiene entradas JFET (corrientes
        de entrada mínimas); el OPA2188 es de autocero (offset y deriva casi nulos), del tipo que se usa en
        instrumentación.
      </p>
      <OpAmpCalculator />

      <h3 id="opamp-ex">Ejemplos de circuitos</h3>
      <Example n={1} title="Etapa de ganancia antes del ADC" sch={<NonInvertingSchematic r1="R1 1 kΩ" r2="R2 100 kΩ" />}>
        <p>
          Después del amplificador de instrumentación (×10) el ECG de 1 mV tiene 10 mV. Para aprovechar un ADC de ±1,65 V se
          quieren unos ±1 V: ganancia 100.
        </p>
        <ul className="th-steps">
          <li>
            <M>1 + {x('R', '2')}/{x('R', '1')} = 100</M>: con R1 = 1 kΩ, R2 = 99 kΩ → 100 kΩ comercial, ganancia 101.
          </li>
          <li>Con un TL072 (3 MHz): ancho de banda 3 MHz / 101 ≈ 30 kHz, sobra para 40 Hz.</li>
          <li>
            Pero su offset típico de 3 mV sale como 3 mV · 101 ≈ 0,3 V: un quinto del rango. Hay que poner el pasa altos
            después de esta etapa o usar un op-amp de precisión (con el OPA2188, 6 µV · 101 ≈ 0,6 mV).
          </li>
        </ul>
      </Example>
      <Example n={2} title="Desplazador de nivel para un ADC de 0 a 3,3 V" sch={<LevelShiftSchematic />}>
        <p>
          Muchos ADC sólo leen tensiones positivas. Hay que llevar una señal de ±1,65 V a 0…3,3 V, sumándole 1,65 V.
        </p>
        <ul className="th-steps">
          <li>
            Las dos R de la entrada + son un divisor entre v<sub>i</sub> y V<sub>ref</sub>. Por superposición,{' '}
            <M>
              {x('v', '+')} = ({x('v', 'i')} + {x('V', 'ref')})/2
            </M>
            .
          </li>
          <li>
            El no inversor con R2 = R1 tiene ganancia 2:{' '}
            <M>
              {x('v', 'o')} = 2 {x('v', '+')} = {x('v', 'i')} + {x('V', 'ref')}
            </M>
            . Con V<sub>ref</sub> = 1,65 V, −1,65…+1,65 V pasa a 0…3,3 V.
          </li>
          <li>
            Las cuatro R tienen que ser iguales (1 % o mejor) y el op-amp, de una sola fuente y rail-to-rail, para llegar a 0
            y a 3,3 V.
          </li>
        </ul>
      </Example>
      <Example n={3} title="Pasa bajos activo: ganancia y filtro en una etapa" sch={<ActiveLpSchematic />}>
        <ul className="th-steps">
          <li>
            Es un inversor con Z<sub>2</sub> = R2 ∥ C en lugar de R2:{' '}
            <M>
              {x('Z', '2')} = {x('R', '2')}/(1 + {jw}{x('R', '2')}{x('C')})
            </M>
            .
          </li>
          <li>
            <Eq>
              {x('H')}({jw}) = −<F n={x('Z', '2')} d={x('R', '1')} /> = −<F n={x('R', '2')} d={x('R', '1')} /> ·{' '}
              <F n="1" d={<>1 + {jw}{x('R', '2')}{x('C')}</>} />
            </Eq>
            Una ganancia −R2/R1 por un pasa bajos RC.
          </li>
          <li>
            Con R1 = 10 kΩ, R2 = 100 kΩ y C = 39 nF: ganancia −10 (20 dB) y f<sub>c</sub> = 1/(2π · 100 kΩ · 39 nF) ≈ 40,8
            Hz.
          </li>
          <li>
            A diferencia del RC pasivo, la salida tiene impedancia casi nula: la etapa siguiente no lo carga. Sin R2 es un{' '}
            <em>integrador</em> (<M>{x('v', 'o')} = −(1/{x('R', '1')}{x('C')}) ∫{x('v', 'i')} d{x('t')}</M>), pero entonces
            integra también el offset y se satura: R2 limita la ganancia en continua.
          </li>
        </ul>
      </Example>
    </section>
  );
}
