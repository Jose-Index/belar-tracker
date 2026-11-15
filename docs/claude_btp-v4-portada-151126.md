# BTP v4 · paso 2a: portada nueva y diseño A "Suizo" (15/11/2026)

José pidió un cambio estético, eligió dirección clara y sobria y, de tres propuestas con sus datos reales, la A
("Suizo"). Lienzo de las propuestas: https://claude.ai/artifact/JGwWvp5JAjwFtHVny6DaPj

## Diseño (tokens en `src/tokens.css`, identidad v2)

- Fondo blanco, tinta `#111111`, gris de apoyo `#5A5A5A`, líneas `#E4E4E4`, un solo acento azul cobalto `#1F4FD8`.
- Inter en todo, con cifras tabulares (ya no se usa JetBrains Mono ni Space Grotesk). Esquinas rectas (`--radius: 0`).
- Verde `#0B7A43` y rojo `#C22F24` solo en G/P, siempre con signo. Ámbar `#8A5200` para un nivel cercano.
- En escritorio el menú va arriba, en una línea, con regla negra debajo. En móvil siguen la cabecera compacta y las pestañas.

## Portada (`src/pages/Portada.jsx`, `src/pages/portada.css`) — ruta `/`

- Solo posiciones. Resumen: total, G/P abierto y caja. El resultado del año vuelve con la página Rendimiento.
- Agrupar por Tesis, Bróker o Sin agrupar; ordenar por Rendimiento, Fecha o Valor (se recuerda en el navegador).
- Siete columnas: Posición, Bróker, Entrada, Nivel más cercano, Valor, G/P, G/P %. Cabecera de grupo con número de
  posiciones, valor, G/P y G/P %. La wallet BTC va aparte, fuera de la base.
- Nivel más cercano: stop u objetivo, con el precio estimado de la última captura (entrada × valor ÷ invertido). Sale en
  ATR si la pasada diaria de Belar lo dejó en `app_state.belar_diario.cercanos`; si no, en %.
- Ficha (al pulsar una posición o un grupo): gráfica en % y como mucho UN comparador (S&P 500, Nasdaq 100, Oro, Ibex 35,
  Euro Stoxx 50, Bitcoin). Posición: precio diario de un año (`/api/history?range=1yd`), periodos Entrada, 1M, 3M, 6M, 1A.
  Grupo por tesis: rentabilidad por cierres de semana (`serieTWRBloques`), periodos 1M, 3M, Todo. Por bróker aún no hay
  gráfica: llega con Rendimiento.
- Al pie, los próximos 14 días del calendario.
- Es de solo lectura. La vista anterior (cierre de semana, altas, capturas, edición de niveles, Reparto, evolución) sigue
  entera en `/gestion` hasta que se migren sus funciones. La ficha del Buscador abre las entradas preparadas en `/gestion`.

## Pendiente del paso 2

- (Hecho el 15/11, `publicar.py` v3) La pasada diaria guarda en `app_state.belar_diario.niveles` el nombre, el ATR y la
  distancia al SL y al TP de todas las posiciones; la portada los lee de ahí.
- Gráfica de grupo por bróker y resultado del año (página Rendimiento).
- Menú definitivo de ocho entradas: Posiciones, Rendimiento, Buscador, Alertas, Calendario, Gurús, Reparto, Log.

## Paso 2b (15/11/2026)

- Portada: botón "Nueva posición" (AltaDialog) y, en la ficha, "Editar niveles, tesis y notas" (PanelDetalle de Posiciones.jsx).
- Menú: Posiciones, Rendimiento, Buscador, Alertas, Calendario, Reparto, Log; y, más discretas, Tesis, Cierre de semana, Fuentes y
  Ajustes (antes Herramientas). Gurús entrará cuando exista su página. Histórico y Patrimonio € ya no tienen entrada propia.
- `Inicio.jsx` se reparte con la prop `vista`: `/rendimiento` (cifras, evolución y cuentas, seguido de Histórico y Patrimonio €),
  `/reparto` (pesos por tesis) y `/gestion` (tabla de gestión con el cierre de semana). El bloque Mercados deja de mostrarse.

## Rendimiento (`src/pages/Rendimiento.jsx`, 15/11/2026)

- Gráfica de rentabilidad por cierres de semana (TWR, sin aportaciones) del total o de una cuenta (eToro, XTB, IBKR, wallet),
  con periodos 1M, 3M, 6M, Año, 1A y Todo y un solo comparador (índice diario de 3 años por `/api/history`).
- Tabla por periodos de las cinco series y tabla por años (`yearly_results`).
- Debajo siguen, con su maquetación anterior, las cifras (`Inicio vista="rendimiento"`), Histórico y Patrimonio €.
- Pendiente: sellar el cierre de año (alta en `yearly_results` a 31/12) y retirar los bloques antiguos que queden duplicados.

## BTC Combo (`src/pages/Combo.jsx`, ruta `/combo`, 15/11/2026)

Precio diario de BTC con su media de 200 sesiones, RSI(14) de Wilder con los umbrales de la regla, régimen y condición de
entrada o salida de la última vela cerrada. Datos de BTC-USD (Yahoo). El aviso al móvil lo da el Vigía (ver docs/belar-api.md).

## Gurús (`src/pages/Gurus.jsx`, ruta `/gurus`, 15/11/2026)

Lista por fecha de la actividad de los gestores seguidos, con filtro por gestor y marca cuando toca un valor en cartera.
La escribe la tarea programada "Belar gurús (BTP)" en `app_state.gurus_feed`. Calendario: la portada ya no enseña eventos
de posiciones cerradas; añadidas la Fed del 09/12, el cierre de año y la fecha de los 13F.

## Cierre de año (15/11/2026, noche)

- Rendimiento → "Por años": la fila del año en curso se calcula sola con cada cierre de semana (cartera por TWR de cierres de semana; S&P 500 e Ibex 35 por su último cierre diario) y sustituye en pantalla a la fila guardada sin sellar.
- Botón "Sellar el cierre de AAAA": activo desde el 31/12. Guarda en `yearly_results` rentabilidad, índices, valor de cierre en $ y €, cambio, y marca `legacy.sellado`. En enero-marzo, si el año anterior no está sellado, el año que se ofrece es ese.
- Se quita de la página la gráfica "Evolución" antigua (duplicaba la nueva). Siguen debajo las cajas de cifras, cuentas, cierres, histórico semanal y aportaciones.
- La rentabilidad de 2026 depende de que `contributions` tenga las aportaciones de octubre y noviembre.

## Rendimiento en euros (15/11/2026, noche)

- La página mide en euros por defecto (selector Moneda € / $): cada cierre de semana y cada aportación se pasa a euros con el cambio de su semana.
- Motivo: José aporta y mide en euros. 2025 fue +18,9 % en euros (cifra guardada, correcta) y casi +40 % en dólares, porque el dólar perdió un 13 % ese año. La cifra en dólares no era su rentabilidad.
- "Por años" lleva dos columnas: Cartera € (guardada en 2024 y 2025; calculada en el año en curso) y Cartera $ (calculada).
- El sellado de fin de año guarda la rentabilidad en euros en `rentabilidad_pct` y la de dólares en `legacy.usd_pct`.
- El total cuenta desde el 07/12/2024, primera semana con los brókers en los cierres.
