// Matraz de laboratorio con un latido adentro: la señal bajo estudio.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <path
        d="M12.5 3h9M14 3v9.5L5.2 27.6C4.2 29.6 5.3 31 7.4 31h19.2c2.1 0 3.2-1.4 2.2-3.4L20 12.5V3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M7.6 25H12l1.4-2.4 1.8 5 2.6-10.6 2 8H26.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
