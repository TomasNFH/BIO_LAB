// Símbolos de esquema que usan los ejemplos de fundamentos (los de
// resistencia, capacitor, op-amp y masa están en AmpSchematic y
// FilterSchematic).

type P = [number, number];

// Diodo del ánodo `a` al cátodo `c`, en cualquier dirección. Con `led`,
// dos flechas de luz hacia afuera.
export function Diode({ a, c, led }: { a: P; c: P; led?: boolean }) {
  const [ax, ay] = a;
  const [cx, cy] = c;
  const len = Math.hypot(cx - ax, cy - ay);
  const ux = (cx - ax) / len;
  const uy = (cy - ay) / len;
  // Perpendicular, a la izquierda de la dirección ánodo → cátodo.
  const px = uy;
  const py = -ux;
  const mx = (ax + cx) / 2;
  const my = (ay + cy) / 2;
  const h = 9;
  const b0: P = [mx - h * ux, my - h * uy];
  const b1: P = [mx + h * ux, my + h * uy];
  const pt = (p: P) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const arrows = () => {
    // Dos flechas en diagonal, saliendo del lado izquierdo del diodo.
    const dx = (px + ux) / Math.SQRT2;
    const dy = (py + uy) / Math.SQRT2;
    return [-3, 5]
      .map((k) => {
        const s: P = [mx + (h + 3) * px + k * ux, my + (h + 3) * py + k * uy];
        const e: P = [s[0] + 11 * dx, s[1] + 11 * dy];
        // Punta: dos rayitas que vuelven desde e.
        const l: P = [e[0] - 4 * dx + 3 * (-dy), e[1] - 4 * dy + 3 * dx];
        const r: P = [e[0] - 4 * dx - 3 * (-dy), e[1] - 4 * dy - 3 * dx];
        return `M${pt(s)}L${pt(e)}M${pt(l)}L${pt(e)}L${pt(r)}`;
      })
      .join('');
  };
  return (
    <g>
      <path d={`M${pt(a)}L${pt(b0)}M${pt(b1)}L${pt(c)}`} />
      <path
        d={`M${pt([b0[0] + h * px, b0[1] + h * py])}L${pt([b0[0] - h * px, b0[1] - h * py])}L${pt(b1)}ZM${pt([b1[0] + h * px, b1[1] + h * py])}L${pt([b1[0] - h * px, b1[1] - h * py])}`}
      />
      {led && <path d={arrows()} />}
    </g>
  );
}

// Transistor NPN con la base en (x, y). Colector arriba en (x+34, y−34) y
// emisor abajo en (x+34, y+34); la flecha del emisor apunta hacia afuera.
export function Npn({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M${x} ${y}H${x + 16}M${x + 16} ${y - 14}V${y + 14}M${x + 16} ${y - 7}L${x + 34} ${y - 20}V${y - 34}M${x + 16} ${y + 7}L${x + 34} ${y + 20}V${y + 34}`} />
      <path className="sch-fill" d={`M${x + 31} ${y + 17.8}L${x + 23} ${y + 16.9}L${x + 27.6} ${y + 10.5}Z`} />
    </g>
  );
}

// MOSFET de canal N con el gate en (x, y). Drenador arriba en (x+34, y−34)
// y fuente abajo en (x+34, y+34); la flecha del sustrato apunta al canal.
export function Nmos({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path
        d={`M${x} ${y}H${x + 14}M${x + 14} ${y - 14}V${y + 14}M${x + 20} ${y - 16}V${y - 6}M${x + 20} ${y - 4}V${y + 4}M${x + 20} ${y + 6}V${y + 16}M${x + 20} ${y - 11}H${x + 34}V${y - 34}M${x + 20} ${y + 11}H${x + 34}V${y + 34}M${x + 26} ${y}H${x + 34}V${y + 11}`}
      />
      <path className="sch-fill" d={`M${x + 21} ${y}L${x + 27} ${y - 3.5}L${x + 27} ${y + 3.5}Z`} />
    </g>
  );
}

// Alimentación: una raya con su tensión arriba (o abajo, para la negativa).
export function Rail({ x, y, label, below }: { x: number; y: number; label: string; below?: boolean }) {
  return (
    <g>
      <path d={`M${x - 10} ${y}h20`} />
      <text className="sch-value" x={x} y={below ? y + 16 : y - 6} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

// Fuente de alterna: círculo con una senoidal; terminales arriba y abajo.
export function AcSource({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className="sch-sym" cx={x} cy={y} r={13} />
      <path d={`M${x - 7} ${y}Q${x - 3.5} ${y - 9} ${x} ${y}T${x + 7} ${y}`} />
    </g>
  );
}

// Motor de continua: círculo con una M; terminales arriba y abajo.
export function Motor({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle className="sch-sym" cx={x} cy={y} r={14} />
      <text className="sch-small" x={x} y={y + 5} textAnchor="middle">
        M
      </text>
    </g>
  );
}

// Recuadro con un nombre (ADC, micro).
export function Box({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y - 13} width={w} height={26} rx={4} />
      <text className="sch-small" x={x + w / 2} y={y + 5} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
