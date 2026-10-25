import { useEffect, useState } from 'react';
import { BioEngine, type EngineState } from './engine/BioEngine';
import { DEFAULT_AMP, type AmpSettings } from './engine/amp';
import { DEFAULT_ECG, type EcgSettings } from './engine/ecg';
import { DEFAULT_NOISE, noiseBand, type NoiseId, type NoiseSettings } from './engine/noise';
import { AmpPanel } from './components/AmpPanel';
import { ChainStrip } from './components/ChainStrip';
import { fmt, Knob } from './components/Knob';
import { Logo } from './components/Logo';
import { NoisePanel } from './components/NoisePanel';
import { DEFAULT_MONITOR, MonitorView, type MonitorOptions } from './views/MonitorView';
import { DEFAULT_SPECTRUM, SpectrumView, type SpectrumOptions } from './views/SpectrumView';

// Un solo motor durante toda la vida de la página, creado fuera de React
// para que los re-renderizados (y los efectos dobles de StrictMode) no lo
// reconstruyan.
let engine: BioEngine | null = null;
const getEngine = () => {
  if (!engine) {
    engine = new BioEngine();
    // Útil para inspeccionar el motor desde la consola en desarrollo.
    if (import.meta.env.DEV) (window as unknown as { engine: BioEngine }).engine = engine;
  }
  return engine;
};

const SPEEDS = [12.5, 25, 50];
const GAINS = [5, 10, 20];

export function App() {
  const eng = getEngine();
  const [state, setState] = useState<EngineState>(eng.state);
  const [ecg, setEcg] = useState<EcgSettings>(DEFAULT_ECG);
  const [noise, setNoise] = useState<NoiseSettings>(DEFAULT_NOISE);
  const [focusNoise, setFocusNoise] = useState<NoiseId | null>(null);
  const [amp, setAmp] = useState<AmpSettings>(DEFAULT_AMP);
  const [monitor, setMonitor] = useState<MonitorOptions>(DEFAULT_MONITOR);
  const [spectrum, setSpectrum] = useState<SpectrumOptions>(DEFAULT_SPECTRUM);

  useEffect(() => {
    const unsubscribe = eng.subscribe(setState);
    eng.play();
    return unsubscribe;
  }, [eng]);

  useEffect(() => eng.setEcg(ecg), [eng, ecg]);
  useEffect(() => eng.setNoise(noise), [eng, noise]);
  useEffect(() => eng.setAmp(amp), [eng, amp]);

  // Espacio: reproducir / pausar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, select, textarea, button, [role="slider"]')) return;
      e.preventDefault();
      eng.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eng]);

  const editEcg = (patch: Partial<EcgSettings>) => setEcg((s) => ({ ...s, ...patch }));
  const editMonitor = (patch: Partial<MonitorOptions>) => setMonitor((s) => ({ ...s, ...patch }));
  const editSpectrum = (patch: Partial<SpectrumOptions>) => setSpectrum((s) => ({ ...s, ...patch }));
  const band = focusNoise && noise.enabled ? noiseBand(focusNoise, noise) : null;

  return (
    <div className="app">
      <header className="header">
        <Logo />
        <h1>Bio Lab</h1>
        <span className="phase">Etapa 3: amplificador de instrumentación</span>
      </header>

      <ChainStrip />

      <div className="layout">
        <div className="views-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Monitor</h2>
              <button className="primary" onClick={() => eng.toggle()}>
                {state.playing ? 'Pausa' : 'Seguir'}
              </button>
            </div>
            <MonitorView engine={eng} options={monitor} />
            <div className="row view-options">
              <span className="switch-label">Velocidad</span>
              <Seg
                values={SPEEDS}
                value={monitor.speed}
                label={(v) => `${String(v).replace('.', ',')} mm/s`}
                onChange={(speed) => editMonitor({ speed })}
              />
              <span className="switch-label">Ganancia</span>
              <Seg
                values={GAINS}
                value={monitor.gain}
                label={(v) => `${v} mm/mV`}
                onChange={(gain) => editMonitor({ gain })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={monitor.labels}
                  onChange={(e) => editMonitor({ labels: e.target.checked })}
                />
                Marcar ondas
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={monitor.reference}
                  onChange={(e) => editMonitor({ reference: e.target.checked })}
                />
                <span className="swatch ref" />
                Referencia limpia
              </label>
            </div>
            <p className="muted small">
              Cuadrícula de papel ECG: cada cuadro chico es 1 mm y cada grande 5 mm. A 25 mm/s un
              cuadro grande son 0,2 s; a 10 mm/mV, dos cuadros grandes son 1 mV. En verde la salida
              de la cadena referida a la entrada (dividida por la ganancia), en gris el ECG limpio.
              Espacio pausa el monitor.
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Espectro</h2>
            </div>
            <SpectrumView engine={eng} options={spectrum} band={band} />
            <div className="row view-options">
              <span className="legend">
                <span className="swatch out" /> Con ruido
              </span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={spectrum.reference}
                  onChange={(e) => editSpectrum({ reference: e.target.checked })}
                />
                <span className="swatch ref" />
                Referencia limpia
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={spectrum.noise}
                  onChange={(e) => editSpectrum({ noise: e.target.checked })}
                />
                <span className="swatch noise" />
                Ruido solo
              </label>
            </div>
            <p className="muted small">
              Amplitud de cada frecuencia en los últimos 8 s, en dB respecto de 1 mV: una senoidal
              de 1 mV marca 0 dB y una de 0,1 mV, −20 dB. El ECG ocupa de 0,5 a 40 Hz. El SNR
              compara la potencia del ECG con la de todo el ruido sumado.
            </p>
          </section>
        </div>

        <div className="controls-col">
          <section className="panel">
            <div className="panel-head">
              <h2>Fuente: ECG sintético</h2>
              <button onClick={() => setEcg(DEFAULT_ECG)}>Restablecer</button>
            </div>
            <div className="knobs">
              <Knob
                label="Frecuencia"
                value={ecg.bpm}
                min={40}
                max={180}
                step={1}
                defaultValue={DEFAULT_ECG.bpm}
                format={fmt.bpm}
                onChange={(bpm) => editEcg({ bpm })}
              />
              <Knob
                label="Variabilidad"
                value={ecg.hrv}
                min={0}
                max={0.15}
                step={0.005}
                defaultValue={DEFAULT_ECG.hrv}
                format={fmt.pct}
                onChange={(hrv) => editEcg({ hrv })}
              />
              <Knob
                label="Amplitud R"
                value={ecg.amplitude}
                min={0.2}
                max={2.5}
                step={0.05}
                defaultValue={DEFAULT_ECG.amplitude}
                format={fmt.mv}
                onChange={(amplitude) => editEcg({ amplitude })}
              />
            </div>
            <p className="muted small">
              Cada latido es una suma de cinco gaussianas: la onda P (despolarización de las
              aurículas), el complejo QRS (de los ventrículos) y la onda T (repolarización). El QRS
              dura siempre lo mismo; P y T se acercan al R cuando sube la frecuencia, como el
              intervalo QT (fórmula de Bazett). La variabilidad cambia al azar cada intervalo RR,
              como en un corazón real, y los cambios de frecuencia afectan sólo a los latidos
              siguientes.
            </p>
          </section>

          <NoisePanel settings={noise} onChange={setNoise} onFocusNoise={setFocusNoise} />

          <AmpPanel engine={eng} settings={amp} onChange={setAmp} />
        </div>
      </div>
    </div>
  );
}

function Seg<T extends number>({
  values,
  value,
  label,
  onChange,
}: {
  values: T[];
  value: T;
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {values.map((v) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label(v)}
        </button>
      ))}
    </div>
  );
}
