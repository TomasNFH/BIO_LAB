import type { ReactNode } from 'react';

// Notación matemática y bloques de texto de la página de fundamentos.

// Variable en itálica con subíndice opcional: x('v', 'o') → vₒ.
export const x = (s: string, sub?: string) => (
  <>
    <i>{s}</i>
    {sub && <sub>{sub}</sub>}
  </>
);
export const F = ({ n, d }: { n: ReactNode; d: ReactNode }) => (
  <span className="frac">
    <span>{n}</span>
    <span>{d}</span>
  </span>
);
export const Sqrt = ({ children }: { children: ReactNode }) => (
  <span className="sqrt">
    √<span className="sqrt-in">{children}</span>
  </span>
);
export const Eq = ({ children }: { children: ReactNode }) => <div className="eq">{children}</div>;
export const M = ({ children }: { children: ReactNode }) => <span className="m">{children}</span>;
// Pasos numerados de una deducción.
export const Derive = ({ children }: { children: ReactNode }) => (
  <div className="derive">
    <div className="derive-title">Cómo se deduce</div>
    <ol>{children}</ol>
  </div>
);
export const Note = ({ children }: { children: ReactNode }) => (
  <div className="th-note">
    <strong>En el laboratorio.</strong> {children}
  </div>
);

export const jw = (
  <>
    <i>j</i>
    <i>ω</i>
  </>
);
export const wRC = (
  <>
    <i>ω</i>
    <i>RC</i>
  </>
);

// Un ejemplo de circuito: título, esquema al lado (o arriba si es ancho) y
// el cálculo.
export function Example({ n, title, sch, wide, children }: { n: number; title: string; sch: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`th-ex ${wide ? 'wide' : ''}`}>
      <div className="th-ex-title">
        <span className="th-ex-n">Ejemplo {n}</span> {title}
      </div>
      <div className="th-split">
        {sch}
        <div className="th-ex-body">{children}</div>
      </div>
    </div>
  );
}
