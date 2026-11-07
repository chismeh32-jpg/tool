# 🧰 ToolBox

App de escritorio para **poner tu Windows a punto**, pensada para que cualquiera la entienda:
antes de hacer nada te explica **qué hace**, **qué notarás después** y te pide confirmación.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| 🏠 **Inicio** | Espacio libre en disco, datos de tu PC y botón para crear un punto de restauración. |
| 🧹 **Limpieza** | Analiza (sin borrar) y luego limpia: temporales, descargas de Windows Update, caché de Optimización de distribución, miniaturas, informes de errores, papelera y **actualizaciones antiguas de Windows** (DISM). |
| 📦 **Aplicaciones** | Instala varios programas de golpe con `winget` (el instalador oficial de Microsoft) y actualiza todos los que tengas. |
| 🩺 **Reparar** | Arreglos oficiales de Windows explicados por síntoma, con progreso en directo. |
| 🎛️ **Ajustes** | Interruptores para quitar anuncios, mostrar extensiones, menú clásico, modo oscuro, ratón sin aceleración… **Todos se pueden deshacer.** |

Cada limpieza viene marcada como **Seguro** o **Precaución**, y antes de los cambios importantes se ofrece un
**punto de restauración** de Windows.

## Descargar

1. Ve a la pestaña **Actions** del repositorio → la última ejecución en verde.
2. Descarga el archivo **ToolBox-Windows** (abajo, en *Artifacts*).
3. Dentro tienes:
   - `ToolBox-Setup-x.y.z.exe` → instalador normal.
   - `ToolBox-Portable-x.y.z.exe` → se ejecuta sin instalar.

> Windows SmartScreen avisará de que la app «no es conocida» porque no está firmada digitalmente.
> Pulsa **Más información → Ejecutar de todas formas**. ToolBox pide permisos de administrador porque
> los necesita para limpiar carpetas del sistema y cambiar ajustes.

## Novedades

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
