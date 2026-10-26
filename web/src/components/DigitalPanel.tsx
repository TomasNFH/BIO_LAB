import { useEffect, useState } from 'react';
import type { BioEngine, SourceKind } from '../engine/BioEngine';
import type { Branch, ChainSettings } from '../engine/chain';
import { DEFAULT_DIGITAL, type DigitalSettings, type ThresholdMode } from '../engine/digital';
import { Help } from './Help';
import { dec, Knob } from './Knob';
import { hz, seconds } from './units';

const mv = (v: number) => `${dec(v, 2)} mV`;

// Aviso común: sin ADC la etapa digital no recibe muestras.
const NoAdc = ({ chain }: { chain: ChainSettings }) =>
  chain.adc.on ? null : (
    <p className="sat-warning">El ADC está apagado: sin muestras, la etapa digital no hace nada.</p>
  );

// Pasa bajos digital de primer orden, a la frecuencia del ADC.
export function DigitalLpPanel({ chain, onChange }: { chain: ChainSettings; onChange: (s: DigitalSettings) => void }) {
  const lp = chain.dsp.lp;
  const edit = (patch: Partial<DigitalSettings['lp']>) => onChange({ ...chain.dsp, lp: { ...lp, ...patch } });
  const fs = chain.adc.fs;
  const fc = Math.min(lp.fc, 0.45 * fs);
  const a = 1 - Math.exp((-2 * Math.PI * fc) / fs);

  return (
    <section className={`panel ${lp.on && chain.adc.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Pasa bajos digital</h2>
        <label className="check">
          <input type="checkbox" checked={lp.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <button onClick={() => edit(DEFAULT_DIGITAL.lp)}>Restablecer</button>
        <Help label="Ayuda del pasa bajos digital">
          <p>
            Es el mismo RC del pasa bajos analógico, pero hecho con cuentas sobre las muestras del
            ADC: en cada muestra nueva, y = y + a·(x − y). No necesita componentes y se cambia sin
            soldar, pero sólo trabaja a la frecuencia del ADC y no puede sacar lo que ya se dobló
            por aliasing: ese trabajo sigue siendo del pasa bajos analógico.
          </p>
          <p>
            Sirve para suavizar la señal antes del umbral: con el EOG, por ejemplo, saca el ruido
            rápido y deja la posición de la mirada.
          </p>
        </Help>
      </div>
      <NoAdc chain={chain} />

      <div className="knobs compact amp-knobs">
        <Knob label="fc" size="small" value={lp.fc} min={0.5} max={200} scale="log" defaultValue={DEFAULT_DIGITAL.lp.fc} format={hz} onChange={(v) => edit({ fc: v })} />
      </div>

      <dl className="readouts">
        <div>
          <dt>Coeficiente a = 1 − e^(−2π·fc/fs)</dt>
          <dd>{dec(a, 3)}</dd>
        </div>
        <div>
          <dt>Constante de tiempo τ = 1/(2π·fc)</dt>
          <dd>{seconds(1 / (2 * Math.PI * fc))}</dd>
        </div>
        <div>
          <dt>Frecuencia del ADC</dt>
          <dd>{fs} Hz</dd>
        </div>
      </dl>
      {lp.fc > 0.45 * fs && <p className="muted small">fc no puede pasar de 0,45·fs: se usa {hz(fc)}.</p>}
    </section>
  );
}

// Relee el estado del umbral unas veces por segundo.
function useLive<T>(engine: BioEngine, read: () => T, deps: unknown[]): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    setValue(read());
    const id = setInterval(() => setValue(read()), 200);
    return () => clearInterval(id);
  }, [engine, ...deps]);
  return value;
}

const DIRECTION = { [-1]: 'Izquierda', 0: 'Centro', 1: 'Derecha' } as Record<number, string>;

type ThresholdProps = {
  engine: BioEngine;
  branch: Branch;
  chain: ChainSettings;
  source: SourceKind;
  eogSensitivity: number; // µV por grado
  onChange: (s: DigitalSettings) => void;
};

// Umbral: un nivel para contar pulsos (latidos) o dos para saber hacia
// dónde se mira (EOG).
export function ThresholdPanel({ engine, branch, chain, source, eogSensitivity, onChange }: ThresholdProps) {
  const thr = chain.dsp.thr;
  const edit = (patch: Partial<DigitalSettings['thr']>) => onChange({ ...chain.dsp, thr: { ...thr, ...patch } });
  const live = useLive(engine, () => ({ count: engine.countOf(branch), rate: engine.rateOf(branch), dir: engine.directionOf(branch) }), [branch]);
  // En el EOG, los niveles también en grados de mirada.
  const deg = (v: number) => (source === 'eog' ? ` (${dec((v * 1000) / eogSensitivity, 0)}°)` : '');

  return (
    <section className={`panel ${thr.on && chain.adc.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Umbral</h2>
        <label className="check">
          <input type="checkbox" checked={thr.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <button onClick={() => edit({ ...DEFAULT_DIGITAL.thr, on: thr.on })}>Restablecer</button>
        <Help label="Ayuda del umbral">
          <p>
            Compara cada muestra (después del pasa bajos digital, si está prendido) con uno o dos
            niveles. Con un nivel da un pulso cada vez que la señal lo cruza: con el ECG, uno por
            onda R, y así se cuentan los latidos. Después de un pulso no acepta otro durante el
            período refractario, y para volver a armarse la señal tiene que bajar del nivel menos la
            histéresis; si no, el ruido sobre el pico daría varios pulsos.
          </p>
          <p>
            Con dos niveles la salida dice hacia dónde se mira con el EOG: por debajo del de la
            izquierda, izquierda; por encima del de la derecha, derecha; entre los dos, centro. Es
            mucho más simple que el detector de Pan y Tompkins (vista «Detector QRS»): comparar los
            dos muestra qué se gana con cada paso extra.
          </p>
        </Help>
      </div>
      <NoAdc chain={chain} />

      <div className="seg wrap">
        {(
          [
            ['one', 'Un nivel (contar pulsos)'],
            ['two', 'Dos niveles (izquierda / derecha)'],
          ] as [ThresholdMode, string][]
        ).map(([m, label]) => (
          <button key={m} className={thr.mode === m ? 'on' : ''} onClick={() => edit({ mode: m })}>
            {label}
          </button>
        ))}
      </div>

      <div className="knobs compact amp-knobs">
        {thr.mode === 'one' ? (
          <>
            <Knob label="Nivel" size="small" value={thr.level} min={-2} max={2} step={0.01} defaultValue={DEFAULT_DIGITAL.thr.level} format={mv} onChange={(level) => edit({ level })} />
            <Knob label="Refractario" size="small" value={thr.refractory} min={0.05} max={1} step={0.01} defaultValue={DEFAULT_DIGITAL.thr.refractory} format={seconds} onChange={(refractory) => edit({ refractory })} />
          </>
        ) : (
          <>
            <Knob label="Izquierda" size="small" value={thr.low} min={-1} max={0} step={0.01} defaultValue={DEFAULT_DIGITAL.thr.low} format={(v) => mv(v) + deg(v)} onChange={(low) => edit({ low })} />
            <Knob label="Derecha" size="small" value={thr.high} min={0} max={1} step={0.01} defaultValue={DEFAULT_DIGITAL.thr.high} format={(v) => mv(v) + deg(v)} onChange={(high) => edit({ high })} />
          </>
        )}
        <Knob label="Histéresis" size="small" value={thr.hyst} min={0} max={0.5} step={0.01} defaultValue={DEFAULT_DIGITAL.thr.hyst} format={mv} onChange={(hyst) => edit({ hyst })} />
      </div>

      <dl className="readouts">
        {thr.mode === 'one' ? (
          <>
            <div>
              <dt>Pulsos contados</dt>
              <dd>{live.count}</dd>
            </div>
            <div>
              <dt>Frecuencia de los pulsos</dt>
              <dd>{live.rate === null ? '—' : `${dec(live.rate, 0)} lpm`}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Mirada</dt>
            <dd>{thr.on && chain.adc.on ? DIRECTION[live.dir] : '—'}</dd>
          </div>
        )}
      </dl>
      {thr.mode === 'one' && (
        <div className="preset-save">
          <button onClick={() => engine.resetCount()}>Poner en cero</button>
        </div>
      )}
    </section>
  );
}
