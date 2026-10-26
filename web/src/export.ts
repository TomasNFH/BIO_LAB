import { FS, type BioEngine, type TestPoint } from './engine/BioEngine';
import { BRANCHES } from './engine/chain';

// Formato de los números: punto decimal y coma entre columnas (Python,
// MATLAB, R) o coma decimal y punto y coma entre columnas (planillas en
// español).
export type CsvFormat = 'dot' | 'comma';

const COLUMNS: { point: TestPoint; name: string; shared?: boolean }[] = [
  { point: 'clean', name: 'limpia_mV', shared: true },
  { point: 'input', name: 'entrada_mV', shared: true },
  { point: 'amp', name: 'amplificador_mV' },
  { point: 'hp', name: 'pasa_altos_mV' },
  { point: 'lp', name: 'pasa_bajos_mV' },
  { point: 'notch', name: 'notch_mV' },
  { point: 'out', name: 'adc_mV' },
  { point: 'dlp', name: 'pasa_bajos_digital_mV' },
  { point: 'thr', name: 'umbral' },
];

// Las últimas `seconds` de cada punto de prueba de las dos ramas, a 1 kHz,
// en mV referidos a la entrada (la columna del umbral es lógica: 0 y 1, o
// −1, 0 y +1). Una fila por muestra; el tiempo arranca en
// 0 en la primera.
export function toCsv(engine: BioEngine, seconds: number, format: CsvFormat) {
  const sep = format === 'dot' ? ',' : ';';
  const num = format === 'dot' ? (v: number) => v.toFixed(6) : (v: number) => v.toFixed(6).replace('.', ',');
  const end = engine.sampleCount;
  const start = Math.max(engine.oldest, end - Math.round(seconds * FS));
  const cols: { name: string; at: (i: number) => number }[] = [];
  for (const c of COLUMNS) {
    if (c.shared) cols.push({ name: c.name, at: (i) => engine.tapAt(c.point, i) });
    else for (const b of BRANCHES) cols.push({ name: `${b.toUpperCase()}_${c.name}`, at: (i) => engine.tapAt(c.point, i, b) });
  }
  const lines = [['tiempo_s', ...cols.map((c) => c.name)].join(sep)];
  for (let i = start; i < end; i++) {
    const row = [num((i - start) / FS)];
    for (const c of cols) row.push(num(c.at(i)));
    lines.push(row.join(sep));
  }
  return lines.join('\n') + '\n';
}

// Ofrece un texto como archivo para descargar.
export function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fecha y hora para el nombre del archivo: 2026-10-25_14-30-05.
export const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};
