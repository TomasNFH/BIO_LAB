import type { BioEngine } from '../engine/BioEngine';
import type { Branch, ChainSettings } from '../engine/chain';
import { cutoff, filterResponse, notchResponse } from '../engine/filters';
import { hz } from '../components/units';
import { BRANCH_COLORS, COLORS, useCanvasLoop } from './canvas';
import { drawFreqGrid, forEachColumn, getAnalyzer, logAxis } from './spectrum';

const AXIS = logAxis(0.01, 500);
const DB_MIN = -60;
const DB_MAX = 6;
const SPLIT = 0.64; // fracción de alto para el módulo; el resto, la fase
// Por debajo de esta potencia (mV²) antes de los filtros no hay con qué medir.
const MIN_POWER = 1e-12;

type Resp = { mag: number; phase: number };
// Fase llevada a (−180°, 180°].
const wrap = (deg: number) => deg - 360 * Math.ceil((deg - 180) / 360);

// Diagrama de Bode de los filtros de una rama: módulo arriba y fase abajo.
// Las líneas son la respuesta calculada de cada filtro y de todos en
// cascada; los puntos, la respuesta medida sobre la señal real: el
// espectro de la salida dividido por el de antes de los filtros.
export function BodeView({ engine, branch, settings }: { engine: BioEngine; branch: Branch; settings: ChainSettings }) {
  const { hp, lp, notch } = settings;
  const ref = useCanvasLoop((g, w, h) => {
    const fs = engine.fs;
    const hMag = Math.round(h * SPLIT);
    const magY = (db: number) => ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (hMag - 8) + 4;
    const phaseY = (deg: number) => hMag + 10 + ((180 - deg) / 360) * (h - hMag - 24);

    drawFreqGrid(g, AXIS, w, 0, h);
    g.font = '10px system-ui, sans-serif';
    const hline = (y: number, strong: boolean) => {
      g.strokeStyle = strong ? COLORS.gridStrong : COLORS.grid;
      g.beginPath();
      g.moveTo(0, Math.round(y) + 0.5);
      g.lineTo(w, Math.round(y) + 0.5);
      g.stroke();
    };
    for (let db = 0; db >= DB_MIN; db -= 10) {
      hline(magY(db), db === 0);
      g.fillStyle = COLORS.label;
      g.fillText(`${db} dB`, 3, magY(db) - 3);
    }
    // −3 dB: donde se define la frecuencia de corte.
    g.setLineDash([2, 4]);
    hline(magY(-3), true);
    g.setLineDash([]);
    for (const deg of [180, 90, 0, -90, -180]) {
      hline(phaseY(deg), deg === 0);
      g.fillText(`${deg}°`, 3, phaseY(deg) - 3);
    }
    hline(hMag, true);

    // Curvas calculadas, evaluadas en cada columna de píxel.
    const curve = (resp: (f: number) => Resp, color: string, width: number, dash: number[]) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash);
      for (const part of ['mag', 'phase'] as const) {
        g.beginPath();
        let prevY = NaN;
        for (let x = 0; x <= w; x++) {
          const f = AXIS.fMin * Math.pow(AXIS.fMax / AXIS.fMin, x / w);
          const r = resp(f);
          const y =
            part === 'mag'
              ? Math.min(hMag, Math.max(0, magY(20 * Math.log10(r.mag + 1e-12))))
              : phaseY(wrap(r.phase));
          // La fase salta de +180° a −180°: no unir esos puntos.
          if (x === 0 || (part === 'phase' && Math.abs(y - prevY) > (h - hMag) / 2)) g.moveTo(x, y);
          else g.lineTo(x, y);
          prevY = y;
        }
        g.stroke();
      }
      g.setLineDash([]);
    };
    const hpR = (f: number) => filterResponse('hp', hp, f, fs);
    const lpR = (f: number) => filterResponse('lp', lp, f, fs);
    const notchR = (f: number) => notchResponse(notch, f, fs);
    const all = (f: number): Resp => {
      const parts = [hpR(f), lpR(f), notchR(f)];
      return {
        mag: parts.reduce((m, p) => m * p.mag, 1),
        phase: parts.reduce((s, p) => s + p.phase, 0),
      };
    };
    if (hp.on) curve(hpR, COLORS.hp, 1.2, [5, 4]);
    if (lp.on) curve(lpR, COLORS.lp, 1.2, [5, 4]);
    if (notch.on) curve(notchR, COLORS.notch, 1.2, [5, 4]);
    curve(all, BRANCH_COLORS[branch], 1.8, []);

    // Marcas en cada frecuencia de corte.
    g.font = '600 11px system-ui, sans-serif';
    const marks: [boolean, number, string, string, number][] = [
      [hp.on, cutoff(hp), 'PA', COLORS.hp, 16],
      [lp.on, cutoff(lp), 'PB', COLORS.lp, -8],
    ];
    for (const [on, fc, name, color, dy] of marks) {
      if (!on || fc < AXIS.fMin || fc > AXIS.fMax) continue;
      const x = AXIS.toX(fc, w);
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, magY(-3), 3.5, 0, 2 * Math.PI);
      g.fill();
      const right = x > w - 90;
      g.textAlign = right ? 'right' : 'left';
      g.fillText(`fc ${name} ${hz(fc)}`, x + (right ? -6 : 6), magY(-3) + dy);
      g.textAlign = 'left';
    }

    // Respuesta medida: potencia de la salida sobre potencia de antes de
    // los filtros, columna por columna.
    const an = getAnalyzer(engine);
    an.update();
    const pAmp = an.avg[`amp_${branch}`];
    const pOut = an.avg[`out_${branch}`];
    g.fillStyle = COLORS.measured;
    forEachColumn(AXIS, w, an.df, pOut.length, (x, k0, k1) => {
      let pi = 0;
      let po = 0;
      for (let k = k0; k < k1; k++) {
        pi += pAmp[k];
        po += pOut[k];
      }
      if (pi < MIN_POWER * (k1 - k0)) return;
      if (x % 3) return; // un punto cada 3 px para que no tape la curva
      const y = magY(10 * Math.log10(po / pi));
      if (y < 0 || y > hMag) return;
      g.fillRect(x - 1, y - 1, 2.2, 2.2);
    });

    g.fillStyle = COLORS.label;
    g.font = '10px system-ui, sans-serif';
    g.fillText('Hz', w - 18, h - 16);
  });

  return <canvas ref={ref} className="view-canvas spectrum" aria-label="Diagrama de Bode de los filtros" />;
}
