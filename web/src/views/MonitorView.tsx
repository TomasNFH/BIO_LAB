import type { BioEngine } from '../engine/BioEngine';
import { dec } from '../components/Knob';
import { COLORS, useCanvasLoop } from './canvas';

export type MonitorOptions = {
  speed: number; // velocidad de barrido, mm/s
  gain: number; // mm por mV
  labels: boolean; // marcar P, Q, R, S, T
};

export const DEFAULT_MONITOR: MonitorOptions = { speed: 25, gain: 10, labels: true };

// Escala de la cuadrícula: píxeles CSS por milímetro de "papel".
const PX_PER_MM = 4;
// Hueco borrado delante del cursor, como en un monitor de barrido.
const GAP_PX = 24;

// Monitor de barrido con cuadrícula de papel ECG: cuadros chicos de 1 mm,
// grandes de 5 mm. El trazo se escribe de izquierda a derecha y vuelve a
// empezar, borrando lo viejo justo delante del cursor.
export function MonitorView({ engine, options }: { engine: BioEngine; options: MonitorOptions }) {
  const ref = useCanvasLoop((g, w, h) => {
    const { speed, gain, labels } = options;
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
    g.strokeStyle = COLORS.trace;
    g.lineWidth = 1.6;
    g.lineJoin = 'round';
    g.beginPath();
    let prevX = Infinity;
    for (let i = start; i < end; i++) {
      const x = xOf(i);
      const y = yOf(engine.sampleAt(i));
      if (x < prevX) g.moveTo(x, y);
      else g.lineTo(x, y);
      prevX = x;
    }
    g.stroke();

    // Punto brillante en la cabeza del trazo.
    if (end > start) {
      g.fillStyle = COLORS.traceHead;
      g.beginPath();
      g.arc(xOf(end - 1), yOf(engine.sampleAt(end - 1)), 3, 0, 2 * Math.PI);
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
          const y = yOf(engine.sampleAt(i)) + (up ? -8 : 16);
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
    g.fillStyle = COLORS.trace;
    g.textAlign = 'right';
    g.fillText(`FC ${dec(engine.ecg.bpmAt(now), 0)} lpm`, w - 10, 22);
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
