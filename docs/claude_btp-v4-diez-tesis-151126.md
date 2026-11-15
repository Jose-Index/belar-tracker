# BTP v4 · paso 1: las diez tesis en los datos (15/11/2026)

Cartera v3.2, adoptada el 15/11/2026. En pantalla se llaman "tesis"; en el código y en la base, `bloque`.

## Tesis y pesos objetivo (`src/lib/bloques.js`)

| Id | Nombre | Objetivo |
|---|---|---|
| TESIS | Tesis JOSE −11/+23,5 | 32 |
| SP500 | SP500 | 18 |
| CONVICCION | CONVICCIÓN | 14 |
| ORO | ORO | 12 |
| BTC_LARGO | BTC largo | 5 |
| BTC_COMBO | BTC Combo MA200 | 5 |
| COPY | COPYTRADING | 4 |
| EXPECT | EXPECT | 4 |
| OETFS | O/ETFs | 3 |
| CAJA | Caja | 3 |

Los objetivos se pueden sobrescribir en `app_state.bloques_objetivo` (mapa id → %), sin tocar código.

## Qué cambia

- **Base de los pesos:** posiciones + liquidez de brókers. La wallet BTC personal queda fuera: no suma a ninguna tesis y en
  Posiciones va en su propio grupo, al final ("BTC wallet · fuera de la base").
- **Nombres de la v3** (BTC, NUCLEO, DELEGADA, OMERCADOS, SATELITE): `bloqueDe()` los traduce al leer y nunca se escriben.
  NUCLEO → SP500 si el ticker es un ETF del S&P 500 (`ETF_SP500`), si no CONVICCION; OMERCADOS → CONVICCION; DELEGADA → COPY;
  SATELITE → EXPECT; BTC → BTC_COMBO si `clase` es MOMENTUM o TACTICA, si no BTC_LARGO. El histórico de cierres
  (`position_history.bloque`) conserva los nombres antiguos.
- **`clase`** es una columna heredada con CHECK: se deriva de la tesis con `claseDe()` (TESIS → TACTICA, BTC_COMBO → MOMENTUM,
  EXPECT → DISRUPTIVA, resto → NUCLEO). Desaparece el desplegable de estrategias de BTC.
- **Origen:** desplegable YO / BELAR / MIXTA / GURÚ en el alta y en el detalle; se guarda en `fuente`.
- **Panel "Bloques"** pasa a llamarse **Reparto**.
- Regla de ascenso: de Tesis a EXPECT solo en ganancia ≥ +23,5 (antes, a SATÉLITE).

## Base de datos (migración `btp_v4_diez_tesis_restricciones`, autorizada por José)

```sql
alter table positions drop constraint positions_bloque_check;
alter table positions add constraint positions_bloque_check check (bloque in
  ('TESIS','SP500','CONVICCION','ORO','BTC_LARGO','BTC_COMBO','COPY','EXPECT','OETFS',
   'BTC','NUCLEO','DELEGADA','OMERCADOS','SATELITE'));
alter table positions drop constraint positions_fuente_check;
alter table positions add constraint positions_fuente_check check (fuente in ('YO','BELAR','MIXTA','GURU','PRENSA','REDES'));
alter table repositorio drop constraint repositorio_estado_check;
alter table repositorio add constraint repositorio_estado_check check (estado in ('ENTRAR_YA','RADAR','CERRADA','SOMBRA'));
```

Ejecutada con el conector de Supabase de Claude (no por el editor SQL). Solo cambia restricciones; no toca datos.
Los nombres antiguos de `bloque` siguen admitidos; se quitan cuando no quede ninguna fila con ellos.

## Migración de datos (por `/api/belar-escritura`, tras desplegar este código)

- `positions.bloque` y `clase` de las abiertas, con la tabla de arriba.
- `app_state.bloques_objetivo` con los pesos de la v3.2 y `app_state.bloques_orden` con el orden nuevo.
