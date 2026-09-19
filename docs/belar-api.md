# BTP · API Belar (lectura/escritura por token) — 19/09/2026

Puerta de acceso de Belar (Claude) a la BD de BTP sin pasar por el RLS de sesión.
Motivo: el RLS por email de la Fase 2 impide leer con la clave publicable; Belar necesita
leer posiciones al inicio de cada sesión y escribir cierres, alertas y calendario (§6, §12).

## Infraestructura (fuente de verdad — actualizar aquí ante cualquier cambio)
| Qué | Valor |
|---|---|
| Producción BTP | https://btp-belar.vercel.app (rama `btp`) |
| Supabase BTP | aoexwfqlmfopemysyvtc (org Index Lab) |
| Tracker antiguo | belar-tracker.vercel.app · Supabase ruqgzfoperkfmahpbpcv · CONGELADO 02/08/2026 · apagado previsto ≤ 26/09/2026 |
| Repo | Jose-Index/belar-tracker, rama `btp` |

## Variables de entorno (Vercel → Settings → Environment Variables, Production)
- `SUPABASE_SECRET_KEY` — clave secreta (service role) del dashboard de Supabase. Solo servidor. Marcar *Sensitive*.
- `BELAR_TOKEN` — cadena aleatoria larga (≥32 caracteres). José la guarda en su gestor de contraseñas y la pega en la conversación con Belar SOLO en el momento de configurar la variable de red de Claude; nunca en el chat en claro si puede evitarse.
- `SUPABASE_URL` — opcional; si no existe se usa `VITE_SUPABASE_URL`.

Tras crearlas: **Redeploy** del último despliegue (las funciones leen las variables al arrancar).

## Rutas
### GET /api/belar-lectura
Cabecera `Authorization: Bearer <BELAR_TOKEN>` (o `x-belar-token`).
- `?que=todo` (defecto): posiciones abiertas, alertas, calendario ≥ hoy, app_state (liquidez), últimos 4 snapshots.
- `?que=posiciones|alertas|calendario|liquidez|historico` (historico = `position_history`; columnas reales: `broker`, `event_date`, `week_end`)
- `?que=esquema` → tabla → columnas reales (OpenAPI de PostgREST).
- `?que=tabla&tabla=positions&limite=200&orden=updated_at.desc` → cualquier tabla de la lista blanca.
Respuesta siempre con `served_at` y `Cache-Control: no-store`.

### POST /api/belar-escritura
Body JSON: `{ "tabla", "accion", "datos", "filtro"?, "nota"? }`
- Tablas y acciones: positions (insert/update/upsert), alerts (idem), calendar_events (idem), position_notes (insert), repositorio (insert/update/upsert), verdict_history (insert).
- `update` exige `filtro` (p.ej. `{ "id": 21 }`) y un único objeto en `datos`.
- Sin `delete`. En BTP `positions` contiene solo las abiertas (no existe `is_open`); los cierres viven en `position_history` y los sella la ingesta de capturas de la app en el cierre de semana. Belar no sella cierres por esta ruta.
- Antes de escribir se comprueban las columnas contra el esquema real: columnas inexistentes → 400 con la lista de las existentes.
- Cada escritura se registra en los logs de Vercel (`[belar-escritura] …`).

## Uso desde Belar
```bash
curl -s -H "Authorization: Bearer $BELAR_TOKEN" "https://btp-belar.vercel.app/api/belar-lectura?que=posiciones"
curl -s -X POST -H "Authorization: Bearer $BELAR_TOKEN" -H "Content-Type: application/json" \
  https://btp-belar.vercel.app/api/belar-escritura \
  -d '{"tabla":"alerts","accion":"insert","datos":{...},"nota":"Radar 19/09"}'
```
Protocolo: al inicio de sesión Belar lee `?que=todo`. Positions solo se escribe en cierre de semana
(sobrescritura desde capturas) o para sellar cierres; alerts y calendar_events son de escritura libre de Belar.

## Seguridad
- Token en tiempo constante; sin token válido → 401 sin detalle.
- La clave secreta no sale del servidor. La publicable sigue en el frontend con RLS intacto.
- Lista blanca de tablas; nada de SQL libre; DDL sigue siendo solo por el editor SQL (regla de oro nº4).
