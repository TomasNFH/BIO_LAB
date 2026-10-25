import type { BioEngine } from '../engine/BioEngine';
import type { Branch } from '../engine/chain';
import type { QrsPoint } from '../engine/qrs';
import { BRANCH_COLORS, COLORS, useCanvasLoop } from './canvas';

const ROWS: { point: QrsPoint; label: string }[] = [
  { point: 'x', label: 'Salida de la cadena (entrada del detector)' },
  { point: 'bp', label: '1. Pasa banda 5–15 Hz' },
  { point: 'der', label: '2. Derivada' },
  { point: 'sq', label: '3. Al cuadrado' },
  { point: 'int', label: '4. Integrada en 150 ms y umbral' },
];

const SECONDS = 5;

// Las etapas del detector de Pan-Tompkins de una rama, una fila por etapa.
// Cada fila tiene su propia escala (las unidades son distintas). En la
// última, la línea de puntos es el umbral adaptativo; las marcas verticales
// son los QRS detectados.
export function QrsView({ engine, branch }: { engine: BioEngine; branch: Branch }) {
  const ref = useCanvasLoop((g, w, h) => {
    const qrs = engine.qrs[branch];
    const fs = engine.fs;
    const end = engine.sampleCount;
    const start = Math.max(engine.oldest, end - SECONDS * fs);
    const rowH = h / ROWS.length;
    const xOf = (i: number) => ((i - (end - SECONDS * fs)) / (SECONDS * fs)) * w;
    const color = BRANCH_COLORS[branch];
    const found = qrs.detectionsBetween(start, end);

    ROWS.forEach(({ point, label }, r) => {
      const top = r * rowH;
      const positive = point === 'sq' || point === 'int';
      // Escala de la fila: el máximo de la ventana (con el umbral, si está).
      let max = 1e-12;
      for (let i = start; i < end; i++) {
        max = Math.max(max, Math.abs(qrs.tapAt(point, i)));
        if (point === 'int') max = Math.max(max, qrs.tapAt('thr', i));
      }
      const base = positive ? top + rowH - 6 : top + rowH / 2;
      const span = positive ? rowH - 22 : rowH / 2 - 12;
      const yOf = (v: number) => base - (v / max) * span;

      g.strokeStyle = COLORS.grid;
      g.lineWidth = 1;
      g.beginPath();
      if (r) {
        g.moveTo(0, Math.round(top) + 0.5);
        g.lineTo(w, Math.round(top) + 0.5);
      }
      g.moveTo(0, Math.round(base) + 0.5);
      g.lineTo(w, Math.round(base) + 0.5);
      g.stroke();

      // Detecciones: una línea vertical tenue en cada fila.
      g.strokeStyle = COLORS.gridStrong;
      g.setLineDash([2, 3]);
      g.beginPath();
      for (const d of found) {
        const x = Math.round(xOf(d.i)) + 0.5;
        g.moveTo(x, top + 4);
        g.lineTo(x, top + rowH - 4);
      }
      g.stroke();
      g.setLineDash([]);

      g.strokeStyle = color;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let i = start; i < end; i++) {
        const y = yOf(qrs.tapAt(point, i));
        if (i === start) g.moveTo(xOf(i), y);
        else g.lineTo(xOf(i), y);
      }
      g.stroke();

      if (point === 'int') {
        g.strokeStyle = COLORS.warning;
        g.setLineDash([5, 4]);
        g.beginPath();
        for (let i = start; i < end; i++) {
          const y = yOf(qrs.tapAt('thr', i));
          if (i === start) g.moveTo(xOf(i), y);
          else g.lineTo(xOf(i), y);
        }
        g.stroke();
        g.setLineDash([]);
      }

      g.font = '11px system-ui, sans-serif';
      g.fillStyle = COLORS.label;
      g.fillText(label, 6, top + 14);
    });

    g.font = '10px system-ui, sans-serif';
    g.fillStyle = COLORS.label;
    g.textAlign = 'right';
    g.fillText(`Rama ${branch.toUpperCase()} · ${SECONDS} s`, w - 6, h - 4);
    g.textAlign = 'left';
  });

  return <canvas ref={ref} className="view-canvas stages" aria-label="Etapas del detector de QRS" />;
}
