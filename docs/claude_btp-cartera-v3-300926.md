# BTP · Cartera v3 en BTP: portada por bloques + Buscador de la Tesis (30/09/2026)

Sesión del 30/09/2026 (José dicta la visión; Belar la construye). Tres piezas:

## 1. Portada = Inicio + Posiciones (una sola pantalla)
`/` (y `/posiciones`, que ya solo redirige) muestra, en este orden: cinta de Mercados → boxes
(valor total, G/P, semana, año, Platt) → **panel de Bloques** → **Posiciones agrupadas por bloque**
→ Evolución del portfolio → boxes por cuenta (broker). La página Posiciones desaparece del menú;
todo su mecanismo (modo cierre de semana, captura, altas, panel de detalle) vive embebido en la portada
(`<Posiciones embed onCambio>`).

### Bloques (src/lib/bloques.js · src/components/Bloques.jsx)
Seis bloques con peso objetivo (Cartera v3 adoptada el 30/09/2026) + caja:

| id | Bloque | Objetivo |
|---|---|---|
| BTC | BTC núcleo | 10 % |
| ORO | ORO núcleo | 8 % |
| NUCLEO | NÚCLEO (16 % ETF S&P 500 + 8 % convicciones) | 24 % |
| DELEGADA | GESTIÓN DELEGADA (BRK.B 7 % + un copy trader 3 %) | 10 % |
| OMERCADOS | O/MERCADOS | 10 % |
| TESIS | Tesis JOSE −11/+23,5 | 30 % |
| CAJA | Liquidez de brókers | 8 % → 5 % |

- Base de los pesos = posiciones + liquidez de brókers. La wallet BTC personal NO entra.
- Los objetivos se pueden sobrescribir sin código con `app_state.bloques_objetivo` = `{"TESIS":20,…}`.
- Semáforo de desvío (§7.3 de las instrucciones): |desvío| > 5 pp rojo (sin entradas nuevas en el bloque),
  > 3 pp ámbar. La tabla muestra además los $ que faltan (+) o sobran (−) para el objetivo.
- Donut: anillo exterior = real, anillo interior fino = objetivo.
- Bloque efectivo de una posición: `positions.bloque`; si está vacío, `bloquePorDefecto(p)` (BTC/VBTC → BTC,
  IGLN → ORO, NVDA/GOOGL/MU/CSPX → NUCLEO, copy traders/BRK.B → DELEGADA, EWY/Samsung/SoftBank/… → OMERCADOS,
  resto → TESIS) y el panel de detalle lo marca "(por defecto)".

### Tabla de posiciones por bloque (src/pages/Posiciones.jsx)
- Una tabla por bloque con cabecera (color, nombre, n, peso real · objetivo · desvío, G/P del bloque)
  y fila de subtotal (invertido, valor, G/P $, G/P %, peso). Cambiar el bloque en el panel de detalle
  mueve la posición de tabla. Orden por defecto: entrada (más reciente primero); ya no por broker.
- **TESIS** tiene columnas propias: P.ENT (precio de entrada), SL, TP (en gris = calculados −11/+23,5 sobre
  la entrada, aún no puestos en el ticket), → TP (barra del recorrido −11 → +23,5 con marca de entrada
  y los puntos que faltan al TP; "TP alcanzado" / "en SL"). Sin %/día ni vari/sem en ese bloque.
  La distancia al TP sale del G/P % dividido por el apalancamiento, así que funciona sin precio de entrada.
- Los demás bloques conservan %/día y vari/sem. PESO pasa a ser sobre posiciones + liquidez.
- Panel de detalle: selector de Bloque; "Precios del ticket" (entrada, SL, TP, guardado al salir del campo)
  y botón "Tesis −11/+23,5" que calcula SL y TP sobre la entrada y los guarda.
- Alta de posición: Bloque (defecto TESIS), P. entrada, SL, TP; con bloque TESIS, al fijar la entrada se
  rellenan SL y TP solos. `AltaDialog` se exporta y acepta `inicial` (prellenado desde el Buscador por
  `/?alta=<json>`). Motivos de cierre: xSL, **xTP** (nuevo), manual, escalonada. FUENTE admite MIXTA.
- Altas por captura (borrador de cierre y actualización directa) llevan bloque (`bloquePorDefecto`, editable
  en el borrador). Los cierres copian `bloque` a `position_history`.

### Tolerancia al DDL pendiente
`src/lib/posiciones-db.js`: si Supabase responde que `bloque` o `tp_price` no existen, la escritura se
reintenta sin esas columnas y el resto de la app sigue. Hasta que José ejecute el DDL, los bloques se
calculan por defecto y el panel avisa al intentar guardarlos.

## 2. Buscador de la Tesis (`/buscador`)
Filtra un **universo de valores de renta variable** con datos de **cierre** (sin tiempo real, por decisión
del 30/09) que se refresca una vez al día desde el screener de Yahoo Finance.

### Universo (tabla `universo`, api/universo-refresh.js)
- Mercados y suelos de capitalización (en USD, convertidos con FX del día):
  US (NYSE, Nasdaq, NYSE American) ≥ 150 M$ · EU (LSE, XETRA, París, Madrid, Milán, Ámsterdam, SIX, Estocolmo,
  Copenhague, Oslo, Helsinki, Bruselas, Dublín, Viena, Lisboa, Varsovia) ≥ 500 M$ · JPKR (Tokio, KOSPI/KOSDAQ)
  ≥ 1.000 M$ · CN (Hong Kong) ≥ 1.000 M$ · OTROS (Toronto, ASX) ≥ 1.000 M$.
- Se quitan los listados extranjeros (Toyota en Londres, NVDA en Varsovia) comparando la moneda de reporte
  con la casa de cada bolsa. Los ADR en EE. UU. se quedan en US con la marca `adr` = región de la empresa.
- Se recorre por (grupo de bolsa × sector) para tener el sector; ~140 tandas de hasta 250 valores,
  ~0,5 s cada una. Reanudable: progreso en `app_state.universo_refresh`; cada llamada trabaja
  `presupuesto` segundos (42 por defecto, tope 50; `maxDuration` 60 en vercel.json) y devuelve
  `pendiente:true` hasta terminar. Al acabar, lo no visto en la pasada pasa a `activo=false`.
- Campos por valor: nombre, mercado, bolsa, sector, moneda, precio (cierre), cap USD, PER trailing/forward,
  EPS, P/B, dividendo, rating medio de analistas (1 compra fuerte … 5 venta) y etiqueta, fecha de resultados
  (con marca de estimada), MA50/MA200 y distancias, máx/mín 52 s y distancia al máximo, variación 52 s,
  volumen medio (acciones y USD).
- Tendencia (api/universo-series.js, a demanda para los valores en pantalla, 20 por llamada a spark):
  perf 3 sesiones / 1M / 3M / 6M, MA20, ATR≈ (media del |cambio diario| en 14 sesiones) y distancia a la
  MA20 en ATRs. Se guarda con `series_at` para no recalcular el mismo día. Regla "no perseguir" (⚠):
  +8 % en 3 sesiones o >2×ATR sobre la MA20.
- Disparo del refresco: al abrir el Buscador, si el universo es anterior al último cierre americano
  (20:30 UTC) se refresca solo (2-3 minutos, progreso en pantalla); botón "Actualizar" para forzar.
  Además un cron de Vercel a las 21:40 UTC L-V (solo actúa si el proyecto lo despliega como Production;
  en Preview no corre). Belar también puede lanzarlo por curl con BELAR_TOKEN.
- Yahoo desde Vercel (verificado el 30/09/2026 con `?paso=prueba`): cookie, crumb, screener, spark y chart funcionan
  con el `User-Agent` mínimo de api/quotes (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)`); con el UA completo
  de Chrome Yahoo devuelve 429 en todas las puertas. Regla: en api/*.js el UA de Yahoo es siempre el mínimo (`H` de
  api/_yahoo.js). Spark se pide con sesión y, si falla un lote, esos símbolos se piden por chart (4 en paralelo).
- Auth de las rutas que trabajan (`universo-refresh`, `universo-series`): BELAR_TOKEN, CRON_SECRET o el JWT
  de sesión Supabase del usuario (verificado contra `/auth/v1/user` con la clave publicable).
  `GET /api/universo` (consulta) es abierta, como `/api/quotes`.

### Filtros y valores por defecto (src/lib/universo.js · src/pages/Buscador.jsx)
Mercado USA (chips multiselección + Todos) · Capitalización en tres chips: Mega+Grande (≥10.000 M$),
Media (2.000-10.000), Pequeña+Micro (<2.000; micro <300 M$ marcada µ = fuera de la Tesis), los tres
activos · PER 10-35 (sin beneficios fuera, salvo casilla) · Rating: compra o mejor (≤2,5; sin rating
incluidos) · **Resultados a ≤15 días excluidos** (conmutable, N editable) · Tendencia: > MA50, > MA200,
3M positivo · 11 sectores en casillas · texto libre por símbolo o nombre. Los filtros se recuerdan en el
navegador. Tabla ordenable por cualquier columna (hasta 400 filas).

### Ficha (src/components/Ficha.jsx)
Gráfica de **línea de cierres a 2 años por defecto** (3M / 6M / 1A / 2A / 5A), con MA50 y MA200 calculadas
sobre 3 años de serie diaria (`/api/history?range=3y&ohlc=1`), líneas SL −11 y TP +23,5 sobre el último
cierre, datos clave (PER, rating, resultados con días —rojo si ≤15—, vs MA50/MA200, distancia al máximo
de 52 s, ATR14 real con máximos y mínimos, 3 sesiones y ATRs sobre MA20), avisos de bandera roja y
"no perseguir", y dos acciones: **A la sombra** (inserta en `repositorio` con estado SOMBRA, precio y
fecha) y **Entrada…** (abre la portada con el alta prellenada: ticker, precio, SL, TP, bloque TESIS).

## 3. DDL (José, editor SQL de Supabase)
```sql
alter table positions add column if not exists bloque text
  check (bloque in ('BTC','ORO','NUCLEO','DELEGADA','OMERCADOS','TESIS'));
alter table positions add column if not exists tp_price numeric;
alter table position_history add column if not exists bloque text;

create table if not exists universo (
  symbol text primary key, name text, market text, exchange text, exchange_name text, adr text,
  sector text, industry text, currency text, fin_currency text,
  price numeric, price_usd numeric, cap_usd numeric, cap_local numeric,
  pe_trailing numeric, pe_forward numeric, eps_ttm numeric, pb numeric, div_yield numeric,
  rating numeric, rating_label text, earnings_date date, earnings_estimada boolean,
  ma50 numeric, ma200 numeric, dist_ma50 numeric, dist_ma200 numeric,
  high52 numeric, low52 numeric, dist_high52 numeric, perf_1y numeric,
  vol_avg numeric, vol_usd numeric,
  perf_3d numeric, perf_1m numeric, perf_3m numeric, perf_6m numeric,
  ma20 numeric, atr_pct numeric, dist_ma20_atr numeric, series_at timestamptz,
  activo boolean default true, updated_at timestamptz default now()
);
create index if not exists universo_market on universo (market);
create index if not exists universo_cap on universo (cap_usd desc);
create index if not exists universo_sector on universo (sector);
alter table universo enable row level security;   -- sin políticas: solo la clave secreta (rutas api/) la lee y escribe
```

## 4. Pendiente / siguientes pasos
- Ejecutar el DDL; asignar `bloque` a las 25 posiciones abiertas por API (Belar) y rellenar `entry_price`
  (alertas de Belar y capturas del sábado 03/10).
- Primer refresco del universo en producción (Yahoo ya comprobado desde Vercel el 30/09; el plan B —refresco desde
  Chrome de José— queda solo como reserva).
- XIRR por bloque en el panel mensual; GESTIÓN DELEGADA y BRK frente al S&P a 1/3/12 meses.
- Fase 3: repositorio, alertas.
