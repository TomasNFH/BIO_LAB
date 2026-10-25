// La cadena de adquisición completa. Los bloques que todavía no están
// hechos aparecen apagados hasta su etapa.
const BLOCKS: { label: string; stage: number }[] = [
  { label: 'Fuente ECG / EOG', stage: 1 },
  { label: 'Ruido', stage: 2 },
  { label: 'Amp. de instrumentación', stage: 3 },
  { label: 'Pasa altos', stage: 4 },
  { label: 'Pasa bajos', stage: 4 },
  { label: 'Notch', stage: 5 },
  { label: 'ADC', stage: 6 },
  { label: 'Monitor', stage: 1 },
];

const CURRENT_STAGE = 7;

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
