import { useEffect, useRef, useState, type ReactNode } from 'react';

// Un botón que abre un recuadro flotante debajo, alineado a la derecha.
// Se abre al pasar el cursor (si `hover`), al llegar con el teclado o al
// tocarlo (en pantallas táctiles no hay cursor), y se cierra al tocar
// afuera o con Escape.
export function Popover({
  trigger,
  label,
  className = '',
  hover = false,
  children,
}: {
  trigger: ReactNode;
  label: string;
  className?: string;
  hover?: boolean;
  children: ReactNode;
}) {
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
    <span className={`help ${hover ? 'hover' : ''} ${open ? 'open' : ''} ${className}`} ref={ref}>
      <button type="button" className="help-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </button>
      <span className="help-pop" role={hover ? 'tooltip' : 'dialog'}>
        {children}
      </span>
    </span>
  );
}

// Botón «?» con una explicación que aparece al pasar el cursor.
export function Help({ children, label = 'Ayuda' }: { children: ReactNode; label?: string }) {
  return (
    <Popover trigger="?" label={label} hover>
      {children}
    </Popover>
  );
}
