# BTP · Regla de entorno de trabajo (rev. 08/08/2026, tarde)

## Vía válida desde sesión en la nube
El proxy del contenedor bloquea la ESCRITURA a GitHub (git push y API REST → 403,
"Write access to this GitHub API path is not permitted through this proxy"). No es
cuestión de token. Pero **sí se puede desarrollar desde la nube con Chrome MCP**: el
navegador de José va por su sesión, no por el proxy.

Siempre: clonar el repo en el contenedor en solo lectura, editar ahí y **compilar**
(`npx vite build`) antes de subir nada.

## Vía A · Subida de ficheros — LA ÚNICA RECOMENDADA
1. `github.com/Jose-Index/belar-tracker/upload/btp/<carpeta>` — la ruta de la URL decide
   dónde caen; una subida por carpeta.
2. Copiar los ficheros a `/mnt/user-data/outputs/` **con su nombre definitivo** y usar
   `file_upload` de Chrome MCP sobre el `input[type=file]`. Mismo nombre = sobrescribe.
3. Mensaje de commit: fijarlo por JS sobre `input[placeholder="Add files via upload"]`
   con el setter nativo + evento `input`. El `type` por teclado no entra en ese campo.
4. Esperar ~3 s (GitHub procesa el manifiesto) y pulsar "Commit changes" **por
   coordenadas del screenshot**. Los clics por `ref` no disparan el submit. **Si no
   navega al primer clic, repetirlo**: es normal necesitar dos o tres.
5. Confirmar que la URL pasa a `/tree/btp`.

## Vía B · Editor web — PROHIBIDA salvo emergencia
El 08/08 corrompió `IngestaIA.jsx`: una llamada de `javascript_tool` falló con "Promise
was collected" **pero había ejecutado la pega igualmente**; al reintentar, el fichero
quedó triplicado (288 → 867 líneas) y así se comiteó. Se restauró con la vía A.
Si alguna vez hay que usarla: comprobar el número de líneas del editor ANTES de comitear
(`document.querySelectorAll('.cm-line')` no vale, está virtualizado — mejor comparar el
tamaño del texto pegado con el esperado), y nunca reintentar una pega que "falló" sin
verificar antes qué quedó en el editor.

## REGLA DE DOCUMENTACIÓN (22/08/2026, orden de José: "que no vuelva a ocurrir")
`/mnt/project/` es de SOLO LECTURA para Belar; no puede ni ha podido nunca escribir ahí.
La documentación viva de BTP vive en el repo: `docs/` de la rama `btp`. Belar la actualiza
por sí mismo (misma vía que el código) en el mismo acto que el cambio, sin pedir nada.
Nunca entregar un .md "para que José lo suba" como único resultado: primero al repo,
después opcionalmente copia en outputs. José refresca la copia del proyecto cuando quiera
(`raw.githubusercontent.com/Jose-Index/belar-tracker/btp/docs/<fichero>`).
Al inicio de sesión, si hay dudas de versión: la del repo manda sobre la del proyecto.

## Vía B · receta que FUNCIONA (22/08/2026, 3 ficheros subidos sin incidencias)
Usada porque `file_upload` está roto (versión de la extensión). Patrón:
1. Abrir `github.com/Jose-Index/belar-tracker/edit/btp/<ruta>`.
2. Clic DENTRO del texto del editor (no en márgenes) → `cmd+a` → `Delete`. Comprobar
   `[...document.querySelectorAll('.cm-gutterElement')].pop().innerText === '1'`.
   NO usar `selectNodeContents`/`execCommand('selectAll')`: solo seleccionan las líneas
   renderizadas y la pega deja cola vieja (pasó con lib/quotes.js, 168 líneas en vez de 132).
3. En `javascript_tool`: `fetch` del raw por rama (`raw.githubusercontent.com/.../btp/<ruta>`,
   `cache:'no-store'`) → SHA-256 contra el hash del original del contenedor (si no cuadra,
   raw desfasado: abortar) → aplicar pares de reemplazo [antes, después] exigiendo 1 única
   ocurrencia → SHA-256 contra el hash del fichero final del contenedor → `ClipboardEvent('paste')`
   sobre `.cm-content` enfocado. Así solo viajan los reemplazos, no el fichero entero.
4. Verificar: último `.cm-gutterElement` == nº de líneas esperado (`cmd+End` antes si hace falta).
5. "Commit changes..." por `ref` de `find` → campo de mensaje y botón verde del diálogo por `ref`
   (en esta sesión los clics por ref SÍ funcionaron en el diálogo). Confirmar URL `/blob/btp/`.
6. Hash del raw tras el commit == hash local (curl desde contenedor). Deploy en ~90 s.
`el.cmView.view` no está expuesto en el editor de GitHub: no intentar `dispatch` directo.

## Verificación obligatoria tras subir — NO SALTARSE
- `git fetch` + `git diff --stat FETCH_HEAD -- api/ src/` desde el contenedor.
  **Vacío** = lo subido es idéntico a lo probado. Esto detectó ese mismo día tres commits
  que no habían llegado y un fichero corrupto.
- Comprobar también el **número de líneas** del fichero en remoto cuando se haya editado
  por navegador: `git show FETCH_HEAD:<ruta> | wc -l`.
- Deploy: descargar el bundle de producción y buscar una cadena nueva del cambio.

## Email de los commits — verificado
GitHub → Settings → Emails: "Keep my email addresses private" = **Off**, primario
`permanecer_debuts_5l@icloud.com`. Los commits web salen con ese email y la regla de oro
nº1 se cumple sola. Si se activara la privacidad, pasarían a
`234446888+Jose-Index@users.noreply.github.com` y Vercel bloquearía el deploy en silencio.

## Cuándo sigue siendo mejor "en tu ordenador"
Refactores amplios, conflictos, ramas y merges. Para el trabajo normal, la vía A basta.

## Entorno real
- Producción de la rama `btp`: **btp-belar.vercel.app**.
- Repo: `Jose-Index/belar-tracker`, rama `btp`. Supabase: `aoexwfqlmfopemysyvtc`.

## Sesión del 08/08/2026 — todo subido y desplegado
Aportaciones editables · borrador de cierre con motivo y clase/fuente · resolución de
nombres de broker con aprendizaje de alias · fecha de apertura obligatoria en altas ·
broker corregible en la revisión · invertido/valor contrastados contra la BD.
Último commit: `a8b3fa3`. No queda nada pendiente de subir.

## Sesión del 22/08/2026
%/día (G/P% ÷ días abiertos) y vari/sem (precio vivo vs cierre semana anterior) en
Posiciones; `/api/quotes` con `week_close` y `prev_close` desde serie 1mo. Tres commits
en btp (primero `00a7c87`), verificados por hash y en btp-belar.vercel.app.
