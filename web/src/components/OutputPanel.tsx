import { useEffect, useRef, useState } from 'react';
import type { BioEngine, SourceKind } from '../engine/BioEngine';
import type { Branch, ChainSettings } from '../engine/chain';
import type { ThresholdMode } from '../engine/digital';
import { DEVICES, type OutputDevice, type OutputSettings } from '../output';
import { Help } from './Help';
import { dec } from './Knob';

// Velocidad del autito: fracción de la pista por segundo de señal.
const CAR_SPEED = 0.2;
// Posición en la pista (0 a 1) a «left» en CSS, sin que el autito se salga.
const carLeft = (x: number) => `${8 + x * 84}%`;
// Cuánto queda prendida la luz del contador después de cada pulso.
const LED_SECONDS = 0.12;

type Props = {
  engine: BioEngine;
  branch: Branch; // la rama que alimenta la salida (la del monitor)
  chain: ChainSettings;
  onChain: (s: ChainSettings) => void;
  source: SourceKind;
  ecgBpm: number;
  output: OutputSettings;
  onOutput: (s: OutputSettings) => void;
};

// La salida de la cadena: con qué se usa la señal ya procesada. La toma de
// la rama que se ve en el monitor.
export function OutputPanel({ engine, branch, chain, onChain, source, ecgBpm, output, onOutput }: Props) {
  const device = output.device;
  const B = branch.toUpperCase();

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Salida</h2>
        <Help label="Ayuda de la salida">
          <p>
            La salida es lo que se hace con la señal al final de la cadena. Toma la rama que se ve
            en el monitor (A o B): al cambiar de rama, el dispositivo pasa a usar la otra.
          </p>
          <p>
            El monitor sólo la muestra. El contador de pulso cuenta los pulsos del umbral (uno por
            onda R) y calcula las lpm. El autito usa el umbral de dos niveles con el EOG: mirar a la
            derecha lo lleva hacia adelante, mirar a la izquierda hacia atrás y con la mirada al
            centro se queda quieto.
          </p>
        </Help>
      </div>

      <div className="seg wrap out-devices">
        {DEVICES.map((d) => (
          <button key={d.id} className={device === d.id ? 'on' : ''} aria-pressed={device === d.id} onClick={() => onOutput({ device: d.id })}>
            {d.label}
          </button>
        ))}
      </div>

      {device === 'monitor' && (
        <p className="muted small">
          La salida es la pantalla: el monitor de arriba muestra la rama {B} tal como sale de la
          cadena (después del ADC). Es el uso más común de un equipo de ECG o de EOG.
        </p>
      )}

      {device === 'counter' && (
        <>
          <Needs device="counter" chain={chain} branch={branch} onChain={onChain} />
          {source !== 'ecg' && source !== 'rec' && <p className="muted small">El contador de pulso está pensado para el ECG.</p>}
          <Counter engine={engine} branch={branch} realBpm={source === 'ecg' ? ecgBpm : null} />
        </>
      )}

      {device === 'car' && (
        <>
          <Needs device="car" chain={chain} branch={branch} onChain={onChain} />
          {source !== 'eog' && <p className="muted small">El autito está pensado para el EOG: se maneja con la mirada.</p>}
          <Car engine={engine} branch={branch} />
        </>
      )}
    </section>
  );
}

// Lo que el dispositivo necesita de la etapa digital, con un botón que lo
// prepara.
function Needs({ device, chain, branch, onChain }: { device: OutputDevice; chain: ChainSettings; branch: Branch; onChain: (s: ChainSettings) => void }) {
  const mode: ThresholdMode = device === 'car' ? 'two' : 'one';
  const thr = chain.dsp.thr;
  if (chain.adc.on && thr.on && thr.mode === mode) return null;
  const what = mode === 'one' ? 'el umbral de un nivel' : 'el umbral de dos niveles';
  return (
    <div className="out-needs">
      <p className="sat-warning">
        Necesita {what} de la rama {branch.toUpperCase()}
        {chain.adc.on ? '' : ' (y el ADC prendido)'}.
      </p>
      <button
        onClick={() =>
          onChain({ ...chain, adc: { ...chain.adc, on: true }, dsp: { ...chain.dsp, thr: { ...thr, on: true, mode } } })
        }
      >
        Prenderlo
      </button>
    </div>
  );
}

function readCounter(engine: BioEngine, branch: Branch) {
  const p = engine.pulsesOf(branch);
  const last = p.length ? p[p.length - 1] : -Infinity;
  return { count: engine.countOf(branch), rate: engine.rateOf(branch), lit: engine.sampleCount - last < LED_SECONDS * engine.fs };
}

// Contador de pulso: display de tres cifras, una luz por latido y las lpm.
function Counter({ engine, branch, realBpm }: { engine: BioEngine; branch: Branch; realBpm: number | null }) {
  const [s, setS] = useState(() => readCounter(engine, branch));
  useEffect(() => {
    const id = setInterval(() => setS(readCounter(engine, branch)), 50);
    return () => clearInterval(id);
  }, [engine, branch]);

  return (
    <>
      <div className="out-counter" role="status" aria-label={`${s.count} pulsos`}>
        <span className={`out-led ${s.lit ? 'on' : ''}`} aria-hidden="true" />
        <span className="out-digits">{String(s.count % 1000).padStart(3, '0')}</span>
        <span className="out-unit">pulsos</span>
      </div>
      <dl className="readouts">
        <div>
          <dt>Frecuencia medida</dt>
          <dd>{s.rate === null ? '—' : `${dec(s.rate, 0)} lpm`}</dd>
        </div>
        {realBpm !== null && (
          <div>
            <dt>Frecuencia real del ECG</dt>
            <dd>{dec(realBpm, 0)} lpm</dd>
          </div>
        )}
      </dl>
      <div className="preset-save">
        <button onClick={() => engine.resetCount()}>Poner en cero</button>
      </div>
    </>
  );
}

const DIRECTION: Record<number, string> = { [-1]: 'Izquierda: va hacia atrás', 0: 'Centro: quieto', 1: 'Derecha: va hacia adelante' };

// Autito en una pista: avanza con la mirada a la derecha, retrocede con la
// mirada a la izquierda. Se mueve con el tiempo de la señal, así que en
// pausa se queda quieto.
function Car({ engine, branch }: { engine: BioEngine; branch: Branch }) {
  const pos = useRef(0.5);
  const carRef = useRef<HTMLDivElement>(null);
  const [dir, setDir] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = engine.time;
    let lastDir = NaN;
    const loop = () => {
      const t = engine.time;
      const dt = Math.min(0.2, Math.max(0, t - last));
      last = t;
      const d = engine.directionOf(branch);
      pos.current = Math.min(1, Math.max(0, pos.current + d * CAR_SPEED * dt));
      if (carRef.current) carRef.current.style.left = carLeft(pos.current);
      if (d !== lastDir) {
        lastDir = d;
        setDir(d);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, branch]);

  return (
    <>
      <div className="out-track" aria-label="Pista del autito">
        <span className="out-track-end left">◀ atrás</span>
        <span className="out-track-end right">adelante ▶</span>
        <div className="out-car" ref={carRef} style={{ left: carLeft(pos.current) }}>
          <svg viewBox="0 0 64 34" width="64" height="34" aria-hidden="true">
            <path d="M6 22v-6c0-2 1-3 3-3h8l7-8h16l9 8h7c2 0 3 1 3 3v6z" fill="var(--terra)" stroke="var(--espresso)" strokeWidth="2" strokeLinejoin="round" />
            <path d="M26 7h6v6h-12zM35 7h4l6 6h-10z" fill="var(--cream-light)" stroke="var(--espresso)" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="17" cy="24" r="6" fill="var(--espresso)" />
            <circle cx="17" cy="24" r="2.2" fill="var(--cream-light)" />
            <circle cx="47" cy="24" r="6" fill="var(--espresso)" />
            <circle cx="47" cy="24" r="2.2" fill="var(--cream-light)" />
          </svg>
        </div>
      </div>
      <dl className="readouts">
        <div>
          <dt>Mirada</dt>
          <dd>{DIRECTION[dir] ?? '—'}</dd>
        </div>
      </dl>
      <div className="preset-save">
        <button
          onClick={() => {
            pos.current = 0.5;
            if (carRef.current) carRef.current.style.left = carLeft(0.5);
          }}
        >
          Volver al centro
        </button>
      </div>
    </>
  );
}
