# BTP · Especificación tabla Posiciones Abiertas (03/08/2026, rev. 22/08/2026) — CERRADA

Decisiones cerradas con José en sesión 03/08/2026. Base para el DDL y el frontend. Sin pendientes.
Revisión 22/08/2026: %/día y vari/sem redefinidas (ver Columnas). Commits rama btp: api/quotes, lib/quotes, Posiciones.jsx.
Revisión 19/09/2026 (José): %/día y vari/sem se pintan en MONOCROMO (sin verde/rojo; el signo +/− se mantiene). El color queda reservado a G/P $ y G/P %, que es la lectura principal. Commit rama btp: Posiciones.jsx.

## Columnas
ACTIVO / BROKER / ENTRADA / INVERTIDO / VALOR / G/P $ / G/P % / %/día / vari/sem / ESTADO / CLASE / APAL / PESO / FUENTE / NOTAS (icono)

- %/día — REDEFINIDO 22/08/2026 (José): rendimiento medio diario de la posición = G/P% ÷ días naturales desde ENTRADA (mín. 1). Tooltip muestra los días abiertos. No depende de precio vivo: usa el VALOR de la última captura. Nunca puede tener signo distinto de G/P%. (Definición 03/08 —variación de hoy vs cierre anterior— retirada; sobrevive como `pctHoy` en lib/quotes.js sin columna.)
- vari/sem (antes %/semana; renombrada para no confundir con %/día) — REDEFINIDA 22/08/2026: variación del ACTIVO respecto al cierre de la semana anterior = precio vivo Yahoo vs último cierre diario anterior al lunes 00:00 UTC de la semana en curso (`week_close` de /api/quotes, range=1mo). Etiqueta de frescura al pasar el ratón. Copys sin símbolo Yahoo → vacío. Motivo: VALOR solo cambia en cierre de semana, así que "valor vs último cierre" daría 0% siempre; y la implementación anterior (snapshot vs snapshot) no coincidía con el tooltip. Los snapshots semanales por posición siguen existiendo para histórico y gráficas.
- ESTADO — escala de José, campo ÚNICO y DEFINITIVO (sustituye por completo al estado operativo normal/vigilancia/salida del contexto maestro §8; confirmado 03/08), con consecuencia operativa mapeada:
  · COHETE = subida libre → trailing SL, no apretar
  · OK = normal
  · OJO = pendiente → Belar la vigila con prioridad en cada sesión
  · ¿? = evolución indeterminada → Belar debe análisis completo
  · xSALIR = quiere salir → SL pegado escalonado
  Lo fija José al cierre de semana (o lo dicta). Posición nueva entra como OK.
  Orden de urgencia (para ordenación): xSALIR → ¿? → OJO → COHETE → OK.
- FUENTE (añadida 03/08): origen de la idea, a elegir por José: Yo / Belar / Prensa / Redes. Se fija al alta, editable siempre, viaja al histórico con cada cierre → habilita RENTABILIDAD POR ORIGEN DE IDEA en la auditoría (versión medible del desempeño independiente vs condicionado). Migración: campo provisional "Resp" (Jose/Belar/Deal) del tracker viejo mapea casi directo.
- NOTAS: texto libre por posición, editable siempre, con fecha automática por nota. En tabla solo icono + preview; texto completo en vista detalle.
- SL y FECHA REVISIÓN como columnas: DESCARTADOS por ahora (decisión José 03/08).
- VEREDICTO IA: campo adicional no-columna-principal (señal de discrepancia con ESTADO en la tabla; detalle completo en panel). Ver btp-spec-analisis-ia.md.

## LIQUIDEZ por broker (José la llamaba "Saldos"; nombre acordado: Liquidez)
- Definición confirmada: dinero sin invertir en cada broker (no el total de cuenta).
- Editable solo con MODO CIERRE SEMANA ON.
- Total por broker = suma posiciones + liquidez (cifra derivada, la calcula la app).

## MODO CIERRE SEMANA (gobernanza en UI)
- Modo OFF (siempre permitido): añadir posiciones (con INVERTIDO/VALOR iniciales), cambiar CLASE, ESTADO, FUENTE, NOTAS, y CERRAR posiciones (cambio de opinión).
- Modo ON (solo en cierre): borrar posiciones, editar INVERTIDO (con box de confirmación) y VALOR, editar Liquidez por broker.
- Borrar = cerrar: registro automático en histórico ANTES de borrar. Motivo por defecto: xSL si se borra en modo cierre (90% de los casos); "manual" si se cierra con modo OFF. Ambos editables al confirmar.
- Botón: "MODO CIERRE SEMANA" → al activarse pasa a llamarse "CERRAR SEMANA" (commit). Al pulsarlo: guarda snapshot semanal por posición, calcula %/semana, sella "Último cierre: dd/mm" (visible en cabecera), lanza la actualización de calendario automáticamente (resetea su contador de 24h), lanza backup versionado si el commit fue exitoso, vuelve a OFF. Enlace discreto "salir sin cerrar" como escape.
- Diálogo de seguridad: si al pulsar CERRAR SEMANA no se ha editado la Liquidez → "¿Seguro? No se ha editado la liquidez".
- VALOR manual (captura de José) vs precio API: si divergen >~1%, marca discreta — detector de precios podridos de API, no corrección a José.

## Edición fluida de VALOR/INVERTIDO (requisito duro: 20-30 importes cada semana)
- Con modo ON: edición en línea estilo hoja de cálculo. Clic en celda, teclear, Enter/Tab salta a la siguiente. SIN diálogos por celda.
- Confirmación única al final, en CERRAR SEMANA (ahí vive el box de confirmación de INVERTIDO).

## Ingesta de capturas con IA (aprobada 03/08 — patrón INDO; "lo mejor de todo" según José)
- Con modo ON: zona de arrastre para capturas de los 3 brokers (una o varias por broker).
- Función serverless Vercel → API Anthropic (visión) → extracción estructurada: activo, invertido, valor, G/P, apalancamiento, liquidez si visible. Clave API SOLO en servidor (variable de entorno Vercel), nunca en navegador.
- PANTALLA DE REVISIÓN obligatoria, nunca auto-commit. Diff: valores viejo→nuevo por posición; posiciones ausentes de la captura → propuesta cierre xSL; posiciones nuevas en captura → propuesta de alta. José revisa (con la edición fluida como corrector) y acepta; CERRAR SEMANA sella.
- Mapeo nombre de pantalla ("NVIDIA Corp") → símbolo canónico vía tabla symbols.
- Calibración (no entrenamiento): iterar prompts con 2-3 capturas reales de cada broker (layouts distintos eToro/XTB/IBKR) en fase de construcción. José las aportará. La calibración se hace en el SANDBOX (ver abajo).
- Coste estimado: céntimos/mes (3-6 imágenes semanales).
- Fase 2 (anotado, no para v1): pre-rellenar eToro vía su API de portfolio; capturas quedarían para XTB (API muerta 2025) e IBKR.
- Badges de trazabilidad de ingesta (aprobado 03/08): NEW (azul Belar) = alta desde captura · UPD (punto discreto) = actualizada por captura · sin badge = no tocada por la captura (detector de huecos: posiciones de un broker sin marca ⇒ captura incompleta). Nacen al aceptar el diff, viven hasta el siguiente CERRAR SEMANA. En vista detalle, trazabilidad de origen por posición: "Actualizada por captura eToro · dd/mm hh:mm" o "Edición manual".

## Calendario automático con IA (aprobado 03/08; revisado: SIN botón)
Motivo: José no lee el calendario (le genera estrés); la información viene a la tabla, no al revés.
- REGLA ÚNICA DE DISPARO: siempre que BTP esté abierto y hayan pasado >24h desde la última actualización (sello en BD), se actualiza sola. Cubre ambos casos: al abrir la app (comprueba el sello) y con la app abierta (comprobación horaria en segundo plano). Sin botón.
- Refresco silencioso y no bloqueante: la app abre al instante con las marcas previas y renueva por detrás. Indicador discreto en cabecera: "Calendario · hace 3h" (sirve además de chivato si el proceso falla días seguidos).
- Función serverless recorre posiciones abiertas y busca eventos próximos por activo — earnings (lo principal), ex-dividendos, reuniones FED/BCE (índices y macro-sensibles), halving/eventos cripto. APIs estructuradas donde existan (earnings) + IA para lo difuso.
- Eventos → calendar_events vinculados a posición. En la tabla, fila afectada = punto/icono discreto; mouse over = fecha + causa ("Earnings · jue 13/08").
- Intensidad por proximidad: marca normal ≤14 días; marca fuerte (ámbar) para earnings ≤2 días hábiles (bandera roja de manual del sistema).
- Caducidad automática: solo se pintan eventos con fecha ≥ hoy; pasada la fecha, la posición vuelve sola a su estado natural. Sin mantenimiento.
- CERRAR SEMANA lanza la actualización al sellar y resetea el contador de 24h.
- El apartado Calendario (pantalla propia) pasa a secundario: listado global de consulta, sin obligación de lectura.
- Coste: diario, calderilla.

## SANDBOX / MODO PRUEBAS (aprobado 03/08)
- Solapa aparte con copia funcional de la tabla de posiciones (mismo componente, otra tabla de datos: positions_sandbox).
- Aislamiento total: nada del sandbox toca la cartera válida ni entra en Platt, snapshots, histórico, %/semana, radar ni totales del dashboard. Sin sincronización sandbox→real, nunca.
- Distinción visual imposible de confundir: banner permanente "MODO PRUEBAS" + fondo teñido/borde ámbar.
- Dos botones: "Clonar cartera real" (foto puntual de las posiciones válidas) y "Vaciar".
- Uso principal: banco de calibración de la ingesta de capturas con IA antes de usarla en la tabla real; también práctica libre de José.

## Gráficas
- Solo en vista detalle (sin sparkline en fila): precio + línea de entrada + línea de SL + marcas de cierre semanal + anotaciones de cambio de ESTADO. Histórico de precios vía API bajo demanda, sin almacenar. Los hitos globales también se pintan aquí (ver btp-spec-grafica-divisa.md).

## Ordenación
BROKER A-Z / ENTRADA / CLASE / ESTADO (orden de urgencia) / %semana / %día / PESO / G/P %. La elección se recuerda entre sesiones.

## Diseño
- Prevalece la lectura clara: la tabla puede tener varios modos visuales si no cabe todo en uno. Jerarquía visual y colapso móvil: pendiente para fase de diseño.
- Identidad v1: JetBrains Mono tabular-nums para cifras; verde/rojo solo semánticos; ESTADO como chip.

## Boxes de importes (aprobados 03/08 "sobre la marcha valoramos"; % prevalece sobre importes)
- Fila 1 (diario): Valor total ($ + frescura + %/día y %/semana de cartera) · G/P total en % (el $ en pequeño) · Rentabilidad media anual vs objetivo >15% / umbral 10% (indicador de zona) · Platt ("si todos los SLs saltan: −X%", semáforo >10%).
- Fila 2 (composición): mini-boxes por broker (invertido/valor/liquidez/G/P %) · split BTC: valor ex-monedero / solo monedero (con cantidad en BTC).
- Fila 3 (año en curso): Aportado (año/total) · Resultado del año en % vs S&P 500 e IBEX.
- Años cerrados: TABLA (no boxes) — año / aportado / valor cierre / rentabilidad % / vs S&P / vs IBEX / EURUSD cierre.

## Lotes: una fila por entrada (04/10/2026)
- Regla de José: cualquier activo con más de una entrada va en BTP con un apunte por entrada (fecha, precio, invertido propios), igual que BTC en XTB. MU en XTB separado el 04/10: lote 27/07 (0,92 acc. a 873,87, 803,96 $) y lote 04/08 (0,1006 acc. a 894,65, 90,00 $).
- Ingesta: si la captura trae los lotes desplegados, cada fila va a la posición con el invertido más cercano. Si los trae agrupados en una sola fila cuyo invertido es la suma de los lotes (±0,5 %), el valor se reparte entre ellos por número de acciones (invertido / entry_price; sin entry_price, por invertido) y la revisión lo marca "lote · reparto de N". Por eso cada lote debe llevar entry_price.
- Cierre de semana: position_snapshots tiene clave (week_end, ticker, broker); los lotes del mismo valor y bróker se suman en una fila (arreglo del error "ON CONFLICT DO UPDATE command cannot affect row a second time", 04/10/2026).

## Motivo de cierre xTP en las ingestas (24/10/2026)
- Lista única `MOTIVOS_CIERRE` en `src/lib/posiciones-db.js`: xSL, xTP, manual, escalonada. La usan la ingesta de posiciones (faltantes) y la ingesta de cierres, que antes no ofrecían xTP; el borrador de Posiciones ya lo tenía (lista propia con los mismos valores).
- `motivoPropuesto(pos, pct)`: propone el motivo comparando el % realizado con `sl_price` / `tp_price` sobre `entry_price` (tolerancia 1,5 pp por divisa, comisiones y deslizamiento; si casan los dos, el más cercano). Sin niveles o sin casar: ingesta de cierres → manual; faltantes → xSL (con el último valor de captura). Siempre editable en la revisión.
- `close_reason` es texto libre en la base: xTP no necesita DDL.

## Ingesta única de capturas (24/10/2026)
Sustituye a "una pasada por broker". Vive en MODO CIERRE SEMANA (al borrador) y en ACTUALIZAR POR CAPTURA (directo).
- **Cola**: se echan capturas en las tandas que se quiera (cualquier broker, posiciones abiertas e historial de cerradas). Miniaturas con estado; "Leer todas (N) y revisar". Desde la revisión, "← capturas" vuelve a la cola para añadir más; lo leído no se relee.
- **Lectura**: una captura por llamada a `/api/ia-capturas` con `modo: 'auto'` (3 en paralelo); la IA devuelve `{ tipo: 'abiertas'|'cerradas', extracciones }`. Tipo y broker corregibles en cada miniatura sin volver a leer. Si una falla, se reintenta solo esa. `maxDuration` 60 s en vercel.json.
- **Abiertas**: se juntan por broker y se quitan las filas repetidas (capturas solapadas); después, el cruce de siempre (actualizaciones, altas, lotes).
- **Historial** (`cruzarCierres`): cada cierre se casa con la abierta del mismo broker y ticker (lotes: invertido más cercano; nombre no reconocido: mismo invertido ±0,5 %). Motivo con `motivoPropuesto` sobre el % de precio (el % del importe dividido por el apalancamiento). Se descarta lo que ya está en `position_history` (broker + ticker + fecha + invertido ±0,5 %; `fetchCierresDesde`). Cierres anteriores a 7 días antes del último cierre sellado: plegados y desmarcados, salvo que casen con una abierta. Sin abierta en BTP: "solo histórico" (abierta y cerrada entre cierres). Cierre menor que el invertido: parcial (reduce, no borra).
- **Sin dato de cierre**: abiertas de un broker con captura de posiciones que no salen ni en ella ni en el historial. Desmarcadas: si se marcan, se cierran con el valor de la última captura.
- **Sellado**: `pendCierres` admite `{ pos, motivo }` (valor de la última captura, `cerrarPosicion`) y `{ pos|null, motivo, real }` (datos del broker, `registrarCierre`). Un cierre del historial sustituye a uno "con el último valor" de la misma posición.
- La ingesta de cierres de Histórico (`IngestaCierres`) se mantiene para correcciones a posteriori.
- Robustez (24/10/2026 tarde, primer uso real: historial de eToro recortado sin cabecera, leído como XTB y con la fecha de apertura por la de cierre → 3 cierres plegados como "anteriores"):
  · Prompt: sin cabecera, dos fechas por fila / precio de cierre / distintivo SL/TP = historial; "COMPRAR/VENDER <ticker>" + "$1,000.00" = eToro; la primera fecha es la apertura. Lee además `precio_apertura`, `precio_cierre` y `motivo_broker` (SL/TP del distintivo).
  · Cruce: broker corregido si en el leído no está la posición y en otro sí (mismo ticker e invertido ±0,5 %); fechas cruzadas se intercambian; el motivo del distintivo manda; si no, % de precio (precios de la fila) o % de importe ÷ apalancamiento.
  · Todo cierre que casa con una abierta va arriba, sea cual sea la fecha leída ("fecha antigua" como aviso). Fecha de cierre anterior a la apertura de la posición → ⚠ revisar.
- Segundo uso real (24/10/2026, 19:35): BTC y MU de XTB salían 4 veces (una captura con la fila agrupada y otra con los lotes) y los cierres con año 2024 y SSL mal leído.
  · `juntarAbiertas`: filas iguales = mismo ticker e invertido (el valor puede variar entre capturas); con fila agrupada + lotes desplegados, la agrupada se quita (invertido = suma de los demás ±0,5 %). Nunca dos actualizaciones para la misma posición.
  · Cierres: `arreglarAnio` (fecha fuera de los últimos 400 días → mismo día y mes de este año o del anterior). `gp_pct` (columna % del broker) manda sobre el importe leído si no cuadran (tolerancia máx(0,30 $; 0,08 %)): aviso "importe por %".

## Ingesta fiable: alta resolución y cuadre por bróker (25/10/2026)
Incidente: el cierre del 24/10 dejó BTP en 24.101,81 $ frente a 25.638,20 $ reales. Causas: la caja de eToro no se leyó (se quedó en 120,29 frente a 2.537,43), SSL (TP del 22/10) siguió abierta, RR.L se selló con la fecha de apertura (24/08) y BAMNB (IBKR, en EUR) se sumó como si fueran dólares. Origen: el lector (claude-sonnet-4-5, resolución estándar de 1568 parches) veía una captura de 2300 px reducida a unos 1000 px y leía mal columnas, cifras y fechas.
- `api/_anthropic.js`: `MODEL_VISION` (variable `ANTHROPIC_MODEL_VISION`, por defecto `claude-opus-5-5`, alta resolución: 2576 px y 4784 parches). `api/ia-capturas.js` lo usa con max_tokens 8192; si el modelo no está disponible para la clave, reintenta con `MODEL`. La respuesta trae `_modelo`.
- `src/lib/ia.js` `leerImagen`: reescala al máximo que ve el modelo (lado largo ≤2576 y ⌈w/28⌉·⌈h/28⌉ ≤ 4784), JPEG 0,9.
- Prompt: fecha de hoy en cabecera; por fila `moneda` (IBKR escribe la divisa bajo cada importe) y `gp_pct`; por captura `total_cuenta` (eToro "Valor Total", XTB "Valor de Mis Operaciones", IBKR "Cuenta"); liquidez en la barra inferior de eToro ("Saldo Total Disponible") y en la cabecera de XTB ("Capital disponible"); "P/L Diario" de eToro nunca es el G/P; orden de columnas del historial de eToro (Abierto/Cerrado son precios); fechas con el día primero y el año tal como aparece.
- Revisión (`IngestaIA.jsx`): filas en otra divisa → USD con el cambio de Yahoo (`/api/quotes`, `XXXUSD=X`; GBp = GBP/100), etiqueta "EUR→$ ×k"; corrección del valor cuando se aparta >1 % del invertido de invertido + G/P e invertido × (1 + G/P %), que coinciden (copy traders fuera); agrupada reconocida también por la suma de valores.
- **Cuadre** arriba de la revisión, por bróker: lo que BTP tendrá al aceptar (actualizaciones + altas + abiertas que se quedan + liquidez leída o la actual) frente al `total_cuenta` de la captura; ✓ si la diferencia es ≤ máx(5 $; 0,5 %). Aviso "liquidez no leída" si la captura de abiertas no trae saldo.
- Cierres: fecha editable en cada fila; `fechaDudosa` (sin fecha, igual a la apertura leída, ≤ apertura de la posición o anterior al último cierre sellado) bloquea el aplicar hasta corregirla o pulsar "confirmar". Cierre ya sellado con OTRA fecha (mismo bróker, ticker, invertido ±0,5 % y valor de cierre ±1 %): no se duplica; se propone corregir la fecha (`corregirFechaCierre` en `posiciones-db.js`, se escribe al aplicar).
- Banco de prueba con las capturas reales del 25/10: eToro 10.730,74 = captura; XTB 8.479,65 = captura; IBKR 5.235,54 frente a 5.235,52.

## BTP pide lo que falta antes de aplicar (25/10/2026)
- La revisión lleva una lista "Falta información para aplicar" y el botón queda desactivado ("Faltan N dato(s)") hasta completarla. Entra en la lista:
  · posición del bróker capturado que no sale ni abierta ni en el historial: hay que decir "sigue abierta (no salía en la captura)" o "se cerró" con fecha, importe recibido y motivo (nunca se cierra sola con el último valor);
  · saldo disponible no leído: se escribe en la fila del cuadre;
  · bróker que no cuadra con el total de la captura: revisar o marcar "acepto la diferencia";
  · valor dudoso: comprobar y pulsar "⚠ revisar" (pasa a "✓ revisado");
  · alta sin fecha de apertura; cierre con fecha dudosa o sin importes.
- CERRAR SEMANA: si alguna posición no ha recibido captura ni valor nuevo (ni se cierra), lo lista por bróker y pide pasar la captura que falta antes de sellar con el valor de la semana pasada.
- Toda la tarjeta de la ingesta acepta capturas (también sobre la cola y en la revisión, que vuelve a la cola); soltar fuera no abre la imagen.
