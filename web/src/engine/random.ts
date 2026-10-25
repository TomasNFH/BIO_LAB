// Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da
// siempre la misma señal, así las comparaciones son repetibles.
export function makeRandom(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Normal de media 0 y desvío 1 (Box-Muller).
  const gauss = () => {
    const u = 1 - next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, gauss };
}
