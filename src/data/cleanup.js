// Catálogo de limpiezas.
// Cada entrada explica en lenguaje sencillo qué borra y qué consecuencias tiene.
//   paths:      carpetas (se vacía su contenido) o patrones de archivos. Admiten %VARIABLES%.
//   scanScript: PowerShell que devuelve el tamaño en bytes (si no basta con "paths").
//   cleanScript:PowerShell que hace la limpieza (si no basta con borrar "paths").
//   before/after: PowerShell que se ejecuta antes/después de borrar (p. ej. parar un servicio).
//   risk:       "seguro" | "precaucion"
//   recommended:si viene marcada por defecto.
module.exports = [
  {
    id: "temp-user",
    name: "Archivos temporales de tu usuario",
    icon: "🗂️",
    summary: "Restos que dejan los programas mientras trabajan: instaladores descomprimidos, cachés, etc.",
    details: "Los programas guardan aquí archivos de usar y tirar, pero muchas veces se olvidan de borrarlos. " +
      "Los que estén en uso ahora mismo se saltan automáticamente.",
    after: "Nada visible. Si algún programa necesita algo, lo vuelve a crear.",
    risk: "seguro",
    recommended: true,
    admin: false,
    paths: ["%TEMP%"],
  },
  {
    id: "temp-windows",
    name: "Archivos temporales de Windows",
    icon: "🪟",
    summary: "Lo mismo que lo anterior, pero de los procesos del propio sistema.",
    details: "Carpeta C:\\Windows\\Temp. Windows y los instaladores la usan como zona de trabajo.",
    after: "Nada visible.",
    risk: "seguro",
    recommended: true,
    admin: true,
    paths: ["%SystemRoot%\\Temp"],
  },
  {
    id: "wu-cache",
    name: "Descargas de Windows Update",
    icon: "⬇️",
    summary: "Archivos de actualizaciones que Windows ya descargó (e instaló).",
    details: "Carpeta SoftwareDistribution\\Download. Para vaciarla, ToolBox para un momento el servicio de " +
      "Windows Update y lo vuelve a encender al terminar. También soluciona actualizaciones atascadas.",
    after: "Si alguna actualización estaba a medias, Windows la volverá a descargar.",
    risk: "seguro",
    recommended: true,
    admin: true,
    paths: ["%SystemRoot%\\SoftwareDistribution\\Download"],
    before: "Stop-Service -Name wuauserv, bits -Force -ErrorAction SilentlyContinue",
    afterScript: "Start-Service -Name wuauserv, bits -ErrorAction SilentlyContinue",
  },
  {
    id: "delivery-opt",
    name: "Caché de Optimización de distribución",
    icon: "📡",
    summary: "Copias de actualizaciones que Windows guarda para compartirlas con otros PCs.",
    details: "Windows puede pasar actualizaciones a otros ordenadores de tu red. Esta caché suele ocupar varios GB.",
    after: "Nada visible.",
    risk: "seguro",
    recommended: true,
    admin: true,
    paths: ["%SystemRoot%\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache"],
    cleanScript: "Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue",
  },
  {
    id: "thumbnails",
    name: "Caché de miniaturas",
    icon: "🖼️",
    summary: "Las vistas previas de fotos y vídeos que ves en el Explorador.",
    details: "Si las miniaturas se ven mal o salen imágenes antiguas, borrar esta caché lo arregla.",
    after: "La primera vez que abras una carpeta con fotos, las miniaturas tardarán un poco en aparecer.",
    risk: "seguro",
    recommended: false,
    admin: false,
    paths: ["%LOCALAPPDATA%\\Microsoft\\Windows\\Explorer\\thumbcache_*.db"],
  },
  {
    id: "error-reports",
    name: "Informes de errores",
    icon: "🧯",
    summary: "Informes y volcados que se guardan cuando un programa o Windows se cuelga.",
    details: "Solo sirven para enviarlos a Microsoft o a un técnico. Los volcados de memoria pueden ocupar mucho.",
    after: "Se pierde el historial de cuelgues antiguos (rara vez se necesita).",
    risk: "seguro",
    recommended: true,
    admin: true,
    paths: [
      "%ProgramData%\\Microsoft\\Windows\\WER\\ReportArchive",
      "%ProgramData%\\Microsoft\\Windows\\WER\\ReportQueue",
      "%LOCALAPPDATA%\\CrashDumps",
      "%SystemRoot%\\Minidump",
    ],
  },
  {
    id: "recycle-bin",
    name: "Papelera de reciclaje",
    icon: "🗑️",
    summary: "Vacía la papelera de todas tus unidades.",
    details: "Todo lo que hay en la papelera se elimina para siempre.",
    after: "No podrás recuperar los archivos que había en la papelera.",
    risk: "precaucion",
    recommended: false,
    admin: false,
    scanScript: "$s = [int64]0; (New-Object -ComObject Shell.Application).NameSpace(10).Items() | ForEach-Object { $s += [int64]$_.Size }; $s",
    cleanScript: "Clear-RecycleBin -Force -ErrorAction SilentlyContinue",
  },
  {
    id: "old-updates",
    name: "Actualizaciones antiguas de Windows",
    icon: "🧱",
    summary: "Versiones viejas de componentes que Windows guarda tras actualizarse (carpeta WinSxS).",
    details: "Usa la herramienta oficial de Microsoft (DISM) para eliminar las versiones que ya han sido " +
      "sustituidas por otras más nuevas. Es lo más eficaz para recuperar espacio, pero tarda: de 5 a 20 minutos.",
    after: "Ya no podrás desinstalar las actualizaciones que tienes instaladas ahora mismo. Tu Windows sigue igual de actualizado.",
    risk: "precaucion",
    recommended: false,
    admin: true,
    slow: true,
    scanScript: null, // medir WinSxS de verdad tarda minutos; se mide el espacio liberado al terminar
    exe: "Dism.exe", // se ejecuta directamente para poder enseñar el porcentaje
    args: ["/Online", "/Cleanup-Image", "/StartComponentCleanup", "/English"],
    okCodes: [0, 3010],
  },
];
