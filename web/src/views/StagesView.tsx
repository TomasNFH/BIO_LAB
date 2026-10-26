import type { BioEngine, TestPoint } from '../engine/BioEngine';
import type { Branch } from '../engine/chain';
import { dec } from '../components/Knob';
import { BRANCH_COLORS, COLORS, font, useCanvasLoop } from './canvas';

export type StagesOptions = {
  range: number; // mV desde el centro hasta el borde de cada fila
  reference: boolean;
};

export const DEFAULT_STAGES: StagesOptions = { range: 2, reference: true };

type Row = { point: TestPoint; label: string; logic?: boolean };

const ROWS: Row[] = [
  { point: 'input', label: 'Entrada diferencial (V+ − V−)' },
  { point: 'amp', label: 'Amplificador (referido a la entrada)' },
  { point: 'hp', label: 'Tras el pasa altos' },
  { point: 'lp', label: 'Tras el pasa bajos' },
  { point: 'notch', label: 'Tras el notch' },
  { point: 'out', label: 'ADC (salida)' },
];

const SECONDS = 5;

// La señal en cada punto de prueba de la cadena, una fila por etapa, todas
// con la misma escala para que la comparación sea honesta. Los últimos 5 s,
// lo más nuevo a la derecha.
export function StagesView({ engine, options, branch }: { engine: BioEngine; options: StagesOptions; branch: Branch }) {
  const ref = useCanvasLoop((g, w, h) => {
    const fs = engine.fs;
    const end = engine.sampleCount;
    const start = Math.max(engine.oldest, end - SECONDS * fs);
    // Las filas de la etapa digital aparecen cuando sus bloques trabajan.
    const chain = engine.chains[branch];
    const dsp = chain.dsp.config;
    const rows: Row[] = [...ROWS];
    if (chain.adc.on && dsp.lp.on) rows.push({ point: 'dlp', label: 'Tras el pasa bajos digital' });
    if (chain.adc.on && dsp.thr.on) {
      const label = dsp.thr.mode === 'one' ? 'Umbral (salida lógica: 0 o 1)' : 'Umbral (izquierda −1 · centro 0 · derecha +1)';
      rows.push({ point: 'thr', label, logic: true });
    }
    // Abajo queda lugar para la leyenda de la escala.
    const rowH = (h - 14) / rows.length;
    const xOf = (i: number) => ((i - (end - SECONDS * fs)) / (SECONDS * fs)) * w;

    rows.forEach(({ point, label, logic }, r) => {
      const top = r * rowH;
      const mid = top + rowH / 2;
      const half = rowH / 2 - 4;
      // La salida del umbral no está en mV: 1 ocupa casi media fila.
      const yOf = (v: number) => mid - (logic ? v * 0.7 : v / options.range) * half;

      // Marco de la fila, línea de 0 y marcas de 1 s.
      g.strokeStyle = COLORS.grid;
      g.lineWidth = 1;
      g.beginPath();
      if (r) {
        g.moveTo(0, Math.round(top) + 0.5);
        g.lineTo(w, Math.round(top) + 0.5);
      }
      for (let s = 1; s < SECONDS; s++) {
        const x = Math.round((s / SECONDS) * w) + 0.5;
        g.moveTo(x, top);
        g.lineTo(x, top + rowH);
      }
      g.stroke();
      g.strokeStyle = COLORS.gridStrong;
      g.beginPath();
      g.moveTo(0, Math.round(mid) + 0.5);
      g.lineTo(w, Math.round(mid) + 0.5);
      g.stroke();

      g.save();
      g.beginPath();
      g.rect(0, top, w, rowH);
      g.clip();
      const trace = (tp: TestPoint, color: string, width: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        for (let i = start; i < end; i++) {
          const x = xOf(i);
          const y = yOf(engine.tapAt(tp, i, branch));
          if (i === start) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      };
      if (options.reference && !logic) trace('clean', COLORS.reference, 1);
      trace(point, BRANCH_COLORS[branch], 1.3);
      g.restore();

      g.font = font(11);
      g.fillStyle = COLORS.label;
      g.fillText(label, 6, top + 14);

      // Si la señal está fuera de la fila, avisar hacia dónde y cuánto.
      if (end > start) {
        const v = engine.tapAt(point, end - 1, branch);
        if (!logic && Math.abs(v) > options.range) {
          g.font = font(11, 600);
          g.fillStyle = COLORS.warning;
          g.textAlign = 'right';
          g.fillText(`${v > 0 ? '↑' : '↓'} ${dec(v, 1)} mV`, w - 6, top + 14);
          g.textAlign = 'left';
        }
      }
    });

    g.font = font(10);
    g.fillStyle = COLORS.label;
    g.fillText(`Rama ${branch.toUpperCase()} · ±${options.range} mV por fila · 1 s por división`, 6, h - 4);
  });

  return <canvas ref={ref} className="view-canvas stages" aria-label="Señal en cada etapa de la cadena" />;
}
