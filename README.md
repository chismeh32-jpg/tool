# 🧰 ToolBox

App de escritorio para **poner tu Windows a punto**, pensada para que cualquiera la entienda:
antes de hacer nada te explica **qué hace**, **qué notarás después** y te pide confirmación.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| 🏠 **Inicio** | Espacio en disco, datos de tu PC, **perfiles de un clic** (Recomendado, Gamer, Privacidad) y punto de restauración. |
| 🧹 **Limpieza** | Analiza (sin borrar) y luego limpia: temporales, descargas de Windows Update, caché de Optimización de distribución, miniaturas, informes de errores, papelera y **actualizaciones antiguas de Windows** (DISM). |
| 📦 **Instalar apps** | Instala varios programas de golpe con `winget` (el instalador oficial de Microsoft) y actualiza todos los que tengas. |
| 🩺 **Reparar** | Arreglos oficiales de Windows explicados por síntoma, con progreso en directo. |
| 🧽 **Desinstalar** | Desinstala programas sin dejar restos y quita las apps preinstaladas de Windows (con opción de reinstalarlas). |
| 🖥️ **Gráficos** | Ajustes de NVIDIA (NVAPI) y AMD (ADLX) con perfiles y vuelta atrás, ajustes gráficos de Windows y guías para quitar notificaciones. |
| 🎛️ **Ajustes** | Interruptores para quitar anuncios, mostrar extensiones, menú clásico, modo oscuro, ratón sin aceleración… **Todos se pueden deshacer.** |

Cada limpieza viene marcada como **Seguro** o **Precaución**, y antes de los cambios importantes se ofrece un
**punto de restauración** de Windows.

## Descargar

👉 **[Última versión de ToolBox](https://github.com/chismeh32-jpg/tool/releases/latest)** (no hace falta cuenta de GitHub)

- `ToolBox-Setup-x.y.z.exe` → instalador (recomendado). Se instala en «Archivos de programa».
- `ToolBox-Portable-x.y.z.exe` → se ejecuta sin instalar.
- `SHA256SUMS.txt` → sumas de verificación para comprobar que la descarga no se ha alterado.

> Windows SmartScreen avisará de que la app «no es conocida» porque todavía no está firmada digitalmente.
> Pulsa **Más información → Ejecutar de todas formas**. ToolBox pide permisos de administrador al abrirse porque
> los necesita para limpiar carpetas del sistema y cambiar ajustes.

ToolBox te avisa en la pantalla de Inicio cuando sale una versión nueva. Para saberlo hace una única consulta a la
página pública de versiones de GitHub al abrirse; no envía ningún dato tuyo.

### Publicar una versión (para quien mantiene el proyecto)
1. Sube `version` en `package.json` y añade sus novedades al principio de «Novedades» (empezando por `**x.y.z – …**`).
2. Sube los cambios a `main` y crea la etiqueta: `git tag vx.y.z && git push origin vx.y.z`.
3. GitHub Actions ejecuta **todas** las pruebas en Windows y, si pasan, publica la versión con sus notas.

## Novedades

**0.7.0 – Descargas públicas**
- ToolBox se publica en **[GitHub Releases](https://github.com/chismeh32-jpg/tool/releases/latest)**: se descarga sin
  cuenta de GitHub y las versiones no caducan.
- **Aviso de versión nueva** en la pantalla de Inicio, con botón para descargarla. La versión instalada aparece en la
  barra lateral.
- Cada versión solo se publica si pasan todas las pruebas en Windows real, e incluye sus notas y las sumas de
  verificación SHA-256.

**0.6.1 – Seguridad y fiabilidad** (revisión de todo el código)
- 🔴 **Arreglado un fallo grave: en Windows la ventana de ToolBox no llegaba a cargar** (versiones 0.1 a 0.6).
  El ejecutable pedía administrador en su manifiesto y Windows impedía a Chromium crear sus procesos internos
  de interfaz y GPU (error 18 de su «sandbox»). Ahora ToolBox se relanza como administrador al abrirse (con el
  aviso de siempre) y una prueba en GitHub abre el programa empaquetado en Windows y comprueba que la interfaz carga.
- **Protecciones de Electron («fuses») activadas**: ToolBox se ejecuta como administrador, así que ya no acepta
  variables como `ELECTRON_RUN_AS_NODE` o `NODE_OPTIONS`, ni el depurador, y verifica que su código no ha sido
  modificado antes de arrancar.
- **Se instala en «Archivos de programa»** (para todos los usuarios) en vez de en la carpeta del usuario, donde
  cualquier programa sin permisos de administrador podía sustituir los archivos de ToolBox.
- Los scripts que ToolBox ejecuta como administrador se escriben en una carpeta que otros programas de tu cuenta
  no pueden modificar.
- **Arreglado**: el desinstalador partía la ruta de los desinstaladores que están en carpetas con espacios
  (casi todos los de «Archivos de programa»). Nueva prueba en Windows real que lo comprueba.
- Aviso si ToolBox se abre con otra cuenta de administrador distinta de la del escritorio.
- Los registros de más de 30 días se borran solos. Licencia MIT en `LICENSE`.

> Si tenías instalada una versión anterior, desinstálala antes de instalar esta: antes se instalaba solo para tu
> usuario y ahora se instala para todo el equipo.

**0.6.0 – Gráficos**
- Nueva sección **🖥️ Gráficos** que detecta tu procesador y tus tarjetas gráficas.
- **NVIDIA**: lee y cambia los ajustes globales del Panel de control (modo de energía, baja latencia, calidad del
  filtrado) con NVAPI, la API oficial del driver. Perfiles «Mínima latencia» y «Equilibrado», «Volver a como lo tenía»
  y «Valores de fábrica de NVIDIA».
- **AMD**: Anti-Lag, Image Sharpening, Chill, Boost y Enhanced Sync de Adrenalin con ADLX, el SDK oficial de AMD.
- **Windows**: programación de GPU por hardware, optimizaciones para juegos en ventana y modo de juego.
- Guías para quitar notificaciones, anuncios y superposiciones de NVIDIA App y AMD Software, y opción de desactivar
  las tareas de telemetría de NVIDIA.
- Los ayudantes nativos (`native/`) se compilan en GitHub Actions con los SDK oficiales y van dentro del instalador.

**0.5.0 – Perfiles y desinstalación completa**
- **Perfiles de un clic** en Inicio: ⭐ Recomendado, 🎮 Gamer y 🔒 Privacidad. Antes de aplicar enseñan solo lo que
  cambiaría en tu PC (lo ya hecho aparece tachado) y puedes desmarcar lo que no quieras.
- **Desinstalar sin dejar restos**: ToolBox abre el desinstalador oficial, espera a que termine de verdad y luego busca
  carpetas y claves del registro que el programa haya dejado. Solo propone coincidencias exactas, nunca carpetas
  compartidas ni de otros programas; las carpetas van a la Papelera y del registro se guarda copia (.reg).
- La sección «Quitar apps» pasa a ser **Desinstalar**, con dos pestañas: *Programas instalados* y *Apps de Windows*.
- Al desinstalar ToolBox se borran también sus datos (registros y copias), sin dejar restos.

**0.4.0 – Quitar apps**
- Nueva sección **🧽 Quitar apps** con 34 apps preinstaladas de Windows, en tres grupos: publicidad y extras de
  Microsoft (marcadas por defecto), Xbox y juegos (con aviso) y herramientas que quizá uses.
- Se quitan para todos los usuarios y también de la plantilla de usuarios nuevos, para que no vuelvan.
- Cualquier app quitada se puede **reinstalar** desde Microsoft Store con un botón.
- Avisos claros en las delicadas (p. ej. «Inicio de sesión de Xbox» lo usan juegos de Steam).
- La sección de instalar programas pasa a llamarse «Instalar apps».

**0.3.0 – Reparar**
- Nueva sección **🩺 Reparar**, organizada por lo que te pasa: Windows va raro (DISM + SFC + revisión del disco),
  Windows Update atascado, Internet va mal (arreglo rápido y reinicio completo de red), la impresora no imprime,
  la hora está mal y los programas no se instalan (reparar winget).
- Cada reparación enseña los pasos antes de empezar, una barra de progreso con el porcentaje real y un resumen al
  terminar, con botón «Reiniciar ahora» cuando hace falta.
- La limpieza de «Actualizaciones antiguas de Windows» también muestra su porcentaje en directo.

**0.2.0 – Fiabilidad**
- Los resultados de winget se interpretan bien: «instalada, reinicia para terminar», «ya estaba instalada»,
  «instalada solo para tu usuario» y errores con su motivo, en vez de marcarlo todo como error.
- Se instala siempre desde el origen `winget` (evita que salte la Microsoft Store) y «Actualizar todas mis apps»
  incluye también las apps cuya versión winget no reconoce.
- La etiqueta «Instalada» es fiable: se usa `winget export` (identificadores exactos) en vez de buscar texto.
- Catálogo revisado: fuera Spotify (no se deja instalar como administrador), Python 3.14, Java 21 (Temurin),
  GIMP y File Converter. Cada identificador se comprueba en un Windows real en cada cambio.
- Si «Restaurar sistema» está apagado, ToolBox pregunta antes de activarlo (reserva espacio en disco).
- El registro de actividad se guarda también en un archivo (`%APPDATA%\ToolBox\logs`) → botón «Abrir registros».
- El análisis de limpieza es mucho más rápido: mide cada cosa en paralelo y con un tiempo máximo.

## Cómo está hecha

- **Electron**: la interfaz es HTML/CSS/JavaScript (`src/ui/`).
- **PowerShell** por debajo para hablar con Windows (`src/backend/`).
- Los catálogos son listas fáciles de editar:
  - `src/data/cleanup.js` – limpiezas
  - `src/data/tweaks.js` – ajustes (con su valor original para deshacer)
  - `src/data/apps.js` – programas (identificadores de winget)
- La interfaz **nunca** puede ejecutar comandos libres: solo pide acciones por su identificador y el
  proceso principal comprueba que existan en los catálogos.

## Desarrollo

```bash
npm install
npm start          # en Windows: modo real. En Mac/Linux: modo demostración (no toca nada)
```

En Windows puedes probar la interfaz sin tocar el sistema con `set TOOLBOX_MOCK=1 && npm start`.

```bash
npm run test:windows   # pruebas reales de los scripts (solo Windows, como administrador)
npm run dist           # crea el instalador en dist/
```

GitHub Actions ejecuta las pruebas en un Windows real y crea los instaladores en cada push.

Inspirada en la idea de [WinUtil](https://github.com/ChrisTitusTech/winutil) (MIT); código, diseño y catálogos propios.
