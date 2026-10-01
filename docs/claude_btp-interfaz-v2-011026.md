# BTP · Interfaz v2 (01/10/2026) — fluidez, refresco y móvil

Petición de José (01/10/2026): "trabajar en el diseño del interface… tener en cuenta la versión móvil… la fluidez de uso y refresco". Tres frentes, todos en producción desde el 01/10/2026.

## 1. Fluidez y refresco: caché compartida (`src/lib/cache.js`)

Antes cada pantalla leía Supabase y Yahoo por su cuenta al montarse (la portada hacía 4 lecturas; Evolución, Histórico, Alertas y Calendario repetían las suyas) y no se actualizaba sola.

Ahora hay una caché única en memoria con revalidación en segundo plano (*stale-while-revalidate*):

- **Pinta al instante**: cada clave guarda una instantánea en `localStorage` (`btp-cache:<clave>`); al abrir la pestaña se pinta con el último dato conocido y se revalida detrás.
- **Una sola petición en vuelo por clave**, aunque la pidan varios componentes (portada y tabla de posiciones comparten `posiciones`; portada, Evolución e Histórico comparten las semanas).
- **Revalidación al volver** a la pestaña (`visibilitychange` / `focus`) si el dato ha caducado (TTL por clave: 60 s datos de cartera, 5 min listas y semanas, 15 min series).
- **Precios en sondeo**: `useSondeo` relee las cotizaciones cada 60 s si algún mercado está abierto/pre/post, cada 5 min si todo está cerrado (`intervaloPrecios` en `lib/quotes.js`). Solo con la pestaña visible.
- **Invalidación tras escribir**: cierre de semana, altas y cierres llaman a `invalidar(['inicio','evolucion','historico','calendario'])` y las claves se recargan solas.
- **Indicador global** (`EstadoDatos.jsx`): punto + "hh:mm · hace X" + botón de refresco que fuerza todas las claves en pantalla (`refrescarTodo`). En escritorio al pie del menú; en móvil en la cabecera.

API: `useCache(key, loader, {ttl, persist, activo, deps})`, `useSondeo(key, loader, {intervalo, …})`, `cargar(key, loader, {forzar})`, `fijar(key, data)`, `invalidar(prefijos)`, `useEstadoDatos()`, `refrescarTodo()`.

Claves en uso: `inicio`, `posiciones`, `evolucion`, `historico:semanas`, `alertas`, `calendario`, `mercados:lista`, `quotes:<símbolos>`, `history:<sym>:<rango>`, `universo:estado`, `universo:busqueda`.

## 2. Móvil (≤ 900 px)

- **Cáscara**: cabecera compacta fija arriba (marca + estado de datos) y **barra inferior de pestañas** (Inicio, Buscador, Alertas, Calendario, Más). "Más" abre una hoja con Histórico, Repositorio, Patrimonio €, Fuentes y Herramientas. El menú lateral desaparece. `src/App.jsx`, `src/index.css`.
- **Portada** (orden con CSS `order`): resumen (valor total a doble ancho, G/P, semana, año, Platt) → **Mercados como tira horizontal** con desplazamiento y snap (sin "vs cartera" ni comparativa) → **Bloques sin donut** y con cuatro columnas (bloque, valor, real/obj, desvío; etiqueta corta) → **posiciones como lista de tarjetas** por bloque → Evolución (controles en una fila desplazable) → cuentas.
- **Lista de posiciones** (`.pos-lista`, solo fuera del modo cierre): dos líneas por posición. Izquierda: ticker, broker, estado si no es OK, apalancamiento; debajo fecha de entrada e invertido (Tesis: la barra SL −11 → TP +23,5 con "X pp al TP"). Derecha: valor, G/P % y $, peso en cartera. Subtotal por bloque. El modo cierre mantiene la tabla editable con scroll horizontal.
- **Detalle de posición como hoja deslizante** desde abajo (fondo oscuro que cierra al tocarlo, cabecera pegada, scroll propio, bloqueo del scroll del fondo). Alta de posición y modales: hoja desde abajo.
- **Buscador**: filtros plegados tras la primera búsqueda bajo una barra-resumen ("Filtros · US · Mega+Grande · PER 10–35 · rating ≤2 · sin result. <15d…") que los despliega; botón Buscar pegado al pie del panel de filtros; resultados como lista de dos líneas (símbolo + nombre / mercado · cap · PER · ★rating · fecha de resultados en rojo si ≤15 días · ⚠ perseguir; a la derecha 3M y distancia al máximo); selector de orden propio. **Ficha a pantalla completa** con cabecera pegada y botones "A la sombra" / "Entrada…" a todo el ancho.
- **Alertas y Calendario**: el formulario de alta se pliega tras "+ Alerta" / "+ Evento"; los chips de cada evento bajan de línea.
- Hook `useMovil()` (`src/lib/movil.js`, mismo corte que el CSS), `useSinScroll(activo)` y `useArrastreCierre(onClose)`: la hoja de detalle, la Ficha y la hoja "Más" se cierran arrastrándolas hacia abajo (arranca solo con la hoja en lo alto de su scroll; umbral 90 px; por debajo vuelve a su sitio).
- PWA: manifest e iconos desde el 19/09; el 01/10 se añaden `viewport-fit=cover` y las metas `apple-mobile-web-app-*` para que, añadida a la pantalla de inicio del iPhone, abra a pantalla completa con la barra inferior respetando el indicador de inicio.

## 3. Escritorio

- Menú lateral con el estado de datos al pie; sección activa con fondo azul tenue.
- Cabeceras de tabla pegadas (`position: sticky` en `.pos-tabla th`), foco visible con teclado (`:focus-visible`), `prefers-reduced-motion` respetado.
- Sin cambios funcionales en tablas ni en el modo cierre.

## Pruebas

Local con el mock (`.devmock/vite.dev.mjs`, puerto 5199): `.devmock/shot.mjs <ruta>` (escritorio 1440), `.devmock/shotm.mjs <ruta> <png>` (móvil 390×844, página completa) y `.devmock/shotx.mjs <ruta> <png> [selectores a pulsar…]` (móvil, estados: filtros abiertos, ficha, hoja de detalle, hoja "Más"). Compilación limpia (`npx vite build`).

## Pendiente / ideas

- Modo oscuro (los tokens existen en `tokens.css`; falta activarlo y repasar los colores fijos de fondos de estado).
- Comparativa "vs cartera" en móvil (hoy oculta).
