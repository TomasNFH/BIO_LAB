import type { BioEngine } from '../engine/BioEngine';
import { dec } from '../components/Knob';
import { COLORS, useCanvasLoop } from './canvas';
import { drawFreqGrid, forEachColumn, getAnalyzer, logAxis } from './spectrum';

export type SpectrumOptions = {
  reference: boolean; // mostrar el espectro de la referencia limpia
  noise: boolean; // mostrar el espectro del ruido (salida − referencia)
  beforeFilters: boolean; // mostrar el espectro antes de los filtros
};

export const DEFAULT_SPECTRUM: SpectrumOptions = { reference: true, noise: false, beforeFilters: false };

const AXIS = logAxis(0.1, 500);
const DB_MIN = -90;
const DB_MAX = 10;
const dbToY = (db: number, h: number) => ((DB_MAX - db) / (DB_MAX - DB_MIN)) * h;

// Espectro de la salida de la cadena en verde, la referencia limpia en
// gris y, si se piden, el ruido solo en naranja y la señal antes de los
// filtros en azul. Eje de frecuencia logarítmico de 0,1 a 500 Hz.
export function SpectrumView({
  engine,
  options,
  band,
}: {
  engine: BioEngine;
  options: SpectrumOptions;
  band: [number, number] | null; // banda resaltada (el ruido bajo el cursor)
}) {
  const ref = useCanvasLoop((g, w, h) => {
    const an = getAnalyzer(engine);
    an.update();

    if (band) {
      const x0 = Math.max(0, AXIS.toX(band[0], w));
      const x1 = Math.min(w, AXIS.toX(band[1], w));
      g.fillStyle = COLORS.highlight;
      g.fillRect(x0, 0, Math.max(2, x1 - x0), h);
    }

    drawFreqGrid(g, AXIS, w, 0, h);
    for (let db = DB_MIN + 10; db <= DB_MAX; db += 10) {
      const y = Math.round(dbToY(db, h)) + 0.5;
      g.strokeStyle = db === 0 ? COLORS.gridStrong : COLORS.grid;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.fillText(`${db}`, 3, y - 3);
    }
    g.fillText('Hz', w - 18, h - 16);
    g.fillText('dB re 1 mV', 3, 12);

    // Una curva con un punto por píxel: donde varios bins caen en la misma
    // columna se queda con el mayor, así no se pierden picos angostos.
    const curve = (power: Float64Array, color: string, width: number) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineJoin = 'round';
      g.beginPath();
      let started = false;
      forEachColumn(AXIS, w, an.df, power.length, (x, k0, k1) => {
        let max = 0;
        for (let k = k0; k < k1; k++) max = Math.max(max, power[k]);
        const y = Math.min(h, Math.max(0, dbToY(10 * Math.log10(max + 1e-20), h)));
        if (started) g.lineTo(x, y);
        else g.moveTo(x, y);
        started = true;
      });
      g.stroke();
    };

    if (options.reference) curve(an.avg.clean, COLORS.reference, 1.2);
    if (options.beforeFilters) curve(an.avg.amp, COLORS.before, 1.2);
    curve(an.avg.out, COLORS.trace, 1.5);
    if (options.noise) curve(an.avg.diff, COLORS.noise, 1.2);

    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillStyle = COLORS.trace;
    const snr = Number.isFinite(an.snr) ? `${dec(an.snr, 1)} dB` : '∞';
    g.fillText(`SNR ${snr}`, w - 10, 20);
    g.textAlign = 'left';
  });

  return <canvas ref={ref} className="view-canvas spectrum" aria-label="Espectro de la señal" />;
}
