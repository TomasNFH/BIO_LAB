import { useEffect, useRef, useState, type ReactNode } from 'react';

// Botón «?» que muestra una explicación al pasar el cursor, al llegar con el
// teclado o al tocarlo (en pantallas táctiles no hay cursor). Se cierra al
// tocar afuera o con Escape.
export function Help({ children, label = 'Ayuda' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <span className={`help ${open ? 'open' : ''}`} ref={ref}>
      <button type="button" className="help-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      <span className="help-pop" role="tooltip">
        {children}
      </span>
    </span>
  );
}
