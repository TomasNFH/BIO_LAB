// El dispositivo que usa la señal al final de la cadena (la salida): la
// pantalla del monitor, un contador de pulso o un autito que se maneja con
// la mirada.
export type OutputDevice = 'monitor' | 'counter' | 'car';

export const DEVICES: { id: OutputDevice; label: string }[] = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'counter', label: 'Contador de pulso' },
  { id: 'car', label: 'Autito' },
];

export type OutputSettings = { device: OutputDevice };

export const DEFAULT_OUTPUT: OutputSettings = { device: 'monitor' };
