import { makeRandom } from './random';

// Electrooculograma (EOG) horizontal sintético.
//
// El ojo es un dipolo: la córnea es positiva respecto de la retina. Con un
// electrodo a cada lado de los ojos, la tensión entre ellos es
// proporcional al ángulo de la mirada, unos 16 µV por grado. Mirar a la
// derecha y quedarse ahí da una tensión continua constante: por eso el EOG
// tiene contenido hasta 0 Hz y un pasa altos lo arruina.
//
// Movimientos:
// - Sacadas: saltos rápidos de un punto a otro. Duran más cuanto más
//   grandes (secuencia principal: ≈ 2,2 ms por grado + 21 ms).
// - Fijaciones: la mirada quieta entre sacadas.
// - Seguimiento suave: la mirada sigue un objeto que se mueve despacio.
// - Parpadeos: el párpado barre la córnea y deja un pulso breve.

export type EogPattern = 'saccades' | 'reading' | 'pursuit';

export type EogSettings = {
  pattern: EogPattern;
  sensitivity: number; // µV por grado
  amplitude: number; // ángulo máximo a cada lado, grados
  fixation: number; // duración media de las fijaciones, s
  blinks: number; // parpadeos por minuto
};

export const DEFAULT_EOG: EogSettings = {
  pattern: 'saccades',
  sensitivity: 16,
  amplitude: 20,
  fixation: 1.2,
  blinks: 8,
};

export const PATTERNS: Record<EogPattern, string> = {
  saccades: 'Mirada libre',
  reading: 'Lectura',
  pursuit: 'Seguimiento',
};

export type Saccade = { t0: number; dur: number; from: number; to: number };

const BLINK_AMP = 0.08; // mV
const BLINK_SIGMA = 0.06; // s
const PURSUIT_HZ = 0.2;
const KEEP = 32; // s de historia que se guardan (para las métricas)

// Perfil de una sacada: arranca y frena suave (velocidad en campana).
const profile = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
const saccadeDuration = (deg: number) => 0.021 + 0.0022 * Math.abs(deg);

export class EogSource {
  private settings: EogSettings;
  private random = makeRandom(3);
  private saccades: Saccade[] = [];
  private blinkTimes: number[] = [];
  private nextSaccade = 0.5;
  private nextBlink = 2;
  private position = 0; // ángulo al terminar la última sacada
  private readingX = 0; // posición dentro del renglón, en lectura
  private lastAngle = 0; // último ángulo calculado
  private resync = false; // cambió el patrón: seguir desde donde está el ojo
  private pursuitPhase = 0;

  constructor(settings: EogSettings = DEFAULT_EOG) {
    this.settings = { ...settings };
    this.readingX = -settings.amplitude;
  }

  set(settings: EogSettings) {
    if (settings.pattern !== this.settings.pattern) this.resync = true;
    this.settings = { ...settings };
  }

  get sensitivity() {
    return this.settings.sensitivity;
  }

  // Ángulo de la mirada en grados en el instante t (t debe avanzar).
  angleAt(t: number) {
    if (this.resync) this.continueFrom(t);
    this.schedule(t);
    this.lastAngle = this.computeAngle(t);
    return this.lastAngle;
  }

  private computeAngle(t: number) {
    if (this.settings.pattern === 'pursuit') {
      return this.settings.amplitude * Math.sin(2 * Math.PI * PURSUIT_HZ * t + this.pursuitPhase);
    }
    for (let i = this.saccades.length - 1; i >= 0; i--) {
      const s = this.saccades[i];
      if (s.t0 > t) continue;
      if (t >= s.t0 + s.dur) return s.to;
      return s.from + (s.to - s.from) * profile((t - s.t0) / s.dur);
    }
    return this.position;
  }

  // Al cambiar de patrón el ojo no salta: el nuevo movimiento arranca desde
  // donde estaba la mirada.
  private continueFrom(t: number) {
    this.resync = false;
    const a = this.settings.amplitude;
    const from = Math.max(-a, Math.min(a, this.lastAngle));
    if (this.settings.pattern === 'pursuit') {
      this.pursuitPhase = Math.asin(from / a) - 2 * Math.PI * PURSUIT_HZ * t;
      return;
    }
    // Una sacada de duración cero deja asentada la posición actual.
    this.saccades.push({ t0: t, dur: 0, from, to: from });
    this.position = from;
    this.readingX = from;
    this.nextSaccade = t + 0.3;
  }

  // Valor de la señal en mV en el instante t.
  sample(t: number) {
    let v = (this.angleAt(t) * this.settings.sensitivity) / 1000;
    for (let i = this.blinkTimes.length - 1; i >= 0; i--) {
      const d = (t - this.blinkTimes[i]) / BLINK_SIGMA;
      if (d > 5) break;
      if (d > -5) v += BLINK_AMP * Math.exp(-0.5 * d * d);
    }
    return v;
  }

  // Sacadas que empiezan entre t0 y t1.
  saccadesBetween(t0: number, t1: number) {
    return this.saccades.filter((s) => s.t0 >= t0 && s.t0 <= t1);
  }

  prune(t: number) {
    const cut = t - KEEP;
    let n = 0;
    while (n < this.saccades.length - 1 && this.saccades[n].t0 + this.saccades[n].dur < cut) n++;
    if (n) this.saccades.splice(0, n);
    while (this.blinkTimes.length && this.blinkTimes[0] < cut) this.blinkTimes.shift();
  }

  // Programa las sacadas y parpadeos que empiecen antes de t.
  private schedule(t: number) {
    const s = this.settings;
    const r = this.random;
    while (this.nextBlink <= t) {
      if (s.blinks > 0) this.blinkTimes.push(this.nextBlink);
      const mean = s.blinks > 0 ? 60 / s.blinks : 5;
      this.nextBlink += Math.max(0.5, mean * (0.4 + 1.2 * r.next()));
    }
    if (s.pattern === 'pursuit') {
      // En seguimiento no hay sacadas; se sigue avanzando el reloj.
      this.nextSaccade = Math.max(this.nextSaccade, t);
      return;
    }
    while (this.nextSaccade <= t) {
      const from = this.position;
      let to: number;
      let fixation: number;
      if (s.pattern === 'reading') {
        // Saltos chicos a la derecha a lo largo del renglón y un salto
        // grande de vuelta al principio del siguiente.
        if (this.readingX >= s.amplitude) {
          this.readingX = -s.amplitude;
        } else {
          this.readingX = Math.min(s.amplitude, this.readingX + 2 + 2 * r.next());
        }
        to = this.readingX;
        fixation = 0.2 + 0.1 * r.next();
      } else {
        // Un punto al azar, al menos 3° lejos del actual.
        do to = (2 * r.next() - 1) * s.amplitude;
        while (Math.abs(to - from) < 3 && s.amplitude > 3);
        fixation = Math.max(0.15, s.fixation * (0.5 + r.next()));
      }
      const dur = saccadeDuration(to - from);
      this.saccades.push({ t0: this.nextSaccade, dur, from, to });
      this.position = to;
      this.nextSaccade += dur + fixation;
    }
  }
}
