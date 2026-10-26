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

// Umbral que necesita cada dispositivo (el monitor, ninguno).
const NEEDS: Partial<Record<OutputDevice, ThresholdMode>> = { counter: 'one', car: 'two' };

// ¿La rama tiene lo que el dispositivo necesita?
const ready = (device: OutputDevice, chain: ChainSettings) => {
  const mode = NEEDS[device];
  return !mode || (chain.adc.on && chain.dsp.thr.on && chain.dsp.thr.mode === mode);
};

type Props = {
  branch: Branch; // la rama que alimenta la salida (la del monitor)
  chain: ChainSettings;
  onChain: (s: ChainSettings) => void;
  source: SourceKind;
  output: OutputSettings;
  onOutput: (s: OutputSettings) => void;
};

// La salida de la cadena: con qué se usa la señal ya procesada. La toma de
// la rama que se ve en el monitor. El contador y el autito se ven en la
// pantalla flotante de abajo (OutputDock); acá se eligen y se preparan.
export function OutputPanel({ branch, chain, onChain, source, output, onOutput }: Props) {
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
            centro se queda quieto. Los dos se ven abajo, en una pantalla flotante que queda
            siempre a la vista.
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

      {device === 'monitor' ? (
        <p className="muted small">
          La salida es la pantalla: el monitor de arriba muestra la rama {B} tal como sale de la
          cadena (después del ADC). Es el uso más común de un equipo de ECG o de EOG.
        </p>
      ) : (
        <>
          <Needs device={device} chain={chain} branch={branch} onChain={onChain} />
          {device === 'counter' && source !== 'ecg' && source !== 'rec' && <p className="muted small">El contador de pulso está pensado para el ECG.</p>}
          {device === 'car' && source !== 'eog' && <p className="muted small">El autito está pensado para el EOG: se maneja con la mirada.</p>}
          <p className="muted small">Se ve abajo, en la pantalla flotante, con la rama {B}.</p>
        </>
      )}
    </section>
  );
}

// Lo que el dispositivo necesita de la etapa digital, con un botón que lo
// prepara.
function Needs({ device, chain, branch, onChain }: { device: OutputDevice; chain: ChainSettings; branch: Branch; onChain: (s: ChainSettings) => void }) {
  const mode = NEEDS[device];
  if (!mode || ready(device, chain)) return null;
  const thr = chain.dsp.thr;
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

type DockProps = {
  engine: BioEngine;
  branch: Branch;
  chain: ChainSettings;
  source: SourceKind;
  ecgBpm: number;
  output: OutputSettings;
  onOutput: (s: OutputSettings) => void;
  onOpenSettings: () => void; // abre la carta de Salida
};

// Pantalla flotante abajo y al centro: el contador de pulso o el autito,
// siempre a la vista mientras se tocan los bloques. Se puede achicar.
// Avisa su alto en --dock-h para que la página le deje lugar.
export function OutputDock({ engine, branch, chain, source, ecgBpm, output, onOutput, onOpenSettings }: DockProps) {
  const device = output.device;
  const [min, setMin] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const shown = device !== 'monitor';

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!shown || !el) {
      root.style.setProperty('--dock-h', '0px');
      return;
    }
    const ro = new ResizeObserver(() => root.style.setProperty('--dock-h', `${el.offsetHeight + 16}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--dock-h', '0px');
    };
  }, [shown]);

  if (!shown) return null;
  const label = DEVICES.find((d) => d.id === device)?.label;

  return (
    <aside ref={ref} className={`out-dock ${min ? 'min' : ''}`} aria-label={`Salida: ${label}`}>
      <div className="dock-head">
        <span className="dock-title">{label}</span>
        <span className="dock-branch">rama {branch.toUpperCase()}</span>
        {min && device === 'counter' && <CounterSummary engine={engine} branch={branch} />}
        <button className="dock-btn" onClick={() => setMin((m) => !m)} aria-label={min ? 'Agrandar' : 'Achicar'} title={min ? 'Agrandar' : 'Achicar'}>
          {min ? '▴' : '▾'}
        </button>
        <button className="dock-btn" onClick={() => onOutput({ device: 'monitor' })} aria-label="Cerrar (la salida vuelve al monitor)" title="Cerrar (la salida vuelve al monitor)">
          ×
        </button>
      </div>
      {!min && (
        <div className="dock-body">
          {!ready(device, chain) && (
            <p className="dock-needs">
              Falta el umbral de la rama {branch.toUpperCase()}.{' '}
              <button className="dock-link" onClick={onOpenSettings}>
                Prepararlo
              </button>
            </p>
          )}
          {device === 'counter' && <Counter engine={engine} branch={branch} realBpm={source === 'ecg' ? ecgBpm : null} />}
          {device === 'car' && <Car engine={engine} branch={branch} />}
        </div>
      )}
    </aside>
  );
}

function readCounter(engine: BioEngine, branch: Branch) {
  const p = engine.pulsesOf(branch);
  const last = p.length ? p[p.length - 1] : -Infinity;
  return { count: engine.countOf(branch), rate: engine.rateOf(branch), lit: engine.sampleCount - last < LED_SECONDS * engine.fs };
}

function useCounter(engine: BioEngine, branch: Branch) {
  const [s, setS] = useState(() => readCounter(engine, branch));
  useEffect(() => {
    const id = setInterval(() => setS(readCounter(engine, branch)), 50);
    return () => clearInterval(id);
  }, [engine, branch]);
  return s;
}

// Achicado: la cuenta y las lpm en la barra.
function CounterSummary({ engine, branch }: { engine: BioEngine; branch: Branch }) {
  const s = useCounter(engine, branch);
  return (
    <span className="dock-summary">
      <span className={`out-led small ${s.lit ? 'on' : ''}`} aria-hidden="true" />
      {String(s.count % 1000).padStart(3, '0')} · {s.rate === null ? '—' : `${dec(s.rate, 0)} lpm`}
    </span>
  );
}

// Contador de pulso: display de tres cifras, una luz por latido y las lpm.
function Counter({ engine, branch, realBpm }: { engine: BioEngine; branch: Branch; realBpm: number | null }) {
  const s = useCounter(engine, branch);
  return (
    <div className="dock-row">
      <div className="out-counter" role="status" aria-label={`${s.count} pulsos`}>
        <span className={`out-led ${s.lit ? 'on' : ''}`} aria-hidden="true" />
        <span className="out-digits">{String(s.count % 1000).padStart(3, '0')}</span>
        <span className="out-unit">pulsos</span>
      </div>
      <dl className="dock-readouts">
        <div>
          <dt>Medida</dt>
          <dd>{s.rate === null ? '—' : `${dec(s.rate, 0)} lpm`}</dd>
        </div>
        {realBpm !== null && (
          <div>
            <dt>Real</dt>
            <dd>{dec(realBpm, 0)} lpm</dd>
          </div>
        )}
        <button onClick={() => engine.resetCount()}>Poner en cero</button>
      </dl>
    </div>
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
      <div className="dock-row car-foot">
        <span className="dock-dir">{DIRECTION[dir] ?? '—'}</span>
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
