// La cadena de adquisición completa. Por ahora sólo la fuente y el
// monitor están hechos; el resto aparece apagado hasta su etapa.
const BLOCKS: { label: string; stage: number }[] = [
  { label: 'Fuente ECG', stage: 1 },
  { label: 'Ruido', stage: 2 },
  { label: 'Amp. de instrumentación', stage: 3 },
  { label: 'Pasa altos', stage: 4 },
  { label: 'Pasa bajos', stage: 4 },
  { label: 'Notch', stage: 5 },
  { label: 'ADC', stage: 6 },
  { label: 'Monitor', stage: 1 },
];

const CURRENT_STAGE = 1;

export function ChainStrip() {
  return (
    <ol className="chain" aria-label="Cadena de adquisición">
      {BLOCKS.map((b) => {
        const ready = b.stage <= CURRENT_STAGE;
        return (
          <li
            key={b.label}
            className={ready ? 'on' : ''}
            title={ready ? undefined : `Llega en la etapa ${b.stage}`}
          >
            <span>{b.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
