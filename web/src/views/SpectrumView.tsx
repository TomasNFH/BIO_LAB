import type { BioEngine } from '../engine/BioEngine';
import type { Branch } from '../engine/chain';
import { BRANCH_COLORS, COLORS, font, useCanvasLoop } from './canvas';
import { drawFreqGrid, forEachColumn, getAnalyzer, logAxis } from './spectrum';

export type SpectrumOptions = {
  reference: boolean; // mostrar el espectro de la referencia limpia
  noise: boolean; // mostrar el espectro del ruido (salida − referencia)
  beforeFilters: boolean; // mostrar el espectro antes de los filtros
  other: boolean; // mostrar también la salida de la otra rama
};

export const DEFAULT_SPECTRUM: SpectrumOptions = { reference: true, noise: false, beforeFilters: false, other: true };

const AXIS = logAxis(0.1, 500);
const DB_MIN = -90;
const DB_MAX = 10;
const dbToY = (db: number, h: number) => ((DB_MAX - db) / (DB_MAX - DB_MIN)) * h;

// Espectro de la salida de la rama elegida (en su color), la referencia
// limpia en gris y, si se piden, la salida de la otra rama, el ruido solo
// en naranja y la señal antes de los filtros en amarillo. Eje de
// frecuencia logarítmico de 0,1 a 500 Hz.
export function SpectrumView({
  engine,
  options,
  band,
  branch,
}: {
  engine: BioEngine;
  options: SpectrumOptions;
  branch: Branch;
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

    // Por encima de Nyquist el ADC no tiene información: lo que se ve son
    // copias que deja el retenedor.
    const adc = engine.chains[branch].adc;
    if (adc.on && adc.fs / 2 < AXIS.fMax) {
      const xn = AXIS.toX(adc.fs / 2, w);
      g.fillStyle = COLORS.aboveNyquist;
      g.fillRect(xn, 0, w - xn, h);
      g.strokeStyle = COLORS.warning;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(Math.round(xn) + 0.5, 0);
      g.lineTo(Math.round(xn) + 0.5, h);
      g.stroke();
      g.setLineDash([]);
      g.font = font(11, 600);
      g.fillStyle = COLORS.warning;
      g.textAlign = xn > w - 80 ? 'right' : 'left';
      g.fillText(`Nyquist ${adc.fs / 2} Hz`, xn + (xn > w - 80 ? -5 : 5), 26);
      g.textAlign = 'left';
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

    const other: Branch = branch === 'a' ? 'b' : 'a';
    if (options.reference) curve(an.avg.clean, COLORS.reference, 1.2);
    if (options.beforeFilters) curve(an.avg[`amp_${branch}`], COLORS.before, 1.2);
    if (options.other) curve(an.avg[`out_${other}`], BRANCH_COLORS[other], 1.2);
    curve(an.avg[`out_${branch}`], BRANCH_COLORS[branch], 1.5);
    if (options.noise) curve(an.avg[`diff_${branch}`], COLORS.noise, 1.2);

  });

  return <canvas ref={ref} className="view-canvas spectrum" aria-label="Espectro de la señal" />;
}
