# BTP · Track de cierres de posiciones (13/09/2026)

Sesión 13/09/2026. José: "quiero capacidad analítica máxima; arregla lo que haga falta para tener el track adecuado de las posiciones que se cierran". Ejecutado por Belar en el editor SQL de Supabase (regla de oro 4).

## Hechos verificados (leídos de la BD, no de memoria)
- Producción (belar-tracker.vercel.app, rama main, "v11") sirve datos desde el Supabase ruqgzfoperkfmahpbpcv. Es la única BD Belar en la cuenta de José (la otra es INDO).
- El histórico de cierres NO es la tabla position_history (son snapshots semanales, 444 filas). Los cierres viven en positions con is_open=false (84 filas a 13/09).
- Estado previo del histórico: closed_date 7/84, closed_value 7/84, close_reason 3/84, resp (fuente) 36/84 (ninguna desde mediados de mayo), class con valor por defecto 'TÁCTICA' en muchas filas. Rentabilidad por origen/categoría sobre cerradas: incalculable.

## Cambios en BD (13/09)
1. Trigger `trg_positions_close_seal` (before insert/update on positions): cuando is_open pasa a false sella closed_date (hoy), closed_value (current_value) y close_reason ('SIN_MOTIVO') si vienen NULL. Ningún cierre vuelve a quedar sin fecha ni valor, sea cual sea el código que cierre.
2. Columna nueva positions.close_note (text): motivo/lección del cierre, libre.
3. Vista `v_cierres`: id, ticker, platform, class, fuente (=resp), leverage, entry_date, closed_date, invested, closed_value, gp, gp_pct, dias, close_reason, close_note. Base para rentabilidad por FUENTE y por CLASE.
4. Backfill estimado: closed_date y closed_value = último snapshot semanal de position_history; close_reason='ESTIMADO' (65 filas). 14 sin snapshot quedan NULL. 2 con valor 0 (LITE, OXY) marcadas SIN_DATO. Normalización: TACTICA→TÁCTICA, NUCLEO→NÚCLEO. Valores 'SALIR'/'xSALIR' en class (YPF, 7012.T, CCJ) son estados, no clases: pendiente de que José asigne clase.

## Reglas operativas desde hoy
- Alta de posición: class real (no el defecto) y resp (Yo/Belar/Prensa/Redes) obligatorios. Belar lo comprueba en cada cierre de semana con: `select ticker from positions where is_open and (resp is null or class is null)`.
- Cierre (por SL o manual): close_reason ∈ {SL, TRAILING, MANUAL, PARCIAL, BROKER} y closed_value = importe real de salida del broker. Si el cierre se detecta en cierre de semana sin captura de cerradas, el trigger sella provisional y Belar corrige con la captura de historial del broker.
- Auditoría mensual: consulta base sobre v_cierres agrupada por fuente y class (n, media %, ganadoras, días medios) + comparación con SPX en la misma ventana.

## Pendiente
- resp en 48 cierres mayo-agosto y clase en las TÁCTICA por defecto: lista para José, opcional (él prioriza el track hacia delante).
- Añadir close_reason/close_note al formulario de cierre del frontend (main). Hasta entonces, Belar los escribe por SQL en cierre de semana.
- Subir este doc a docs/ del repo: el editor web de GitHub devolvió "File could not be edited" en main y en btp (13/09). Reintentar por Vía B o subida manual.
