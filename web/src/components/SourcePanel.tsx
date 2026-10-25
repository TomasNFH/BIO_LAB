import type { SourceKind } from '../engine/BioEngine';
import { DEFAULT_ECG, type EcgSettings } from '../engine/ecg';
import { DEFAULT_EMG, EMG_PATTERNS, type EmgPattern, type EmgSettings } from '../engine/emg';
import { DEFAULT_EOG, PATTERNS, type EogPattern, type EogSettings } from '../engine/eog';
import { dec, fmt, Knob } from './Knob';

type Props = {
  source: SourceKind;
  onSource: (s: SourceKind) => void;
  ecg: EcgSettings;
  onEcg: (s: EcgSettings) => void;
  eog: EogSettings;
  onEog: (s: EogSettings) => void;
  emg: EmgSettings;
  onEmg: (s: EmgSettings) => void;
};

const SOURCES: { id: SourceKind; label: string }[] = [
  { id: 'ecg', label: 'ECG' },
  { id: 'eog', label: 'EOG' },
  { id: 'emg', label: 'EMG' },
];

// Fuente de la señal: ECG, EOG o EMG sintéticos, cada uno con sus perillas.
export function SourcePanel({ source, onSource, ecg, onEcg, eog, onEog, emg, onEmg }: Props) {
  const editEcg = (patch: Partial<EcgSettings>) => onEcg({ ...ecg, ...patch });
  const editEog = (patch: Partial<EogSettings>) => onEog({ ...eog, ...patch });
  const editEmg = (patch: Partial<EmgSettings>) => onEmg({ ...emg, ...patch });
  const reset = () => (source === 'ecg' ? onEcg(DEFAULT_ECG) : source === 'eog' ? onEog(DEFAULT_EOG) : onEmg(DEFAULT_EMG));

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Fuente</h2>
        <div className="seg">
          {SOURCES.map((x) => (
            <button key={x.id} className={source === x.id ? 'on' : ''} onClick={() => onSource(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <button onClick={reset}>Restablecer</button>
      </div>

      {source === 'ecg' ? (
        <>
          <div className="knobs">
            <Knob label="Frecuencia" value={ecg.bpm} min={40} max={180} step={1} defaultValue={DEFAULT_ECG.bpm} format={fmt.bpm} onChange={(bpm) => editEcg({ bpm })} />
            <Knob label="Variabilidad" value={ecg.hrv} min={0} max={0.15} step={0.005} defaultValue={DEFAULT_ECG.hrv} format={fmt.pct} onChange={(hrv) => editEcg({ hrv })} />
            <Knob label="Amplitud R" value={ecg.amplitude} min={0.2} max={2.5} step={0.05} defaultValue={DEFAULT_ECG.amplitude} format={fmt.mv} onChange={(amplitude) => editEcg({ amplitude })} />
            <Knob label="Desnivel ST" value={ecg.st} min={-0.4} max={0.4} step={0.01} defaultValue={DEFAULT_ECG.st} format={(v) => `${v > 0 ? '+' : ''}${dec(v, 2)} mV`} onChange={(st) => editEcg({ st })} />
          </div>
          <p className="muted small">
            Electrocardiograma: cada latido es una suma de cinco gaussianas, la onda P
            (despolarización de las aurículas), el complejo QRS (de los ventrículos) y la onda T
            (repolarización). El QRS dura siempre lo mismo; P y T se acercan al R cuando sube la
            frecuencia, como el intervalo QT (fórmula de Bazett). La variabilidad cambia al azar
            cada intervalo RR, como en un corazón real. El desnivel ST eleva o deprime el segmento
            entre el QRS y la T, como en un infarto o una isquemia: es lo que un pasa altos mal
            elegido deforma.
          </p>
        </>
      ) : source === 'eog' ? (
        <>
          <div className="switch-rows">
            <span className="switch-label">Movimiento de los ojos</span>
            <div className="seg">
              {(Object.keys(PATTERNS) as EogPattern[]).map((p) => (
                <button key={p} className={eog.pattern === p ? 'on' : ''} onClick={() => editEog({ pattern: p })}>
                  {PATTERNS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="knobs">
            <Knob label="Sensibilidad" value={eog.sensitivity} min={5} max={30} step={1} defaultValue={DEFAULT_EOG.sensitivity} format={(v) => `${v} µV/°`} onChange={(sensitivity) => editEog({ sensitivity })} />
            <Knob label="Ángulo máx." value={eog.amplitude} min={5} max={40} step={1} defaultValue={DEFAULT_EOG.amplitude} format={(v) => `±${v}°`} onChange={(amplitude) => editEog({ amplitude })} />
            <Knob label="Fijación" value={eog.fixation} min={0.3} max={4} step={0.1} defaultValue={DEFAULT_EOG.fixation} format={(v) => `${dec(v, 1)} s`} onChange={(fixation) => editEog({ fixation })} />
            <Knob label="Parpadeos" value={eog.blinks} min={0} max={30} step={1} defaultValue={DEFAULT_EOG.blinks} format={(v) => `${v}/min`} onChange={(blinks) => editEog({ blinks })} />
          </div>
          <p className="muted small">
            Electrooculograma horizontal: el ojo es un dipolo (la córnea es positiva respecto de la
            retina), así que la tensión entre un electrodo a cada lado de los ojos es proporcional
            al ángulo de la mirada. Las sacadas son saltos rápidos (más largos cuanto más grandes) y
            entre ellas la mirada se queda quieta: eso es una tensión continua. Por eso el EOG se
            registra con acople en continua o con un pasa altos muy bajo, y un pasa altos de ECG lo
            arruina: cada fijación se desvanece hacia cero.
          </p>
        </>
      ) : (
        <>
          <div className="switch-rows">
            <span className="switch-label">Contracción</span>
            <div className="seg">
              {(Object.keys(EMG_PATTERNS) as EmgPattern[]).map((p) => (
                <button key={p} className={emg.pattern === p ? 'on' : ''} onClick={() => editEmg({ pattern: p })}>
                  {EMG_PATTERNS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="knobs">
            <Knob label="Esfuerzo" value={emg.level} min={0.05} max={1} step={0.05} defaultValue={DEFAULT_EMG.level} format={fmt.pct} onChange={(level) => editEmg({ level })} />
            <Knob label="Período" value={emg.period} min={1} max={10} step={0.5} defaultValue={DEFAULT_EMG.period} format={(v) => `${dec(v, 1)} s`} onChange={(period) => editEmg({ period })} />
            <Knob label="Unidades" value={emg.units} min={20} max={200} step={10} defaultValue={DEFAULT_EMG.units} format={(v) => `${v}`} onChange={(units) => editEmg({ units })} />
            <Knob label="MUAP máx." value={emg.amplitude} min={0.1} max={2} step={0.05} defaultValue={DEFAULT_EMG.amplitude} format={fmt.mv} onChange={(amplitude) => editEmg({ amplitude })} />
          </div>
          <p className="muted small">
            Electromiograma de superficie: la suma de los potenciales de acción de las unidades
            motoras (una neurona y las fibras que mueve). Al subir el esfuerzo se suman unidades,
            de las chicas a las grandes, y cada una dispara más seguido (de 8 a 35 veces por
            segundo). Queda una señal parecida a ruido, de 20 a 450 Hz, que crece con la fuerza.
            Necesita lo contrario que el ECG: un pasa altos de unos 20 Hz para sacar el movimiento,
            un pasa bajos de 450 Hz y un ADC de al menos 1 kHz. El período vale para la rampa y las
            ráfagas; MUAP máx. es el pico de la unidad más grande.
          </p>
        </>
      )}
    </section>
  );
}
