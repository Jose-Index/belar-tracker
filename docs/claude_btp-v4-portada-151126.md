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
