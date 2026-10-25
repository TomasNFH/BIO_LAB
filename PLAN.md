# Bio Lab: plan de implementación

25 oct 2026 · @Tomas

## Objetivo y recomendación

Construir una página web en React donde se genera una señal biomédica (ECG
primero, EOG después), se le suma ruido ajustable y se la pasa por una cadena
de adquisición modelada etapa por etapa: amplificador de instrumentación,
filtros RC, pasa banda, notch y ADC. Antes y después se comparan en pantalla,
igual que en Tone Lab.

Por qué así:

- **Misma base que Tone Lab.** Vite + React + TypeScript, canvas para las
  gráficas, el motor fuera del estado de React. Mucho del esqueleto (paneles,
  perillas, A/B, presets, despliegue en GitHub Pages) se puede reutilizar.
- **La fuente es sintética, entonces la verdad es conocida.** Como el
  laboratorio genera la señal limpia, puede medir el SNR y el error de la
  salida contra la referencia. Con una grabación real eso no se puede.
- **Los bloques son circuitos reales.** Cada filtro se define por sus
  componentes (R, C, ganancia del op-amp) y de ahí se calculan la frecuencia
  de corte y la respuesta. Se aprende el circuito, no solo el filtro digital.
- **Sin backend al principio.** Todo corre en el navegador.

El objetivo es aprender, no hacer un equipo clínico.

## Arquitectura

| Parte | Elección | Por qué |
| --- | --- | --- |
| Proyecto | Vite + React + TypeScript | Igual que Tone Lab |
| Motor | Clase `BioEngine` en TS puro, procesa bloques de muestras | Las señales son lentas (fs = 1 kHz); no hace falta Web Audio |
| Tiempo real | Bucle con `requestAnimationFrame`: en cada cuadro genera y procesa las muestras del tiempo transcurrido | Simple, suave a 60 fps, mismo código para tiempo real y exportación |
| Simulación analógica | La parte "analógica" (fuente, ruido, amplificador, filtros) corre a 4 kHz; el ADC la muestrea a 100–1000 Hz y las vistas leen búferes a 1 kHz (promedio de 4 muestras analógicas) | Así el ADC y el aliasing son honestos, y los filtros se parecen a los analógicos hasta 500 Hz |
| Filtros | Biquads / primer orden obtenidos por transformada bilineal desde los valores R y C | La respuesta dibujada sale de la misma función de transferencia |
| Gráficas | Canvas 2D | Las librerías de gráficos son lentas a 60 fps |
| Estado | Estado de React para las perillas; empujan valores al motor | Igual que Tone Lab |
| Archivos (más adelante) | Importar CSV / registros de PhysioNet, exportar CSV | Para comparar con señales reales |

### Cadena de señal

```
           ┌──────────── referencia limpia ─────────────────────────┐
           │                                                         ▼
Fuente ──► Ruido ──► Amp. instrumentación ──► PA ──► PB ──► Notch ──► ADC ──► Vistas
(ECG/EOG)  (ajustable) (diferencial + modo común)                       (A y B)
```

La fuente entrega dos señales, una por electrodo (`V+` y `V−`), para que el
amplificador de instrumentación tenga algo real que restar: la señal útil
aparece en la diferencia y la interferencia de red y el offset aparecen
sobre todo en el modo común.

## Fuentes

### ECG sintético

| Opción | Cómo | Para qué |
| --- | --- | --- |
| Suma de gaussianas (P, Q, R, S, T) por latido | Cada onda con amplitud, ancho y posición ajustables | Primera versión: simple y editable |
| Modelo dinámico (McSharry, ECGSYN) | Sistema de ecuaciones que genera un ECG realista con variabilidad | Segunda versión: más realista |

Perillas: frecuencia cardíaca (40–180 lpm), variabilidad, amplitud
(~1 mV de onda R), derivación. Más adelante: arritmias simples (latido
prematuro, bloqueo).

### EOG sintético (electrooculograma)

- Movimientos sacádicos como escalones suavizados, fijaciones, parpadeos.
- Amplitud del orden de 10–20 µV por grado, contenido casi todo por debajo de
  ~30 Hz y con componente de **continua**: el pasa altos que sirve para el ECG
  arruina el EOG, y eso es justamente una lección.
- Tres patrones: mirada libre (sacadas al azar y fijaciones), lectura (saltos
  chicos a la derecha y uno grande de vuelta) y seguimiento suave. Al cambiar
  de patrón el ojo sigue desde donde estaba.
- El EOG tiene su propio juego de ruidos (menos deriva y menos EMG que el
  ECG); los filtros son los mismos de la rama, para que se vea qué le hacen
  los del ECG. La barra de la cadena tiene la banda del EOG: sin pasa altos
  (CC) y pasa bajos de 30 Hz.
- Métricas propias: error de mirada en grados y qué parte de cada salto se
  sigue viendo 1 s después, durante la fijación.

## Ruido ajustable

Cada fuente de ruido tiene su interruptor y su nivel, y se puede ver por
separado en el monitor y en el espectro.

| Ruido | Modelo | Frecuencias | Lo quita |
| --- | --- | --- | --- |
| Interferencia de red | Senoidal 50 o 60 Hz + armónicos, mayormente en modo común | 50/60 Hz y múltiplos | CMRR del amplificador + notch |
| Deriva de línea de base | Senoidal lenta (respiración) + paseo aleatorio | 0,05–0,5 Hz | Pasa altos |
| Ruido muscular (EMG) | Ruido blanco filtrado, en ráfagas | 20–500 Hz | Pasa bajos (en parte) |
| Ruido del amplificador | Ruido blanco / 1/f | Banda ancha | Pasa banda |
| Offset de electrodos | Continua de hasta ±300 mV, distinta en cada electrodo | 0 Hz | Acople AC / pasa altos; limita la ganancia de la 1.ª etapa |
| Artefacto de movimiento | Saltos y transitorios aleatorios | Bajas, se solapan con la señal | Difícil: sirve para mostrar el límite de los filtros |

En la etapa 2 todos los ruidos se suman a la señal diferencial (lo que
vería un amplificador ideal). En la etapa 3 la interferencia de red y el
offset pasan a tener también una parte en modo común, que el amplificador
rechaza según su CMRR.

## Bloques de la cadena

### Amplificador de instrumentación (3 op-amps)

- Ganancia `G = (1 + 2R/Rg) · (R3/R2)`, editable por componentes.
- Ganancia posterior (×1 a ×100) después del pasa altos, con la misma
  alimentación: es como se arregla la saturación por offset.
- **CMRR** finito: sale del desequilibrio entre R3 y R3' en la etapa 2
  (perilla de error, 0,01 % a 10 %), y mejora al subir la ganancia de la
  etapa 1. El monitor muestra la salida referida a la entrada (dividida por
  la ganancia), como un monitor real.
- Saturación a las tensiones de alimentación: con offset de electrodo de
  300 mV y ganancia 1000 la salida satura. Enseña por qué la ganancia se
  reparte entre etapas con un pasa altos en el medio.
- Circuito de pierna derecha (DRL, Winter y Webster): mide el modo común, lo
  invierte con ganancia G = 2·Rf/Ra y lo devuelve al cuerpo, que queda a
  Vcm / (1 + G); satura si hace falta más tensión que la alimentación.

### Filtros

| Filtro | Circuito | Parámetros | Valores típicos ECG |
| --- | --- | --- | --- |
| Pasa altos RC (1.er orden) | C en serie, R a masa | R, C → `fc = 1/(2πRC)` | 0,05 Hz (diagnóstico), 0,5 Hz (monitoreo) |
| Pasa bajos RC (1.er orden) | R en serie, C a masa | R, C | 40 Hz (monitoreo), 150 Hz (diagnóstico) |
| Pasa banda | PA + PB en cascada, o activo con op-amp | fc baja, fc alta | 0,5–40 Hz |
| Sallen-Key (2.º orden) | Op-amp, 2 R y 2 C | fc, Q (Butterworth, Bessel) | Comparar con el RC simple |
| Notch | Doble T (Twin-T) | f0 (50/60 Hz), Q | Ver el "ringing" que deja en el QRS |

Cada filtro dibuja su diagrama de Bode (módulo y fase) y su esquema con los
valores de los componentes.

El pasa banda no es un bloque aparte: es el pasa altos y el pasa bajos en
cascada, con botones para fijar las dos bandas típicas a la vez. El
Sallen-Key usa R y C como valores base y separa cada par para dar el Q de
la respuesta elegida, sin mover fc.

### ADC

- Frecuencia de muestreo (100 Hz – 2 kHz), resolución (8–24 bits), rango.
- Aliasing visible: con el pasa bajos apagado y fs baja, el ruido de alta
  frecuencia se "dobla" dentro de la banda.

## Vistas

| Vista | Pregunta | Cómo |
| --- | --- | --- |
| Monitor (osciloscopio) | ¿Cómo se ve la señal? | Barrido tipo monitor cardíaco, cuadrícula de papel ECG (25 mm/s, 10 mm/mV); referencia limpia en gris, salida en color |
| Etapas | ¿Qué hizo cada bloque? | Señal en cada punto de prueba de la cadena, apiladas |
| Espectro | ¿En qué frecuencias está la señal y el ruido? | FFT con eje log 0,05–500 Hz, antes y después |
| Bode | ¿Qué hace este filtro solo? | Módulo y fase de la función de transferencia |
| Métricas | ¿Cuánto mejoró? | Por rama: retardo, SNR, error eficaz, altura de la R y ST medido contra el real. Antes de comparar se alinea la salida en su retardo y se quita la media, porque ni el retardo ni la continua son deformación |

Igual que en Tone Lab: antes y después siempre en la misma escala para que
la comparación sea honesta.

## Etapas de implementación

Cada etapa se puede usar sola. No pasar a la siguiente hasta terminar la
actual.

0. **Esqueleto.** Proyecto Vite + React + TS, interfaz en español, estilo y
   componentes base traídos de Tone Lab (perillas, paneles), despliegue en
   GitHub Pages.
   - Listo cuando: la página vacía se publica y corre en local.
1. **Fuente ECG y monitor.** ECG por suma de gaussianas, frecuencia cardíaca
   ajustable, monitor con cuadrícula de papel ECG, play/pausa.
   - Listo cuando: se ve un ECG estable y cambiar los lpm cambia el ritmo sin
     saltos.
2. **Ruido ajustable.** Panel con cada ruido (red, deriva, EMG, blanco,
   offset), interruptor y nivel; referencia limpia superpuesta; vista de
   espectro.
   - Listo cuando: cada ruido se ve en el monitor y en su frecuencia correcta
     en el espectro.
3. **Amplificador de instrumentación.** Entradas `V+`/`V−`, ganancia por
   componentes, CMRR, saturación, esquema con valores.
   - Listo cuando: bajar el CMRR hace crecer la interferencia de red, y una
     ganancia alta con offset satura la salida.
4. **Filtros RC pasa altos y pasa bajos.** Definidos por R y C, con Bode.
   Vista de etapas.
   - Listo cuando: el Bode dibujado coincide con lo que cambia en el
     espectro, y el pasa altos quita la deriva.
5. **Pasa banda, notch y 2.º orden.** Cascada PA+PB, Twin-T, Sallen-Key.
   Ramas A/B y métricas (SNR, error RMS).
   - Listo cuando: se puede comparar en A/B 0,05 Hz contra 0,5 Hz y ver el
     efecto en el segmento ST y en el SNR.
6. **ADC.** Muestreo, cuantización, aliasing.
   - Listo cuando: el aliasing se ve al quitar el pasa bajos con fs baja.
7. **EOG.** Segunda fuente, con su propio juego de ruidos y filtros.
   - Listo cuando: se ve por qué el pasa altos del ECG arruina el EOG.
8. **Presets y exportación.** Guardar y cargar configuraciones, exportar CSV.
   Los experimentos de abajo vienen como ajustes listos (A contra B), y los
   ajustes se pueden pasar en JSON. Para el de saturación hizo falta una
   ganancia posterior, después del pasa altos.
9. **Extras (después).** Detección de QRS (Pan-Tompkins) y frecuencia
   cardíaca medida, DRL, EMG como fuente, importar registros reales de
   PhysioNet, arritmias.
   - Hecho: detector de QRS de Pan-Tompkins en tiempo real sobre la salida de
     cada rama (pasa banda 5–15 Hz, derivada, cuadrado, integración en
     150 ms, umbrales adaptativos, período refractario, rechazo de la onda T
     y búsqueda hacia atrás). Se juzga contra los latidos reales:
     sensibilidad, VPP y frecuencia medida. Tiene su propia pestaña con las
     etapas y marca las detecciones en el monitor.
     Si pasan 3 s sin ningún QRS vuelve a aprender los niveles.
   - Hecho: pierna derecha (DRL), con su experimento: 3,2 V de modo común
     saturan la etapa 1 sin DRL y quedan en 78 mV con DRL.

Las etapas 1 a 4 son la base; la mayor parte del aprendizaje está en la 3,
la 4 y la 5.

## Experimentos para aprender

- [ ] Subir la interferencia de red y bajar el CMRR. ¿Cuánto del ruido quita
      el amplificador solo, sin notch?
- [ ] Poner toda la ganancia en la primera etapa con offset de 300 mV. ¿Por
      qué satura y cómo se arregla?
- [ ] Pasa altos de 0,05 Hz contra 0,5 Hz con deriva fuerte. ¿Cuál quita más
      deriva y cuál deforma más el ST?
- [ ] Pasa bajos de 40 Hz contra 150 Hz con ruido muscular. ¿Qué le pasa a la
      amplitud de la onda R?
- [ ] Notch de Q alto contra Q bajo. ¿Cuál deja más "ringing" después del QRS?
- [ ] RC de 1.er orden contra Sallen-Key de 2.º orden a la misma fc. ¿Qué
      cambia en el espectro y en la forma?
- [ ] ADC a 100 Hz sin pasa bajos y con EMG. ¿Dónde aparece el aliasing?
- [ ] Usar el pasa banda del ECG con el EOG. ¿Qué se pierde y por qué?
