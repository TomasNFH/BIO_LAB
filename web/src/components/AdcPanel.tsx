import { useEffect, useState } from 'react';
import { Help } from './Help';
import { ADC_RATES, DEFAULT_ADC, lsb, type AdcSettings } from '../engine/adc';
import { ampGains } from '../engine/amp';
import { FA, type BioEngine } from '../engine/BioEngine';
import type { Branch, ChainSettings } from '../engine/chain';
import { filterResponse } from '../engine/filters';
import { dec, Knob } from './Knob';

const RANGES = [0.5, 1, 2.5, 5];

const volts = (v: number) => (v >= 1 ? `${dec(v, 2)} V` : v >= 1e-3 ? `${dec(v * 1000, 2)} mV` : `${dec(v * 1e6, 1)} µV`);

type Props = {
  engine: BioEngine;
  branch: Branch;
  chain: ChainSettings; // la cadena entera: la ganancia y el pasa bajos importan
  onChange: (s: AdcSettings) => void;
};

// Conversor analógico-digital: frecuencia de muestreo, bits y rango, con lo
// que sale de ellos según la ganancia y el pasa bajos de la rama.
export function AdcPanel({ engine, branch, chain, onChange }: Props) {
  const settings = chain.adc;
  const edit = (patch: Partial<AdcSettings>) => onChange({ ...settings, ...patch });
  const gain = (chain.amp.on ? ampGains(chain.amp).gain : 1) * chain.post.gain;
  const step = lsb(settings);
  const nyquist = settings.fs / 2;
  const lpAtNyquist = filterResponse('lp', chain.lp, nyquist, FA).mag;
  const clipped = useClipped(engine, branch);

  return (
    <section className={`panel ${settings.on ? '' : 'block-off'}`}>
      <div className="panel-head">
        <h2>Conversor A/D</h2>
        <label className="check">
          <input type="checkbox" checked={settings.on} onChange={(e) => edit({ on: e.target.checked })} />
          Activado
        </label>
        <button onClick={() => onChange(DEFAULT_ADC)}>Restablecer</button>
        <Help label="Ayuda del conversor">
          <p>
            Muestrea la salida analógica, retiene cada valor hasta la muestra siguiente y lo
            redondea a uno de 2^bits escalones dentro de su rango. Apagado, la salida es la señal
            analógica.
          </p>
          <p>
            Lo que haya por encima de Nyquist no desaparece: se dobla y aparece como una frecuencia
            más baja que no estaba (aliasing), y después ningún filtro digital lo puede separar. Por
            eso el pasa bajos va antes del ADC y tiene que atenuar bien en fs/2. Los escalones del
            ADC son fijos en volts: sin ganancia antes, un ECG de 1 mV ocupa muy pocos y se ve
            escalonado.
          </p>
        </Help>
      </div>

      <div className="switch-rows">
        <span className="switch-label">Frecuencia de muestreo (Hz)</span>
        <div className="seg">
          {ADC_RATES.map((f) => (
            <button key={f} className={settings.fs === f ? 'on' : ''} onClick={() => edit({ fs: f })}>
              {f}
            </button>
          ))}
        </div>
        <span className="switch-label">Rango de entrada</span>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r} className={settings.range === r ? 'on' : ''} onClick={() => edit({ range: r })}>
              ±{dec(r, r % 1 ? 1 : 0)} V
            </button>
          ))}
        </div>
      </div>

      <div className="knobs compact amp-knobs">
        <Knob label="Resolución" size="small" value={settings.bits} min={4} max={24} step={1} defaultValue={DEFAULT_ADC.bits} format={(b) => `${b} bits`} onChange={(bits) => edit({ bits })} />
      </div>

      <dl className="readouts">
        <div>
          <dt>Nyquist = fs / 2</dt>
          <dd>{dec(nyquist, nyquist % 1 ? 1 : 0)} Hz</dd>
        </div>
        <div>
          <dt>Pasa bajos en Nyquist</dt>
          <dd className={chain.lp.on && lpAtNyquist < 0.1 ? '' : 'warn'}>
            {chain.lp.on ? `${dec(20 * Math.log10(lpAtNyquist), 1)} dB` : 'sin filtro'}
          </dd>
        </div>
        <div>
          <dt>1 LSB en el ADC = 2·rango / 2^bits</dt>
          <dd>{volts(step)}</dd>
        </div>
        <div>
          <dt>1 LSB referido a la entrada (÷ {dec(gain, gain < 10 ? 2 : 0)})</dt>
          <dd>{volts(step / gain)}</dd>
        </div>
        <div>
          <dt>SNR de cuantización ideal ≈ 6,02·bits + 1,76</dt>
          <dd>{dec(6.02 * settings.bits + 1.76, 1)} dB</dd>
        </div>
        <div>
          <dt>Recorte</dt>
          <dd className={settings.on && clipped ? 'bad' : ''}>{settings.on && clipped ? 'Sí: la señal se pasa del rango' : 'No'}</dd>
        </div>
      </dl>
    </section>
  );
}

// Lee cuatro veces por segundo si el ADC recortó.
function useClipped(engine: BioEngine, branch: Branch) {
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    setClipped(false);
    let lastCount = -1;
    const id = setInterval(() => {
      if (engine.sampleCount === lastCount) return;
      lastCount = engine.sampleCount;
      setClipped(engine.chains[branch].adc.takeClipped());
    }, 250);
    return () => clearInterval(id);
  }, [engine, branch]);
  return clipped;
}
