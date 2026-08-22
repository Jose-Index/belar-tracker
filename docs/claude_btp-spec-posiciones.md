# BTP · Especificación tabla Posiciones Abiertas (03/08/2026, rev. 22/08/2026) — CERRADA

Decisiones cerradas con José en sesión 03/08/2026. Base para el DDL y el frontend. Sin pendientes.
Revisión 22/08/2026: %/día y vari/sem redefinidas (ver Columnas). Commits rama btp: api/quotes, lib/quotes, Posiciones.jsx.

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
