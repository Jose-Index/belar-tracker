# BTP · Auditoría de cálculos y correcciones (07/10/2026)

Revisión completa del código de la rama `btp` (src/ y api/) a petición de José, contrastada con los datos reales de Supabase (`aoexwfqlmfopemysyvtc`).

## Convenciones fijadas
- **Niveles de Londres (`.L`) en LIBRAS.** `entry_price`, `sl_price` y `tp_price` se guardan en £, nunca en peniques. Yahoo da esos precios en GBp/GBX: se dividen entre 100 antes de comparar (`lib/riesgo.js → precioEnUnidadNivel`). RR.L migrado el 07/10 (entrada 15,148 · SL 12,266601).
- **Fechas en hora de Madrid** para `week_end` y `closed_date` (`lib/fechas.js → fechaLocalISO`).
- **Base del año** = `yearly_results` del año anterior (`valor_cierre_usd`, `valor_cierre_eur`, `eurusd_cierre`). Cierre 2025: 21.766,33 $ / 18.525,33 € (hoja de José).
- **Puente** = bloque TESIS con `entry_date < 2026-09-30`: no cuenta en la medición de la Tesis nativa.

## Errores corregidos
| Gravedad | Dónde | Antes | Ahora |
|---|---|---|---|
| ALTA | Inicio · tarjeta del año | (último cierre − primer cierre del año) / primer cierre, sin descontar aportaciones (+19,93 %) | Dietz modificado desde el cierre del año anterior, en $ y en €, con las aportaciones ponderadas por fecha (−2,41 % $ · +2,0 € al 04/10) |
| ALTA | Filtro Platt | Excluía en silencio las posiciones con SL sin precio de entrada (6,4 %) | Con entrada: SL frente a entrada; sin entrada: SL frente a precio vivo; sin datos: se cuentan y se avisa (10,1 % al 07/10) |
| ALTA | api/vigia.js | Un mínimo del día a 0 en la apertura de Londres disparaba el SL (falso aviso ZEG.L 06/10) | Mínimo/máximo solo si son coherentes con el precio |
| ALTA | Posiciones · bloque TESIS | Σ y gráfica TWR mezclaban Puente y Tesis nativa | Σ TESIS nativa + línea Σ Puente aparte; la TWR excluye Puente |
| ALTA | Cerrar semana | Sin precio de BTC guardaba btc_usd = 0 (salto falso de ~5 %) | No guarda el cierre y avisa |
| ALTA (latente) | Ficha · alta | Niveles `.L` en peniques | Se convierten a libras |
| MEDIA | Inicio · Semana en curso | Última semana cerrada, sin descontar aportaciones | Total vivo frente al último cierre, menos aportaciones posteriores |
| MEDIA | Histórico · %/sem | Sin descontar aportaciones | (V_t − F_t) / V_{t−1} − 1 |
| MEDIA | twr.js | Aportación sin $ sumaba euros como dólares | € × EURUSD del cierre semanal de esa fecha |
| MEDIA | Barra Tesis, aSL/aTP | −11/+23,5 fijos | SL/TP reales de cada posición (fijos solo si faltan) |
| MEDIA | "a SL" y campana del Vigía | (px/sl − 1) y peniques sin convertir (~11.000 %) | (px − sl)/px y peniques → libras |
| MEDIA | TWR por bloque | Ventas parciales como pérdida; cierres de la semana perdidos | Reducción de invertido = retirada; cierres con su valor real |
| MEDIA | Cierres por captura | Un cierre parcial borraba la posición entera | Cierre parcial: se reduce la posición |
| MEDIA | Campos numéricos | Se comían el punto decimal; la coma daba NaN | Texto libre, se interpreta al confirmar (coma o punto) |
| MEDIA | Patrimonio | Importe $ opcional | Si falta, se estima con el EURUSD del último cierre y se avisa; invalida cachés |
| MEDIA | api/correlacion.js | Media de correlaciones por pares | Correlación con la serie semanal de la cartera |
| BAJA | Varios | Formatos de negativos, Infinity/NaN, BTC por defecto 0,014706, tooltips de la wallet | Corregidos |

## Datos corregidos en Supabase (07/10/2026)
- `entry_price` de GOOGL 342,15 · NVDA 199,66 · EWY 168,79 · ECO 49,11 · RGTI 19,70 (de los tickets de XTB/eToro).
- RR.L a libras (ver convenciones).
- `yearly_results` 2025: `valor_cierre_eur` 18.525,33 y `eurusd_cierre` 1,17495.

## Pendiente conocido (no es error de cálculo)
- `yearly_results` 2026 tiene valores antiguos (21.724,66 · −8,26 %); ninguna pantalla lo usa. Se rellena al cierre del año.
- Cerrar posición desde la app (`cerrarPosicion`) acepta fecha y valor reales, pero la pantalla aún no los pide: para cierres reales, mejor la ingesta por captura.
- Al cerrar una posición no se suma su importe a la liquidez: la liquidez se actualiza con las capturas.
