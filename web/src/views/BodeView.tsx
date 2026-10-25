import type { BioEngine } from '../engine/BioEngine';
import { cutoff, rcResponse, type RcKind, type RcSettings } from '../engine/filters';
import { hz } from '../components/units';
import { COLORS, useCanvasLoop } from './canvas';
import { drawFreqGrid, forEachColumn, getAnalyzer, logAxis } from './spectrum';

const AXIS = logAxis(0.01, 500);
const DB_MIN = -60;
const DB_MAX = 6;
const PHASE = 90; // la fase va de −90° a +90°
const SPLIT = 0.64; // fracción de alto para el módulo; el resto, la fase
// Por debajo de esta potencia (mV²) antes de los filtros no hay con qué medir.
const MIN_POWER = 1e-12;

// Diagrama de Bode de los filtros: módulo arriba y fase abajo. Las líneas
// son la respuesta calculada de cada filtro y de los dos en cascada; los
// puntos, la respuesta medida sobre la señal real: el espectro de la
// salida dividido por el de antes de los filtros.
export function BodeView({ engine, hp, lp }: { engine: BioEngine; hp: RcSettings; lp: RcSettings }) {
  const ref = useCanvasLoop((g, w, h) => {
    const fs = engine.fs;
    const hMag = Math.round(h * SPLIT);
    const magY = (db: number) => ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (hMag - 8) + 4;
    const phaseY = (deg: number) => hMag + 10 + ((PHASE - deg) / (2 * PHASE)) * (h - hMag - 24);

    drawFreqGrid(g, AXIS, w, 0, h);
    g.font = '10px system-ui, sans-serif';
    for (let db = 0; db >= DB_MIN; db -= 10) {
      const y = Math.round(magY(db)) + 0.5;
      g.strokeStyle = db === 0 ? COLORS.gridStrong : COLORS.grid;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.fillStyle = COLORS.label;
      g.fillText(`${db} dB`, 3, y - 3);
    }
    // −3 dB: donde se define la frecuencia de corte.
    g.strokeStyle = COLORS.gridStrong;
    g.setLineDash([2, 4]);
    g.beginPath();
    g.moveTo(0, Math.round(magY(-3)) + 0.5);
    g.lineTo(w, Math.round(magY(-3)) + 0.5);
    g.stroke();
    g.setLineDash([]);
    for (const deg of [90, 45, 0, -45, -90]) {
      const y = Math.round(phaseY(deg)) + 0.5;
      g.strokeStyle = deg === 0 ? COLORS.gridStrong : COLORS.grid;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.fillText(`${deg}°`, 3, y - 3);
    }
    g.strokeStyle = COLORS.gridStrong;
    g.beginPath();
    g.moveTo(0, hMag + 0.5);
    g.lineTo(w, hMag + 0.5);
    g.stroke();

    // Curvas calculadas, evaluadas en cada columna de píxel.
    const curve = (resp: (f: number) => { mag: number; phase: number }, color: string, width: number, dash: number[]) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash);
      for (const part of ['mag', 'phase'] as const) {
        g.beginPath();
        for (let x = 0; x <= w; x++) {
          const f = AXIS.fMin * Math.pow(AXIS.fMax / AXIS.fMin, x / w);
          const r = resp(f);
          const y =
            part === 'mag'
              ? Math.min(hMag, Math.max(0, magY(20 * Math.log10(r.mag + 1e-12))))
              : phaseY(r.phase);
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.setLineDash([]);
    };
    const both = (f: number) => {
      const a = rcResponse('hp', hp, f, fs);
      const b = rcResponse('lp', lp, f, fs);
      return { mag: a.mag * b.mag, phase: a.phase + b.phase };
    };
    if (hp.on) curve((f) => rcResponse('hp', hp, f, fs), COLORS.hp, 1.2, [5, 4]);
    if (lp.on) curve((f) => rcResponse('lp', lp, f, fs), COLORS.lp, 1.2, [5, 4]);
    curve(both, COLORS.trace, 1.8, []);

    // Marcas en cada frecuencia de corte.
    const marks: [RcKind, RcSettings, string][] = [
      ['hp', hp, 'PA'],
      ['lp', lp, 'PB'],
    ];
    g.font = '600 11px system-ui, sans-serif';
    for (const [kind, s, name] of marks) {
      if (!s.on) continue;
      const fc = cutoff(s);
      if (fc < AXIS.fMin || fc > AXIS.fMax) continue;
      const x = AXIS.toX(fc, w);
      g.fillStyle = kind === 'hp' ? COLORS.hp : COLORS.lp;
      g.beginPath();
      g.arc(x, magY(-3), 3.5, 0, 2 * Math.PI);
      g.fill();
      const label = `fc ${name} ${hz(fc)}`;
      g.textAlign = x > w - 90 ? 'right' : 'left';
      g.fillText(label, x + (x > w - 90 ? -6 : 6), magY(-3) + (kind === 'hp' ? 16 : -8));
      g.textAlign = 'left';
    }

    // Respuesta medida: potencia de la salida sobre potencia de antes de
    // los filtros, columna por columna.
    const an = getAnalyzer(engine);
    an.update();
    g.fillStyle = COLORS.measured;
    forEachColumn(AXIS, w, an.df, an.avg.out.length, (x, k0, k1) => {
      let pIn = 0;
      let pOut = 0;
      for (let k = k0; k < k1; k++) {
        pIn += an.avg.amp[k];
        pOut += an.avg.out[k];
      }
      if (pIn < MIN_POWER * (k1 - k0)) return;
      if (x % 3) return; // un punto cada 3 px para que no tape la curva
      const y = magY(10 * Math.log10(pOut / pIn));
      if (y < 0 || y > hMag) return;
      g.fillRect(x - 1, y - 1, 2.2, 2.2);
    });

    g.fillStyle = COLORS.label;
    g.font = '10px system-ui, sans-serif';
    g.fillText('Hz', w - 18, h - 16);
  });

  return <canvas ref={ref} className="view-canvas spectrum" aria-label="Diagrama de Bode de los filtros" />;
}
