# Bio Lab

Un laboratorio en el navegador para aprender cómo se adquiere una señal
biomédica, etapa por etapa. Es la misma idea que [Tone Lab](../SOUND_LAB),
pero en lugar de una guitarra, pedales y ecualizadores, la fuente es una
señal fisiológica (ECG, EOG) y la cadena es la de un equipo de
instrumentación real: amplificador de instrumentación, filtros RC, pasa
banda, notch y conversor A/D.

La señal de entrada llega **con ruido**, como en la vida real: interferencia
de la red eléctrica, deriva de la línea de base, ruido muscular, offset de
los electrodos. El ruido se puede ajustar fuente por fuente, y el objetivo es
quitarlo con la cadena de procesamiento y ver en pantalla qué hace cada
bloque.

Ver [el plan de implementación](PLAN.md) para el detalle y las etapas.

## La idea en una línea

```
Fuente (ECG / EOG) → + Ruido ajustable → Amplificador de instrumentación
  → Pasa altos → Pasa bajos → Notch 50/60 Hz → (Pasa banda) → ADC → Monitor
```

Cada bloque se puede activar, desactivar y configurar por separado, y las
vistas siempre comparan contra la **señal limpia de referencia**, que el
laboratorio conoce porque la genera él mismo. Eso permite medir de verdad
cuánto ruido se quitó y cuánto se deformó la señal.

## Qué se aprende

| Bloque | Pregunta que responde |
| --- | --- |
| Fuente ECG / EOG | ¿Qué forma y qué contenido en frecuencia tiene la señal útil? |
| Ruido | ¿De dónde viene cada ruido y en qué frecuencias está? |
| Amplificador de instrumentación | ¿Por qué se amplifica la diferencia y se rechaza el modo común? ¿Qué es el CMRR? ¿Por qué no se puede poner toda la ganancia en la primera etapa? |
| Filtro RC pasa altos | ¿Cómo se elimina la deriva de línea de base sin deformar el segmento ST? |
| Filtro RC pasa bajos | ¿Cómo se quita el ruido muscular y qué se pierde del QRS? |
| Pasa banda | ¿Qué banda conviene para monitoreo y cuál para diagnóstico? |
| Notch | ¿Cómo se quita la interferencia de red y qué cuesta hacerlo? |
| ADC | ¿Qué pasa con la frecuencia de muestreo, la resolución y el aliasing? |

## Comparación A/B

Como en Tone Lab, la fuente alimenta **dos cadenas completas** (A y B). Así
se puede poner, por ejemplo, un pasa altos de 0,05 Hz en una rama y uno de
0,5 Hz en la otra, y ver exactamente qué cambia en la señal.

## Estado

Las diez etapas del plan (0 a 9) están hechas: esqueleto, tres fuentes
sintéticas (ECG con frecuencia, variabilidad, amplitud, desnivel ST y cinco
ritmos: sinusal, fibrilación auricular, extrasístoles ventriculares, bloqueo
AV de Wenckebach y taquicardia ventricular; registros reales en CSV o WFDB
de PhysioNet, con sus anotaciones; EOG horizontal con sacadas, fijaciones,
lectura, seguimiento y parpadeos; EMG de superficie con unidades motoras en
reposo, sostenido, rampa o ráfagas), monitor de barrido con cuadrícula de
papel ECG y escala en grados para el EOG, ruido ajustable con un juego por
fuente (red eléctrica diferencial y en modo común, deriva de línea de base,
EMG, ruido blanco, offset de electrodos, artefactos de movimiento),
amplificador de instrumentación de tres op-amps con ganancia posterior
después del pasa altos y circuito de pierna derecha (DRL), filtros pasa
altos y pasa bajos de primer orden (RC) o segundo orden (Sallen-Key), bandas
típicas de ECG, EOG y EMG, notch doble T y conversor A/D. Dos ramas A/B con
la misma entrada y métricas de cada una contra la señal limpia. Vistas:
espectro con la frecuencia de Nyquist, Bode calculado y medido, y señal en
cada etapa. Catorce experimentos listos (las preguntas del plan, la pierna
derecha, una arritmia, el EOG y el EMG), ajustes guardados en el navegador,
intercambio de ajustes en JSON y exportación de todas las señales en CSV.
Detector de QRS de Pan-Tompkins en cada rama, con sus etapas a la vista y su
sensibilidad, VPP y frecuencia medida contra los latidos reales. El detector
también se mide contra las anotaciones de los cardiólogos cuando un registro
real las trae. Ver [PLAN.md](PLAN.md).

## Cómo correrlo

En http://localhost:5174 (otro puerto que Tone Lab, así corren los dos a la
vez). Con Docker, con recarga en vivo al editar el código:

```bash
docker compose up --build
```

Sin Docker:

```bash
npm --prefix web install && npm --prefix web run dev
```

Las dos formas usan el puerto 5174, así que no se pueden correr a la vez.

Espacio pausa y reanuda el monitor; B cambia entre las ramas A y B. Los
ajustes guardados quedan en el navegador (localStorage); para pasarlos a
otra computadora, exportarlos en JSON.

### Versión pública

Se publica en GitHub Pages al subir una etiqueta de versión; el flujo
`.github/workflows/pages.yml` compila y despliega:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Qué hay adentro

| Parte | Dónde |
| --- | --- |
| Motor: la parte analógica a 4 kHz, los búferes de las vistas a 1 kHz | `web/src/engine/BioEngine.ts` |
| ECG sintético: suma de gaussianas P, Q, R, S, T por latido | `web/src/engine/ecg.ts` |
| EMG sintético: unidades motoras, reclutamiento y disparo (Fuglevand) | `web/src/engine/emg.ts` |
| EOG sintético: sacadas, fijaciones, lectura, seguimiento, parpadeos | `web/src/engine/eog.ts`, `web/src/components/SourcePanel.tsx` |
| Ruido ajustable, un modelo por fuente | `web/src/engine/noise.ts`, `web/src/components/NoisePanel.tsx` |
| Filtros básicos y FFT | `web/src/engine/dsp.ts` |
| Pierna derecha (DRL) | `web/src/engine/drl.ts`, `web/src/components/DrlPanel.tsx` |
| Amplificador de instrumentación de tres op-amps | `web/src/engine/amp.ts`, `web/src/components/AmpPanel.tsx`, `web/src/views/AmpSchematic.tsx` |
| Cadena de una rama (amplificador, filtros, notch, ADC) y ramas A/B | `web/src/engine/chain.ts` |
| Conversor A/D | `web/src/engine/adc.ts`, `web/src/components/AdcPanel.tsx` |
| Filtros pasa altos, pasa bajos y notch | `web/src/engine/filters.ts`, `web/src/components/FilterPanel.tsx`, `web/src/components/NotchPanel.tsx`, `web/src/views/FilterSchematic.tsx` |
| Métricas contra la señal limpia | `web/src/engine/metrics.ts`, `web/src/components/MetricsTable.tsx` |
| Experimentos, ajustes guardados y JSON | `web/src/lab.ts`, `web/src/components/PresetPanel.tsx` |
| Exportación CSV | `web/src/export.ts` |
| Registros reales: CSV, WFDB (.hea, .dat 212/16/80, .atr) y reproducción | `web/src/engine/recording.ts`, `web/src/components/RecordingPanel.tsx` |
| Detector de QRS (Pan-Tompkins) y su vista | `web/src/engine/qrs.ts`, `web/src/views/QrsView.tsx` |
| Monitor de barrido con cuadrícula de papel ECG | `web/src/views/MonitorView.tsx` |
| Espectro de la salida, con SNR | `web/src/views/SpectrumView.tsx`, `web/src/views/spectrum.ts` |
| Bode calculado y medido | `web/src/views/BodeView.tsx` |
| Señal en cada etapa | `web/src/views/StagesView.tsx` |
| Cadena interactiva: cada bloque abre su panel, uno por vez | `web/src/components/ChainView.tsx` |

## Aviso

Bio Lab es un proyecto educativo. Los modelos están simplificados a
propósito y **no** sirven para diagnóstico ni para uso clínico.

## Licencia

Código: MIT.
