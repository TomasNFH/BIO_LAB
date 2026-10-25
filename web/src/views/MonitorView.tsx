import type { BioEngine } from '../engine/BioEngine';
import type { Branch } from '../engine/chain';
import { dec } from '../components/Knob';
import { BRANCH_COLORS, COLORS, useCanvasLoop } from './canvas';

export type MonitorOptions = {
  speed: number; // velocidad de barrido, mm/s
  gain: number; // mm por mV
  labels: boolean; // marcar P, Q, R, S, T
  reference: boolean; // superponer la referencia limpia
  other: boolean; // superponer la otra rama
};

export const DEFAULT_MONITOR: MonitorOptions = { speed: 25, gain: 10, labels: true, reference: true, other: false };

// Escala de la cuadrícula: píxeles CSS por milímetro de "papel".
const PX_PER_MM = 4;
// Hueco borrado delante del cursor, como en un monitor de barrido.
const GAP_PX = 24;

// Monitor de barrido con cuadrícula de papel ECG: cuadros chicos de 1 mm,
// grandes de 5 mm. El trazo se escribe de izquierda a derecha y vuelve a
// empezar, borrando lo viejo justo delante del cursor.
export function MonitorView({ engine, options, branch }: { engine: BioEngine; options: MonitorOptions; branch: Branch }) {
  const ref = useCanvasLoop((g, w, h) => {
    const { speed, gain, labels, reference, other } = options;
    const otherBranch: Branch = branch === 'a' ? 'b' : 'a';
    const color = BRANCH_COLORS[branch];
    const pxPerSec = PX_PER_MM * speed;
    const pxPerMv = PX_PER_MM * gain;
    const span = w / pxPerSec; // segundos que entran en pantalla
    const mid = Math.round(h / 2 / (5 * PX_PER_MM)) * 5 * PX_PER_MM;

    drawGrid(g, w, h, mid);

    const fs = engine.fs;
    const now = engine.time;
    const end = engine.sampleCount;
    const start = Math.max(engine.oldest, Math.ceil((now - span + GAP_PX / pxPerSec) * fs));
    const xOf = (i: number) => (((i / fs) % span) / span) * w;
    const yOf = (v: number) => mid - v * pxPerMv;

    // Trazo: se corta donde el barrido vuelve al borde izquierdo.
    const trace = (at: (i: number) => number, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      let prevX = Infinity;
      for (let i = start; i < end; i++) {
        const x = xOf(i);
        const y = yOf(at(i));
        if (x < prevX) g.moveTo(x, y);
        else g.lineTo(x, y);
        prevX = x;
      }
      g.stroke();
    };
    if (reference) trace((i) => engine.cleanAt(i), COLORS.reference, 1.2);
    if (other) trace((i) => engine.sampleAt(i, otherBranch), BRANCH_COLORS[otherBranch], 1.2);
    trace((i) => engine.sampleAt(i, branch), color, 1.6);

    // Punto brillante en la cabeza del trazo.
    if (end > start) {
      g.fillStyle = COLORS.traceHead;
      g.beginPath();
      g.arc(xOf(end - 1), yOf(engine.sampleAt(end - 1, branch)), 3, 0, 2 * Math.PI);
      g.fill();
    }

    if (labels) {
      g.font = '600 11px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = COLORS.label;
      const t0 = start / fs;
      for (const beat of engine.ecg.beatsBetween(t0 - 1, now + 1)) {
        for (const wave of engine.ecg.waveTimes(beat)) {
          const i = Math.round(wave.t * fs);
          if (i < start || i >= end) continue;
          const up = wave.a > 0;
          const y = yOf(engine.sampleAt(i, branch)) + (up ? -8 : 16);
          // Q y S están muy cerca del R: se corren a los costados.
          const dx = wave.name === 'Q' ? -6 : wave.name === 'S' ? 6 : 0;
          g.fillText(wave.name, xOf(i) + dx, y);
        }
      }
      g.textAlign = 'left';
    }

    // Leyendas: escalas abajo a la izquierda, frecuencia arriba a la derecha.
    g.font = '11px system-ui, sans-serif';
    g.fillStyle = COLORS.label;
    g.fillText(`${dec(speed, speed % 1 ? 1 : 0)} mm/s · ${gain} mm/mV`, 8, h - 8);
    g.font = '600 15px system-ui, sans-serif';
    g.fillStyle = color;
    g.textAlign = 'right';
    g.fillText(`Rama ${branch.toUpperCase()} · FC ${dec(engine.ecg.bpmAt(now), 0)} lpm`, w - 10, 22);

    // Aviso de saturación del amplificador (en el último medio segundo).
    const amp = engine.chains[branch].amp;
    if (amp.on && amp.saturatedWithin(fs / 2)) {
      g.font = '600 13px system-ui, sans-serif';
      g.fillStyle = COLORS.danger;
      g.textAlign = 'left';
      g.fillText('● Amplificador saturado', 10, 22);
      g.textAlign = 'right';
    }

    // Si la señal se va de la pantalla (por ejemplo con offset de
    // continua), avisar hacia dónde y cuánto vale.
    if (end > start) {
      const v = engine.sampleAt(end - 1, branch);
      const y = yOf(v);
      if (y < 0 || y > h) {
        g.font = '600 13px system-ui, sans-serif';
        g.fillStyle = COLORS.warning;
        g.textAlign = 'center';
        const text = `${y < 0 ? '↑' : '↓'} fuera de escala: ${dec(v, 1)} mV`;
        g.fillText(text, w / 2, y < 0 ? 22 : h - 10);
      }
    }
    g.textAlign = 'left';
  });

  return <canvas ref={ref} className="view-canvas monitor" aria-label="Monitor de ECG" />;
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number, mid: number) {
  g.lineWidth = 1;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  for (const major of [false, true]) {
    g.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
    const step = major ? 5 : 1;
    for (let mm = 0; mm * PX_PER_MM <= w; mm++) {
      if ((mm % 5 === 0) !== major) continue;
      const x = mm * PX_PER_MM + 0.5;
      line(x, 0, x, h);
    }
    // Líneas horizontales a partir de la línea de base, hacia arriba y abajo.
    for (let mm = 0; mm * PX_PER_MM <= h; mm += step) {
      if (major !== (mm % 5 === 0)) continue;
      line(0, mid - mm * PX_PER_MM + 0.5, w, mid - mm * PX_PER_MM + 0.5);
      if (mm) line(0, mid + mm * PX_PER_MM + 0.5, w, mid + mm * PX_PER_MM + 0.5);
    }
  }
}
