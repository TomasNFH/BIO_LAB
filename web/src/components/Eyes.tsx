import { useEffect, useRef } from 'react';
import type { BioEngine } from '../engine/BioEngine';

// Cuánto se corren las pupilas desde el centro del ojo, en unidades del SVG.
const MAX_X = 5;
const MAX_Y = 3.5;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

// Dos ojitos en el encabezado para el EOG interactivo. El mouse fija hacia
// dónde se quiere mirar (izquierda o derecha, hasta el ángulo máximo cuando
// llega al borde de la ventana); las pupilas muestran dónde está el ojo de
// verdad, que lo alcanza con sacadas, así se ven los mismos saltos que en
// el EOG. También parpadean cuando hay un parpadeo en la señal. Lo vertical
// es sólo para que se vean vivos: el EOG es horizontal.
export function Eyes({ engine, amplitude }: { engine: BioEngine; amplitude: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const pupils = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    let my = 0; // altura del mouse respecto de los ojos, de −1 a 1
    const aim = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      engine.setGaze(clamp1((e.clientX - cx) / (window.innerWidth / 2)) * amplitude);
      my = clamp1((e.clientY - cy) / (window.innerHeight / 2));
    };
    window.addEventListener('pointermove', aim);
    window.addEventListener('pointerdown', aim);

    let raf = 0;
    const loop = () => {
      // En pausa la señal no avanza: las pupilas van directo al mouse.
      const angle = engine.state.playing ? engine.eog.angle : engine.eog.targetAngle;
      const x = clamp1(angle / amplitude) * MAX_X;
      const y = my * MAX_Y;
      for (const p of pupils.current) p?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      ref.current?.classList.toggle('blink', engine.state.playing && engine.eog.blinkingAt(engine.time));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', aim);
      window.removeEventListener('pointerdown', aim);
      cancelAnimationFrame(raf);
    };
  }, [engine, amplitude]);

  return (
    <div ref={ref} className="eyes" title="Los ojitos siguen al mouse: el EOG sale de hacia dónde miran" aria-hidden="true">
      <svg viewBox="0 0 64 32" width="64" height="32">
        {[16, 48].map((cx, i) => (
          <g key={cx} className="eye">
            <ellipse cx={cx} cy="16" rx="13" ry="14" fill="var(--cream-light)" stroke="var(--espresso)" strokeWidth="2.2" />
            <g
              ref={(el) => {
                pupils.current[i] = el;
              }}
            >
              <circle cx={cx} cy="16" r="6.2" fill="var(--turq)" stroke="var(--espresso)" strokeWidth="1.4" />
              <circle cx={cx} cy="16" r="3.4" fill="var(--espresso-dark)" />
              <circle cx={cx - 1.8} cy="14.2" r="1.4" fill="var(--cream-light)" />
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
