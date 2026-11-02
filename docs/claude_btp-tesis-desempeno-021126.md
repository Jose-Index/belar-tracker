# BTP · Página "Tesis" — desempeño real de la Tesis JOSE −11/+23,5 (02/11/2026)

Petición de José (02/11/2026): medir la Tesis con abiertas + cerradas desde que empezó la estrategia, no solo lo que sigue abierto.

## Dónde
- Ruta `/tesis`, menú lateral (y hoja "Más" en el móvil), entre Herramientas… y Histórico.
- Código: `src/lib/tesis.js` (cálculo puro) · `src/pages/Tesis.jsx` · `src/pages/tesis.css` · ruta en `src/App.jsx`.
- Sin DDL ni función serverless nueva (se mantiene en 11/12). Lee `positions`, `position_history` (bloque = TESIS) y `/api/history?symbol=SPY&range=1yd`.

## Reglas de cálculo
- **Nativa**: entrada ≥ `TESIS_ADOPCION` (30/09/2026). Es la única que sirve para juzgar la regla (§9.1).
- **Puente**: entrada anterior al 30/09, abierta hoy o cerrada después del 01/10 (`FIN_TRANSICION`). Los cierres manuales de limpieza del 30/09-01/10 (MRX, MCK, SAN1.ES, SCI) quedan fuera.
- **Cerradas**: `closed_value`, `pl_pct` y `close_reason` sellados por la ingesta (incluyen costes del bróker).
- **Abiertas**: `current_value` de la última captura, etiquetado CIERRE dd/mm. No es precio vivo.
- **Acierto** = cerradas con % > 0 ÷ cerradas. **Neto/op** = media del % de las cerradas (también se da con abiertas a valor).
- **Total** = realizado + latente; **% s/inv.** = total ÷ suma de lo invertido en todas las operaciones del grupo.
- **S&P emparejado**: SPY (sin dividendos), cierre del día de entrada → cierre del día de salida o último disponible. **VS S&P** = media de (% operación − % SPY).
- Fila de referencia del banco: 47-49 % acierto, +4,4/+5,5 neto/op, ~20 semanas; azar emparejado 7,6-9,7 % anual.
- Aviso de muestra corta mientras haya < 30 cierres nativos.

## Foto al 02/11/2026 (captura 31/10)
- Nativa: 10 ops (3 cerradas / 7 abiertas). 1 TP (SSL +23,5) y 2 SL (NTAP, SMTC −11). Acierto 33 %, neto/op cerradas +0,5 %. Realizado −27 $, latente +148 $, total +121 $ (+1,5 % s/inv.). S&P mismas fechas −1,6 % → +3,6 pp por operación; 5 de 10 baten al S&P.
- Puente: 7 ops (2 cerradas / 5 abiertas). Total −159 $ (−2,5 %), −1,5 pp frente al S&P.

## Pendiente
- Valor vivo de las abiertas cuando todas tengan `entry_price` (hoy, captura).
- Desglose por origen (YO / BELAR / MIXTA) cuando haya más de un origen en la nativa.
