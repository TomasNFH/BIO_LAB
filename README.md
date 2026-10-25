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

Etapas 0 a 2 hechas: esqueleto, fuente ECG sintética (frecuencia,
variabilidad, amplitud), monitor de barrido con cuadrícula de papel ECG,
ruido ajustable (red eléctrica, deriva de línea de base, EMG, ruido blanco,
offset de electrodos, artefactos de movimiento) y espectro con SNR de
entrada. Lo siguiente es el amplificador de instrumentación. Ver
[PLAN.md](PLAN.md).

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

Espacio pausa y reanuda el monitor.

### Versión pública

Se publica en GitHub Pages al subir una etiqueta de versión; el flujo
`.github/workflows/pages.yml` compila y despliega:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Qué hay adentro

| Parte | Dónde |
| --- | --- |
| Motor: genera la señal en tiempo real y la guarda en un búfer circular | `web/src/engine/BioEngine.ts` |
| ECG sintético: suma de gaussianas P, Q, R, S, T por latido | `web/src/engine/ecg.ts` |
| Ruido ajustable, un modelo por fuente | `web/src/engine/noise.ts`, `web/src/components/NoisePanel.tsx` |
| Filtros básicos y FFT | `web/src/engine/dsp.ts` |
| Monitor de barrido con cuadrícula de papel ECG | `web/src/views/MonitorView.tsx` |
| Espectro antes de la cadena, con SNR de entrada | `web/src/views/SpectrumView.tsx` |
| Cadena de adquisición (bloques hechos y pendientes) | `web/src/components/ChainStrip.tsx` |

## Aviso

Bio Lab es un proyecto educativo. Los modelos están simplificados a
propósito y **no** sirven para diagnóstico ni para uso clínico.

## Licencia

Código: MIT.
