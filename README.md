# 🧰 ToolBox

App de escritorio para **poner tu Windows a punto**, pensada para que cualquiera la entienda:
antes de hacer nada te explica **qué hace**, **qué notarás después** y te pide confirmación.

## Qué hace

| Sección | Para qué sirve |
|---|---|
| 🏠 **Inicio** | Espacio libre en disco, datos de tu PC y botón para crear un punto de restauración. |
| 🧹 **Limpieza** | Analiza (sin borrar) y luego limpia: temporales, descargas de Windows Update, caché de Optimización de distribución, miniaturas, informes de errores, papelera y **actualizaciones antiguas de Windows** (DISM). |
| 📦 **Aplicaciones** | Instala varios programas de golpe con `winget` (el instalador oficial de Microsoft) y actualiza todos los que tengas. |
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
