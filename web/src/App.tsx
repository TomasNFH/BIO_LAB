import { useEffect, useRef, useState } from 'react';
import { BioEngine, type EngineState, type SourceKind } from './engine/BioEngine';
import { BRANCHES, type Branch, type ChainSettings } from './engine/chain';
import type { EcgSettings } from './engine/ecg';
import type { EmgSettings } from './engine/emg';
import type { EogSettings } from './engine/eog';
import { DEFAULT_NOISE, DEFAULT_NOISE_EMG, DEFAULT_NOISE_EOG, DEFAULT_NOISE_REC, noiseBand, type NoiseId, type NoiseSettings } from './engine/noise';
import { AdcPanel } from './components/AdcPanel';
import { AmpPanel } from './components/AmpPanel';
import { DrlPanel } from './components/DrlPanel';
import { ChainView, type Selection } from './components/ChainView';
import { FilterPanel } from './components/FilterPanel';
import { Logo } from './components/Logo';
import { MetricsTable } from './components/MetricsTable';
import { Help, Popover } from './components/Help';
import { NoisePanel } from './components/NoisePanel';
import { NotchPanel } from './components/NotchPanel';
import { DigitalLpPanel, ThresholdPanel } from './components/DigitalPanel';
import { Eyes } from './components/Eyes';
import { bandOf, withBand } from './components/bands';
import { OutputDock, OutputPanel } from './components/OutputPanel';
import type { OutputSettings } from './output';
import { PresetPanel } from './components/PresetPanel';
import { SourcePanel } from './components/SourcePanel';
import { BUILTIN_PRESETS, type LabSettings } from './lab';
import type { Recording } from './engine/recording';
import { DEFAULT_MONITOR, MonitorView, type MonitorOptions } from './views/MonitorView';
import { BodeView } from './views/BodeView';
import { QrsView } from './views/QrsView';
import { Theory } from './views/Theory';
import { DEFAULT_SPECTRUM, SpectrumView, type SpectrumOptions } from './views/SpectrumView';
import { DEFAULT_STAGES, StagesView, type StagesOptions } from './views/StagesView';

// Un solo motor durante toda la vida de la página, creado fuera de React
// para que los re-renderizados (y los efectos dobles de StrictMode) no lo
// reconstruyan.
let engine: BioEngine | null = null;
// El laboratorio arranca con el primer experimento (el autito con la mirada).
const START: LabSettings = structuredClone(BUILTIN_PRESETS[0].settings);

// El EOG es más chico que el ECG y no tiene ondas que marcar: ganancia y
// marcas del monitor según la fuente.
const monitorFor = (s: SourceKind, m: MonitorOptions): MonitorOptions => ({ ...m, gain: s === 'eog' ? 20 : 10, labels: s === 'ecg' || s === 'rec' });

const getEngine = () => {
  if (!engine) {
    engine = new BioEngine();
    // Útil para inspeccionar el motor desde la consola en desarrollo.
    if (import.meta.env.DEV) (window as unknown as { engine: BioEngine }).engine = engine;
  }
  return engine;
};

const SPEEDS = [12.5, 25, 50];
const GAINS = [5, 10, 20, 50];
const STAGE_RANGES = [1, 2, 5, 20];

// Pestañas del encabezado: el laboratorio y la teoría.
type Page = 'lab' | 'theory';
const PAGES: { id: Page; label: string }[] = [
  { id: 'lab', label: 'Laboratorio' },
  { id: 'theory', label: 'Fundamentos' },
];

type ViewTab = 'spectrum' | 'bode' | 'stages' | 'qrs';
// Explicaciones de cada vista, en el «?» de su panel.
const HELP: Record<ViewTab | 'monitor', string> = {
  monitor: 'Cuadrícula de papel ECG: cada cuadro chico es 1 mm y cada grande 5 mm. A 25 mm/s un cuadro grande son 0,2 s; a 10 mm/mV, dos cuadros grandes son 1 mV. Con el EOG, la escala de la derecha está en grados de mirada. La salida está referida a la entrada (dividida por la ganancia); en gris la señal limpia. Espacio pausa el monitor y B cambia de rama. Las métricas comparan cada rama con la señal limpia en los últimos 8 s. Con la etapa digital prendida, en violeta va la señal tras el pasa bajos digital, los niveles del umbral son líneas punteadas y arriba se ve su salida: una rayita por pulso o el escalón izquierda/centro/derecha.',
  spectrum: 'Amplitud de cada frecuencia en los últimos 8 s, en dB respecto de 1 mV: una senoidal de 1 mV marca 0 dB y una de 0,1 mV, −20 dB. El ECG ocupa de 0,5 a 40 Hz. El ruido solo es la salida menos el ECG limpio: incluye también la deformación y el retardo de los filtros. La salida es la del ADC: por encima de su frecuencia de Nyquist (zona sombreada) no hay información nueva, sólo copias que deja el retenedor, y lo que había allí antes del ADC aparece doblado por debajo.',
  bode: 'Módulo (arriba) y fase (abajo) de los filtros, calculados desde sus componentes. Los puntos son la respuesta medida sobre la señal: el espectro después de los filtros (antes del ADC) dividido por el de antes de los filtros. Si coinciden con la curva, los filtros hacen lo que dice la teoría. Cada fc está donde la curva cruza −3 dB. Por debajo de 1 Hz los puntos son menos fiables: 8 s de señal tienen pocos ciclos y la deriva fuerte de la respiración se derrama a las frecuencias vecinas.',
  qrs: 'El detector de Pan y Tompkins (1985) trabaja sobre la salida de la rama, como lo haría el equipo. El pasa banda deja la energía del QRS; la derivada resalta sus pendientes; el cuadrado deja todo positivo y agranda lo grande; la integración en 150 ms deja un lomo por latido. Es QRS lo que pasa el umbral (línea de puntos), que se adapta solo a los picos de señal y de ruido. Nada cuenta en los 200 ms después de un QRS; un pico lento antes de 360 ms es una onda T; y si pasa demasiado sin detectar, vuelve a buscar con la mitad del umbral (triángulo hueco en el monitor). Cada fila tiene su propia escala. El bloque «Umbral» de la etapa digital es la versión mínima de esta idea: un nivel fijo y un refractario.',
  stages: 'La señal en cada punto de la cadena, todas con la misma escala. Se ve qué quita cada bloque: el amplificador, el modo común; el pasa altos, el offset y la deriva; el pasa bajos, el ruido rápido; el notch, la red. Si la etapa digital está prendida, aparecen también la señal tras el pasa bajos digital y la salida del umbral (lógica: 0 y 1, o −1, 0 y +1, con su propia escala).',
};

const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'spectrum', label: 'Espectro' },
  { id: 'bode', label: 'Bode' },
  { id: 'stages', label: 'Etapas' },
  { id: 'qrs', label: 'Detector QRS' },
];

export function App() {
  const eng = getEngine();
  const [state, setState] = useState<EngineState>(eng.state);
  const [source, setSource] = useState<SourceKind>(START.source);
  const [ecg, setEcg] = useState<EcgSettings>(START.ecg);
  const [eog, setEog] = useState<EogSettings>(START.eog);
  const [emg, setEmg] = useState<EmgSettings>(START.emg);
  // Registro real: vive sólo en esta página (no va en los ajustes guardados).
  const [recording, setRecording] = useState<Recording | null>(null);
  const [recChannel, setRecChannel] = useState(0);
  // Cada fuente tiene su propio juego de ruidos.
  const [noises, setNoises] = useState<Record<SourceKind, NoiseSettings>>(START.noises);
  const noise = noises[source];
  const setNoise = (n: NoiseSettings) => setNoises((all) => ({ ...all, [source]: n }));
  const [focusNoise, setFocusNoise] = useState<NoiseId | null>(null);
  const [chains, setChains] = useState<Record<Branch, ChainSettings>>(START.chains);
  const [output, setOutput] = useState<OutputSettings>(START.output);
  // La rama que se edita en los paneles y se muestra en las vistas.
  const [branch, setBranch] = useState<Branch>('a');
  // El bloque de la cadena cuyo panel está abierto (uno por vez).
  const [selection, setSelection] = useState<Selection>('source');
  const [page, setPage] = useState<Page>('lab');
  const [view, setView] = useState<ViewTab>('spectrum');
  const [stages, setStages] = useState<StagesOptions>(DEFAULT_STAGES);
  const [monitor, setMonitor] = useState<MonitorOptions>(() => monitorFor(START.source, DEFAULT_MONITOR));
  const [spectrum, setSpectrum] = useState<SpectrumOptions>(DEFAULT_SPECTRUM);

  useEffect(() => {
    const unsubscribe = eng.subscribe(setState);
    eng.play();
    return unsubscribe;
  }, [eng]);

  useEffect(() => eng.setSource(source), [eng, source]);
  useEffect(() => eng.setEcg(ecg), [eng, ecg]);
  useEffect(() => eng.setEog(eog), [eng, eog]);
  useEffect(() => eng.setEmg(emg), [eng, emg]);
  useEffect(() => eng.setRecording(recording, recChannel), [eng, recording, recChannel]);
  useEffect(() => eng.setNoise(noise), [eng, noise]);
  useEffect(() => {
    for (const b of BRANCHES) eng.setChain(b, chains[b]);
  }, [eng, chains]);

  // Espacio: reproducir / pausar. B: cambiar de rama.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : document.body;
      if (target.closest('input, select, textarea')) return;
      if (e.code === 'KeyB') {
        setBranch((b) => (b === 'a' ? 'b' : 'a'));
        return;
      }
      if (e.code !== 'Space' || target.closest('button, [role="slider"]')) return;
      e.preventDefault();
      eng.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eng]);

  // El EOG es más chico que el ECG y no tiene ondas que marcar: al cambiar de
  // fuente se ajustan la ganancia y las marcas del monitor.
  const changeSource = (s: SourceKind) => {
    setSource(s);
    if (s !== 'ecg' && s !== 'rec') setView((v) => (v === 'qrs' ? 'spectrum' : v));
    setMonitor((m) => monitorFor(s, m));
  };

  // El ajuste completo, para guardarlo, y cómo cargar uno.
  const current: LabSettings = { source, ecg, eog, emg, noises, chains, output };
  const applyLab = (s: LabSettings) => {
    changeSource(s.source);
    setEcg(s.ecg);
    setEog(s.eog);
    setEmg(s.emg);
    setNoises(s.noises);
    setChains(s.chains);
    setOutput(s.output);
  };
  // Al abrir un bloque, si su panel quedó abajo de la ventana, se lleva a la
  // vista (la columna de las vistas queda fija, así que no se pierde nada).
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollPending = useRef(false);
  const select = (sel: Selection) => {
    setSelection(sel);
    if (typeof sel === 'object') setBranch(sel.branch);
    scrollPending.current = true;
  };
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    const top = panelRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight - 160) window.scrollBy({ top: top - 90, behavior: 'smooth' });
  }, [selection]);
  useEffect(() => {
    setSelection((sel) => (typeof sel === 'object' && sel.branch !== branch ? { ...sel, branch } : sel));
  }, [branch]);
  const block = typeof selection === 'object' ? selection.block : null;
  const editMonitor = (patch: Partial<MonitorOptions>) => setMonitor((s) => ({ ...s, ...patch }));
  const editSpectrum = (patch: Partial<SpectrumOptions>) => setSpectrum((s) => ({ ...s, ...patch }));
  const setChain = (b: Branch, s: ChainSettings) => setChains((c) => ({ ...c, [b]: s }));
  const editChain = (patch: Partial<ChainSettings>) => setChain(branch, { ...chains[branch], ...patch });
  const band = focusNoise && noise.enabled ? noiseBand(focusNoise, noise) : null;
  const chain = chains[branch];
  const other = branch === 'a' ? 'B' : 'A';

  return (
    <div className="app">
      <header className="header">
        <Logo />
        <h1 className="wordmark" aria-label="Bio Lab">
          <span aria-hidden="true">bi<span className="dot-o">o</span> lab</span>
        </h1>
        {page === 'lab' && source === 'eog' && eog.mode === 'interactive' && <Eyes engine={eng} amplitude={eog.amplitude} />}
        <nav className="tabs page-tabs" role="tablist" aria-label="Secciones">
          {PAGES.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={page === p.id}
              className={`tab ${page === p.id ? 'on' : ''}`}
              onClick={() => setPage(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      {page === 'theory' && <Theory />}

      {/* El laboratorio queda montado (oculto) para no perder su estado. */}
      <div className="layout" hidden={page !== 'lab'}>
        <div className="views-col">
          <section className="panel monitor-panel">
            {/* Título sobre las métricas; ajustes y botones centrados sobre el trazo. */}
            <div className="monitor-body">
              <div className="monitor-title">
                <h2>Monitor</h2>
                <Help label="Ayuda del monitor">{HELP.monitor}</Help>
              </div>
              <div className="monitor-controls">
                <select
                  className="compact"
                  aria-label="Velocidad de barrido"
                  value={monitor.speed}
                  onChange={(e) => editMonitor({ speed: Number(e.target.value) })}
                >
                  {SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {String(v).replace('.', ',')} mm/s
                    </option>
                  ))}
                </select>
                <select
                  className="compact"
                  aria-label="Ganancia del monitor"
                  value={monitor.gain}
                  onChange={(e) => editMonitor({ gain: Number(e.target.value) })}
                >
                  {GAINS.map((v) => (
                    <option key={v} value={v}>
                      {v} mm/mV
                    </option>
                  ))}
                </select>
                <Popover trigger="Capas" label="Qué dibujar en el monitor" className="menu">
                  {(source === 'ecg' || source === 'rec') && (
                    <label className="check">
                      <input type="checkbox" checked={monitor.labels} onChange={(e) => editMonitor({ labels: e.target.checked })} />
                      Marcar ondas
                    </label>
                  )}
                  <Check
                    checked={monitor.reference}
                    onChange={(reference) => editMonitor({ reference })}
                    swatch="ref"
                    label="Referencia limpia"
                  />
                  <Check
                    checked={monitor.other}
                    onChange={(other) => editMonitor({ other })}
                    swatch={branch === 'a' ? 'branch-b' : 'branch-a'}
                    label={`Rama ${other}`}
                  />
                  {(source === 'ecg' || source === 'rec') && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={monitor.detections}
                        onChange={(e) => editMonitor({ detections: e.target.checked })}
                      />
                      Marcar QRS detectados
                    </label>
                  )}
                  {source === 'emg' && (
                    <Check
                      checked={monitor.envelope}
                      onChange={(envelope) => editMonitor({ envelope })}
                      swatch="noise"
                      label="Envolvente"
                    />
                  )}
                  <label className="check">
                    <input type="checkbox" checked={monitor.samples} onChange={(e) => editMonitor({ samples: e.target.checked })} />
                    Marcar muestras del ADC
                  </label>
                </Popover>
                <button className="primary" onClick={() => eng.toggle()}>
                  {state.playing ? 'Pausa' : 'Seguir'}
                </button>
                <div className="seg branch-seg">
                  {BRANCHES.map((b) => (
                    <button key={b} className={`${b} ${branch === b ? 'on' : ''}`} onClick={() => setBranch(b)}>
                      {b.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <MetricsTable engine={eng} source={source} />
              <MonitorView engine={eng} options={monitor} branch={branch} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="tabs" role="tablist">
                {VIEW_TABS.filter((t) => t.id !== 'qrs' || source === 'ecg' || source === 'rec').map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={view === t.id}
                    className={`tab ${view === t.id ? 'on' : ''}`}
                    onClick={() => setView(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Help label="Ayuda de la vista">{HELP[view]}</Help>
            </div>
            {view === 'spectrum' && (
              <>
                <SpectrumView engine={eng} options={spectrum} band={band} branch={branch} />
                <div className="row view-options">
                  <span className="legend">
                    <span className={`swatch branch-${branch}`} /> Rama {branch.toUpperCase()}
                  </span>
                  <Check
                    checked={spectrum.other}
                    onChange={(other) => editSpectrum({ other })}
                    swatch={branch === 'a' ? 'branch-b' : 'branch-a'}
                    label={`Rama ${other}`}
                  />
                  <Check
                    checked={spectrum.beforeFilters}
                    onChange={(beforeFilters) => editSpectrum({ beforeFilters })}
                    swatch="before"
                    label="Antes de los filtros"
                  />
                  <Check
                    checked={spectrum.reference}
                    onChange={(reference) => editSpectrum({ reference })}
                    swatch="ref"
                    label="Referencia limpia"
                  />
                  <Check
                    checked={spectrum.noise}
                    onChange={(noise) => editSpectrum({ noise })}
                    swatch="noise"
                    label="Ruido solo"
                  />
                </div>
              </>
            )}
            {view === 'bode' && (
              <>
                <BodeView engine={eng} branch={branch} settings={chain} />
                <div className="row view-options">
                  <span className="legend">
                    <span className={`swatch branch-${branch}`} /> Todos (rama {branch.toUpperCase()})
                  </span>
                  <span className="legend">
                    <span className="swatch hp dashed" /> Pasa altos
                  </span>
                  <span className="legend">
                    <span className="swatch lp dashed" /> Pasa bajos
                  </span>
                  <span className="legend">
                    <span className="swatch notch dashed" /> Notch
                  </span>
                  <span className="legend">
                    <span className="swatch measured" /> Medido
                  </span>
                </div>
              </>
            )}
            {view === 'qrs' && (source === 'ecg' || source === 'rec') && (
              <>
                <QrsView engine={eng} branch={branch} />
              </>
            )}
            {view === 'stages' && (
              <>
                <StagesView engine={eng} options={stages} branch={branch} />
                <div className="row view-options">
                  <span className="switch-label">Escala</span>
                  <Seg
                    values={STAGE_RANGES}
                    value={stages.range}
                    label={(v) => `±${v} mV`}
                    onChange={(range) => setStages((s) => ({ ...s, range }))}
                  />
                  <Check
                    checked={stages.reference}
                    onChange={(reference) => setStages((s) => ({ ...s, reference }))}
                    swatch="ref"
                    label="Referencia limpia"
                  />
                </div>
              </>
            )}
          </section>
        </div>

        <div className="controls-col">
          <ChainView
            selection={selection}
            onSelect={select}
            branch={branch}
            chains={chains}
            onChain={setChain}
            source={source}
            ecg={ecg}
            eog={eog}
            emg={emg}
            recording={recording}
            noise={noise}
            onNoise={setNoise}
            output={output}
          />

          <div ref={panelRef} className="ch-panel">
            {selection === 'presets' && <PresetPanel engine={eng} current={current} onApply={applyLab} />}

            {selection === 'source' && (
              <SourcePanel
                source={source}
                onSource={changeSource}
                ecg={ecg}
                onEcg={setEcg}
                eog={eog}
                onEog={setEog}
                emg={emg}
                onEmg={setEmg}
                recording={recording}
                recChannel={recChannel}
                onRecording={(r) => {
                  setRecording(r);
                  setRecChannel(0);
                }}
                onRecChannel={setRecChannel}
              />
            )}

            {selection === 'noise' && (
              <NoisePanel
                settings={noise}
                defaults={{ ecg: DEFAULT_NOISE, eog: DEFAULT_NOISE_EOG, emg: DEFAULT_NOISE_EMG, rec: DEFAULT_NOISE_REC }[source]}
                onChange={setNoise}
                onFocusNoise={setFocusNoise}
              />
            )}

            {block === 'amp' && (
              <AmpPanel
                engine={eng}
                branch={branch}
                settings={chain.amp}
                onChange={(amp) => editChain({ amp })}
                postGain={chain.post.gain}
                onPostGain={(gain) => editChain({ post: { gain } })}
              />
            )}

            {block === 'drl' && (
              <DrlPanel
                engine={eng}
                branch={branch}
                settings={chain.drl}
                onChange={(drl) => editChain({ drl })}
                cm0={noise.enabled && noise.mains.on ? noise.mains.common * (noise.mains.harmonics ? 1.5 : 1) : 0}
                swing={chain.amp.supply - 1}
              />
            )}

            {block === 'hp' && <FilterPanel kind="hp" settings={chain.hp} onChange={(hp) => editChain({ hp })} chain={chain} band={bandOf(chain)} onBand={(i) => setChain(branch, withBand(chain, i))} />}

            {block === 'lp' && <FilterPanel kind="lp" settings={chain.lp} onChange={(lp) => editChain({ lp })} chain={chain} band={bandOf(chain)} onBand={(i) => setChain(branch, withBand(chain, i))} />}

            {block === 'notch' && <NotchPanel settings={chain.notch} onChange={(notch) => editChain({ notch })} />}

            {block === 'dlp' && <DigitalLpPanel chain={chain} onChange={(dsp) => editChain({ dsp })} />}

            {block === 'thr' && (
              <ThresholdPanel
                engine={eng}
                branch={branch}
                chain={chain}
                source={source}
                eogSensitivity={eog.sensitivity}
                onChange={(dsp) => editChain({ dsp })}
              />
            )}

            {selection === 'output' && (
              <OutputPanel branch={branch} chain={chain} onChain={(s) => setChain(branch, s)} source={source} output={output} onOutput={setOutput} />
            )}

            {block === 'adc' && (
              <AdcPanel engine={eng} branch={branch} chain={chain} onChange={(adc) => editChain({ adc })} />
            )}
          </div>
        </div>
      </div>

      {/* Contador de pulso o autito: siempre a la vista, abajo y al centro. */}
      {page === 'lab' && <OutputDock
        engine={eng}
        branch={branch}
        chain={chain}
        source={source}
        ecgBpm={ecg.bpm}
        output={output}
        onOutput={setOutput}
        onOpenSettings={() => select('output')}
      />}
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

function Check({
  checked,
  onChange,
  swatch,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  swatch: string;
  label: string;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`swatch ${swatch}`} />
      {label}
    </label>
  );
}
