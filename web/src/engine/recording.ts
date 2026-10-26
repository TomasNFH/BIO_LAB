// Registros reales: lectura de archivos y reproducción como fuente.
//
// Formatos:
// - CSV o texto: una columna por canal, con o sin columna de tiempo. Sirve
//   para la exportación CSV de PhysioNet (dos filas de encabezado: nombres y
//   unidades), para la de este laboratorio y para cualquier planilla.
// - WFDB de PhysioNet: el encabezado (.hea), la señal (.dat, formatos 212,
//   16 y 80) y, si está, el archivo de anotaciones (.atr) con cada latido
//   marcado por cardiólogos.

export type Channel = {
  name: string;
  data: Float32Array; // mV
};

export type Annotation = {
  sample: number;
  symbol: string; // N, V, A, L, R, ...
  beat: boolean; // es un QRS
  ventricular: boolean;
};

export type Recording = {
  name: string;
  fs: number;
  channels: Channel[];
  annotations: Annotation[] | null;
};

// ---------- CSV ----------

export type CsvTable = {
  names: string[]; // columnas de datos (sin la de tiempo)
  units: (string | null)[];
  columns: Float64Array[];
  fs: number | null; // si había columna de tiempo
};

const unitScale = (u: string | null) => {
  const s = (u ?? 'mV').replace(/['"]/g, '').trim().toLowerCase();
  if (s === 'uv' || s === 'µv' || s === 'microv') return 1e-3;
  if (s === 'v') return 1000;
  return 1; // mV
};

// "0:01.250", "00:00:01.250" o un número (con coma decimal si el archivo
// la usa).
function parseTime(cell: string, decimalComma: boolean) {
  let c = cell.replace(/['"[\]]/g, '').trim();
  if (decimalComma) c = c.replace(',', '.');
  if (c.includes(':')) {
    return c.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  }
  return Number(c);
}

function parseNumber(cell: string, decimalComma: boolean) {
  const c = cell.replace(/['"]/g, '').trim();
  return Number(decimalComma ? c.replace(',', '.') : c);
}

export function parseCsv(text: string): CsvTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 3) throw new Error('El archivo tiene muy pocas filas.');
  // Separador: punto y coma o tabulador si están en todas las primeras
  // filas (entonces la coma puede ser decimal); si no, coma; si no, espacios.
  const head = lines.slice(0, 5);
  const sample = head.join('\n');
  const everywhere = (c: string) => head.every((l) => l.includes(c));
  const delimiter = everywhere(';') ? ';' : everywhere('\t') ? '\t' : everywhere(',') ? ',' : /\s+/;
  const decimalComma = delimiter === ';' || delimiter === '\t' ? /\d,\d/.test(sample) : false;
  const split = (l: string) => l.trim().split(delimiter);

  // Filas de encabezado: las primeras que no son números (salvo un tiempo).
  const isData = (cells: string[]) => cells.slice(1).every((c) => Number.isFinite(parseNumber(c, decimalComma))) && Number.isFinite(parseTime(cells[0], decimalComma));
  let first = 0;
  while (first < lines.length && !isData(split(lines[first]))) first++;
  if (first >= lines.length - 2) throw new Error('No se encontraron filas de números.');
  const header = first > 0 ? split(lines[0]).map((h) => h.replace(/['"]/g, '').trim()) : null;
  const unitRow = first > 1 ? split(lines[1]).map((u) => u.replace(/['"]/g, '').trim()) : null;

  const rows = lines.slice(first).map(split);
  const width = rows[0].length;
  const cols = Array.from({ length: width }, () => new Float64Array(rows.length));
  rows.forEach((r, i) => {
    for (let c = 0; c < width; c++) cols[c][i] = c === 0 ? parseTime(r[c] ?? '', decimalComma) : parseNumber(r[c] ?? '', decimalComma);
  });

  // ¿La primera columna es tiempo? Por el nombre o porque crece parejo.
  const name0 = (header?.[0] ?? '').toLowerCase();
  const steps = Array.from({ length: Math.min(50, rows.length - 1) }, (_, i) => cols[0][i + 1] - cols[0][i]);
  const even = steps.every((d) => d > 0 && Math.abs(d - steps[0]) < steps[0] * 0.01);
  const hasTime = /time|tiempo|elapsed|seg|^t$|^s$/.test(name0) || even;

  const dataCols = hasTime ? cols.slice(1) : cols;
  const names = (header ? (hasTime ? header.slice(1) : header) : dataCols.map((_, i) => `Canal ${i + 1}`)).slice(0, dataCols.length);
  // Unidades: la segunda fila de encabezado o el final del nombre (_mV, _uV).
  const units = dataCols.map((_, i) => {
    const u = unitRow?.[(hasTime ? 1 : 0) + i];
    if (u) return u;
    const m = names[i]?.match(/[_ (](mv|uv|µv|v)\)?$/i);
    return m ? m[1] : null;
  });
  let fs: number | null = null;
  if (hasTime) {
    const all = cols[0];
    const span = all[all.length - 1] - all[0];
    if (span > 0) fs = (all.length - 1) / span;
  }
  return { names, units, columns: dataCols, fs };
}

// Arma un registro de una tabla CSV. fs y unidades se pueden forzar cuando
// el archivo no las trae.
export function csvToRecording(name: string, t: CsvTable, fs: number, defaultUnit: string): Recording {
  return {
    name,
    fs,
    channels: t.columns.map((col, i) => {
      const scale = unitScale(t.units[i] ?? defaultUnit);
      return { name: t.names[i] ?? `Canal ${i + 1}`, data: Float32Array.from(col, (v) => (Number.isFinite(v) ? v * scale : 0)) };
    }),
    annotations: null,
  };
}

// ---------- WFDB ----------

type SignalSpec = { file: string; format: number; gain: number; baseline: number; units: string; name: string };

export function parseHeader(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const [record, nsig, fsField, nsamp] = lines[0].split(/\s+/);
  const n = Number(nsig);
  const fs = Number((fsField ?? '250').split('/')[0]) || 250;
  const signals: SignalSpec[] = [];
  for (let i = 0; i < n; i++) {
    const f = lines[1 + i].split(/\s+/);
    const format = parseInt(f[1], 10);
    const g = (f[2] ?? '200').match(/^([-\d.e+]+)?(?:\(([-\d]+)\))?(?:\/(\S+))?/) ?? [];
    const adcZero = Number(f[4] ?? 0);
    const gain = Number(g[1]) || 200;
    signals.push({
      file: f[0],
      format,
      gain,
      baseline: g[2] !== undefined ? Number(g[2]) : adcZero,
      units: g[3] ?? 'mV',
      name: f.slice(8).join(' ') || `Señal ${i + 1}`,
    });
  }
  return { record, fs, nsamp: Number(nsamp) || 0, signals };
}

// Decodifica un .dat con varias señales intercaladas.
function decodeDat(buf: ArrayBuffer, format: number, nsig: number): Int32Array[] {
  const bytes = new Uint8Array(buf);
  const values: number[] = [];
  if (format === 212) {
    // Dos muestras de 12 bits cada 3 bytes.
    for (let i = 0; i + 2 < bytes.length; i += 3) {
      const b0 = bytes[i];
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      let v0 = b0 | ((b1 & 0x0f) << 8);
      let v1 = b2 | ((b1 & 0xf0) << 4);
      if (v0 > 2047) v0 -= 4096;
      if (v1 > 2047) v1 -= 4096;
      values.push(v0, v1);
    }
  } else if (format === 16) {
    const view = new DataView(buf);
    for (let i = 0; i + 1 < bytes.length; i += 2) values.push(view.getInt16(i, true));
  } else if (format === 80) {
    for (const b of bytes) values.push(b - 128);
  } else {
    throw new Error(`Formato WFDB ${format} no soportado (sí: 212, 16 y 80).`);
  }
  const frames = Math.floor(values.length / nsig);
  const out = Array.from({ length: nsig }, () => new Int32Array(frames));
  for (let k = 0; k < frames; k++) for (let s = 0; s < nsig; s++) out[s][k] = values[k * nsig + s];
  return out;
}

const MIT_CODES: Record<number, string> = {
  1: 'N', 2: 'L', 3: 'R', 4: 'a', 5: 'V', 6: 'F', 7: 'J', 8: 'A', 9: 'S', 10: 'E', 11: 'j', 12: '/', 13: 'Q',
  14: '~', 16: '|', 18: 's', 19: 'T', 20: '*', 21: 'D', 22: '"', 23: '=', 24: 'p', 25: 'B', 26: '^', 27: 't',
  28: '+', 29: 'u', 30: '?', 31: '!', 32: '[', 33: ']', 34: 'e', 35: 'n', 36: '@', 37: 'x', 38: 'f', 39: '(',
  40: ')', 41: 'r',
};
// Códigos que son un QRS (como isqrs() de WFDB) y cuáles son ventriculares.
const BEATS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 25, 30, 34, 35, 38, 41]);
const VENTRICULAR = new Set([5, 6, 10, 41]);

// Anotaciones en formato MIT (.atr): palabras de 16 bits con el código en
// los 6 bits altos y el avance de tiempo en los 10 bajos.
export function parseAtr(buf: ArrayBuffer): Annotation[] {
  const view = new DataView(buf);
  const out: Annotation[] = [];
  let t = 0;
  let i = 0;
  while (i + 1 < buf.byteLength) {
    const word = view.getUint16(i, true);
    i += 2;
    const code = word >> 10;
    const value = word & 0x3ff;
    if (code === 0 && value === 0) break;
    if (code === 59) {
      // SKIP: un salto largo de 32 bits (primero la mitad alta).
      const hi = view.getInt16(i, true);
      const lo = view.getUint16(i + 2, true);
      t += hi * 65536 + lo;
      i += 4;
    } else if (code === 63) {
      i += value + (value & 1); // AUX: texto que no se usa
    } else if (code >= 60) {
      // NUM, SUB, CHN: no avanzan el tiempo.
    } else {
      t += value;
      out.push({ sample: t, symbol: MIT_CODES[code] ?? '?', beat: BEATS.has(code), ventricular: VENTRICULAR.has(code) });
    }
  }
  return out;
}

// Arma un registro con los archivos WFDB elegidos (por nombre).
export function wfdbToRecording(files: Map<string, ArrayBuffer>, headerName: string): Recording {
  const header = parseHeader(new TextDecoder().decode(files.get(headerName)!));
  const channels: Channel[] = header.signals.map((s) => ({ name: s.name, data: new Float32Array(0) }));
  // Las señales de un mismo archivo van intercaladas.
  const byFile = new Map<string, number[]>();
  header.signals.forEach((s, i) => byFile.set(s.file, [...(byFile.get(s.file) ?? []), i]));
  for (const [file, idx] of byFile) {
    const buf = files.get(file);
    if (!buf) throw new Error(`Falta el archivo ${file} (va junto con ${headerName}).`);
    const decoded = decodeDat(buf, header.signals[idx[0]].format, idx.length);
    idx.forEach((sigIndex, k) => {
      const s = header.signals[sigIndex];
      const scale = unitScale(s.units) / s.gain;
      channels[sigIndex].data = Float32Array.from(decoded[k], (v) => (v - s.baseline) * scale);
    });
  }
  const atrName = [...files.keys()].find((n) => n === `${header.record}.atr`) ?? [...files.keys()].find((n) => n.endsWith('.atr'));
  return {
    name: header.record,
    fs: header.fs,
    channels,
    annotations: atrName ? parseAtr(files.get(atrName)!) : null,
  };
}

// ---------- Reproducción ----------

export type RecBeat = { r: number; kind: 'N' | 'V'; symbol: string };

// Reproduce un canal de un registro en un bucle, interpolando a la
// frecuencia que pida el motor. Las anotaciones se pasan a tiempos del
// motor, vuelta por vuelta.
export class RecordingSource {
  private rec: Recording | null = null;
  private channel = 0;
  private t0 = 0; // tiempo del motor en que arrancó la reproducción

  get recording() {
    return this.rec;
  }

  get duration() {
    return this.rec ? this.rec.channels[0].data.length / this.rec.fs : 0;
  }

  set(rec: Recording | null, channel: number, now: number) {
    if (rec !== this.rec) this.t0 = now;
    this.rec = rec;
    this.channel = Math.min(channel, (rec?.channels.length ?? 1) - 1);
  }

  restart(now: number) {
    this.t0 = now;
  }

  sample(t: number) {
    const rec = this.rec;
    if (!rec) return 0;
    const data = rec.channels[this.channel].data;
    const n = data.length;
    if (n < 2) return 0;
    let x = ((t - this.t0) * rec.fs) % n;
    if (x < 0) x += n;
    const i = Math.floor(x);
    const f = x - i;
    return data[i] * (1 - f) + data[(i + 1) % n] * f;
  }

  // Latidos anotados (con QRS) cuyo R cae entre t0 y t1 del motor.
  beatsBetween(t0: number, t1: number): RecBeat[] {
    const rec = this.rec;
    if (!rec?.annotations || !this.duration) return [];
    const out: RecBeat[] = [];
    const dur = this.duration;
    for (let k = Math.floor((t0 - this.t0) / dur); this.t0 + k * dur <= t1; k++) {
      const base = this.t0 + k * dur;
      for (const a of rec.annotations) {
        if (!a.beat) continue;
        const r = base + a.sample / rec.fs;
        if (r < t0) continue;
        if (r > t1) break;
        out.push({ r, kind: a.ventricular ? 'V' : 'N', symbol: a.symbol });
      }
    }
    return out;
  }
}
