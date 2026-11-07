// Catálogo de reparaciones. Se presentan por el SÍNTOMA que nota el usuario, no por el comando.
// Cada paso es:
//   { label, ps: "PowerShell" }                       → falla si el script lanza un error
//   { label, exe, args, okCodes, rebootCodes, warnOnFail, utf16 } → programa de Windows
//   always: true  → se ejecuta aunque un paso anterior haya fallado (p. ej. volver a arrancar servicios)
//   warnOnFail    → si falla, se avisa pero se sigue con el resto
// Dentro de los scripts se puede usar TB-Warn "mensaje" para avisar sin fallar.
const SYS = process.env.SystemDrive || "C:";

module.exports = [
  {
    id: "system-files",
    icon: "🩺",
    problem: "Windows va raro: errores, cuelgues o cosas que no abren",
    name: "Revisar y reparar Windows",
    summary: "Busca archivos de Windows dañados y los repara con las herramientas oficiales de Microsoft.",
    details: "Hace tres comprobaciones seguidas: el disco (sin modificarlo), la «imagen» de Windows (DISM, que descarga " +
      "piezas sanas de Windows Update si hace falta) y los archivos del sistema (SFC).",
    after: "No cambia tu configuración ni tus archivos. Si repara algo, puede pedirte que reinicies.",
    duration: "15–45 min",
    risk: "seguro",
    internet: true,
    steps: [
      { label: "Revisando el disco", exe: "chkdsk.exe", args: [SYS, "/scan"], okCodes: [0, 1, 2], warnOnFail: true,
        failText: "El disco tiene errores que no se pueden arreglar con Windows encendido. Ejecuta «chkdsk /f» al reiniciar o revisa la salud del disco." },
      { label: "Reparando la imagen de Windows (DISM)", exe: "DISM.exe", args: ["/Online", "/Cleanup-Image", "/RestoreHealth", "/English"],
        okCodes: [0], rebootCodes: [3010],
        failText: "DISM no pudo terminar. Comprueba tu conexión a Internet y vuelve a intentarlo." },
      { label: "Revisando los archivos del sistema (SFC)", exe: "sfc.exe", args: ["/scannow"], okCodes: [0], utf16: true, warnOnFail: true,
        failText: "SFC encontró archivos que no pudo reparar. Reinicia y repite la reparación; si sigue igual, puede hacer falta reinstalar Windows conservando tus archivos." },
    ],
  },
  {
    id: "windows-update",
    icon: "🔄",
    problem: "Windows Update no funciona o se queda atascado",
    name: "Reiniciar Windows Update",
    summary: "Vacía la caché de Windows Update y reinicia sus servicios para que vuelva a buscar actualizaciones desde cero.",
    details: "Cancela las descargas a medias, borra la caché de descargas y la cola de transferencias (BITS), y vuelve a arrancar " +
      "los servicios. No toca las actualizaciones ya instaladas ni su historial.",
    after: "Windows volverá a descargar lo que tuviera pendiente. Es recomendable reiniciar.",
    duration: "1–3 min",
    risk: "seguro",
    internet: true,
    rebootSuggested: true,
    steps: [
      { label: "Cancelando transferencias pendientes", ps: "Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | Remove-BitsTransfer -ErrorAction SilentlyContinue" },
      { label: "Parando los servicios de actualización",
        ps: "Stop-Service -Name wuauserv, bits, cryptsvc -Force -ErrorAction Stop; Stop-Service -Name usosvc -Force -ErrorAction SilentlyContinue" },
      { label: "Borrando la caché de descargas",
        ps: String.raw`$r = TB-Clear @('%SystemRoot%\SoftwareDistribution\Download'); Remove-Item -Path "$env:ProgramData\Microsoft\Network\Downloader\qmgr*.dat" -Force -ErrorAction SilentlyContinue; if ($r.skipped) { TB-Warn "$($r.skipped) elementos estaban en uso y se han dejado." }` },
      { label: "Arrancando los servicios", always: true,
        ps: "Start-Service -Name cryptsvc, bits, wuauserv -ErrorAction Stop; Start-Service -Name usosvc -ErrorAction SilentlyContinue" },
      { label: "Pidiendo a Windows que busque actualizaciones", warnOnFail: true,
        ps: String.raw`$u = Join-Path $env:SystemRoot 'System32\UsoClient.exe'; if (Test-Path $u) { Start-Process -FilePath $u -ArgumentList 'StartScan' -WindowStyle Hidden } else { TB-Warn 'Abre Configuración → Windows Update y pulsa «Buscar actualizaciones».' }` },
    ],
  },
  {
    id: "network-quick",
    icon: "🌐",
    problem: "Internet va mal o algunas webs no cargan",
    name: "Arreglo rápido de Internet",
    summary: "Borra la caché de direcciones (DNS) y pide una conexión nueva al router.",
    details: "Equivale a «ipconfig /flushdns», «/release» y «/renew». Internet se corta unos segundos mientras tanto.",
    after: "Nada más. Si no se arregla, prueba el «Reinicio completo de red».",
    duration: "< 1 min",
    risk: "seguro",
    steps: [
      { label: "Borrando la caché de DNS", ps: "Clear-DnsClientCache -ErrorAction SilentlyContinue; ipconfig.exe /flushdns | Out-Null" },
      { label: "Renovando la conexión con el router", warnOnFail: true,
        ps: "ipconfig.exe /release | Out-Null; Start-Sleep -Seconds 2; ipconfig.exe /renew | Out-Null; if ($LASTEXITCODE) { TB-Warn 'Algún adaptador no respondió (es normal si está desconectado).' }" },
    ],
  },
  {
    id: "network-full",
    icon: "🛠️",
    problem: "Sigo sin Internet, o la red falla desde que instalé una VPN o un antivirus",
    name: "Reinicio completo de red",
    summary: "Devuelve la configuración de red de Windows a como venía de fábrica.",
    details: "Reinicia Winsock y TCP/IP (netsh). Arregla problemas que dejan VPN, antivirus o programas que modifican la red.",
    after: "Hay que reiniciar el PC. Si tenías una IP fija o un proxy puestos a mano, tendrás que volver a configurarlos. " +
      "Las redes Wi-Fi guardadas y sus contraseñas no se borran.",
    duration: "< 1 min + reinicio",
    risk: "precaucion",
    rebootRequired: true,
    steps: [
      { label: "Reiniciando Winsock", exe: "netsh.exe", args: ["winsock", "reset"], okCodes: [0] },
      { label: "Reiniciando TCP/IP", exe: "netsh.exe", args: ["int", "ip", "reset"], okCodes: [0], warnOnFail: true,
        failText: "Algunas opciones no se pudieron restablecer (suele ser normal). Reinicia el PC igualmente." },
      { label: "Borrando la caché de DNS", ps: "Clear-DnsClientCache -ErrorAction SilentlyContinue" },
    ],
  },
  {
    id: "printer",
    icon: "🖨️",
    problem: "La impresora no imprime o hay documentos atascados",
    name: "Desatascar la cola de impresión",
    summary: "Cancela los trabajos atascados y reinicia el servicio de impresión.",
    details: "Para el servicio «Cola de impresión», borra los trabajos pendientes y lo vuelve a arrancar.",
    after: "Los documentos que estaban esperando se cancelan: tendrás que mandarlos a imprimir otra vez.",
    duration: "< 1 min",
    risk: "seguro",
    steps: [
      { label: "Parando la cola de impresión", ps: "Stop-Service -Name Spooler -Force -ErrorAction Stop" },
      { label: "Borrando los trabajos atascados",
        ps: String.raw`$r = TB-Clear @('%SystemRoot%\System32\spool\PRINTERS'); if ($r.skipped) { TB-Warn "$($r.skipped) trabajos no se pudieron borrar." }` },
      { label: "Arrancando la cola de impresión", always: true, ps: "Start-Service -Name Spooler -ErrorAction Stop" },
    ],
  },
  {
    id: "time-sync",
    icon: "🕒",
    problem: "La hora del PC está mal",
    name: "Sincronizar la hora",
    summary: "Arranca el servicio de hora de Windows y lo pone en hora con Internet.",
    details: "Si la hora es correcta pero la zona horaria no, cámbiala en Configuración → Hora e idioma.",
    after: "Nada más.",
    duration: "< 1 min",
    risk: "seguro",
    internet: true,
    steps: [
      { label: "Arrancando el servicio de hora", ps: "Set-Service -Name w32time -StartupType Manual -ErrorAction SilentlyContinue; Start-Service -Name w32time -ErrorAction Stop" },
      { label: "Sincronizando con Internet", warnOnFail: true,
        ps: "w32tm.exe /resync /force | Out-Null; if ($LASTEXITCODE) { w32tm.exe /config /update | Out-Null; Start-Sleep -Seconds 2; w32tm.exe /resync /force | Out-Null }; if ($LASTEXITCODE) { throw 'Windows no pudo contactar con el servidor de hora. Comprueba tu conexión.' }" },
    ],
  },
  {
    id: "winget-repair",
    icon: "📦",
    problem: "Los programas no se instalan desde ToolBox",
    name: "Reparar el instalador de apps (winget)",
    summary: "Vuelve a registrar el «Instalador de aplicación» de Windows y restablece sus orígenes de descarga.",
    details: "winget es la herramienta oficial de Microsoft que ToolBox usa para instalar programas. A veces su lista de " +
      "programas se corrompe o el componente se desregistra tras una actualización.",
    after: "Nada visible. Vuelve a probar la instalación.",
    duration: "1–2 min",
    risk: "seguro",
    internet: true,
    steps: [
      { label: "Volviendo a registrar el Instalador de aplicación", warnOnFail: true,
        ps: "Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop" },
      { label: "Restableciendo los orígenes de winget", exe: "winget", args: ["source", "reset", "--force", "--disable-interactivity"], okCodes: [0] },
      { label: "Descargando la lista de programas", exe: "winget", args: ["source", "update", "--disable-interactivity"], okCodes: [0] },
    ],
  },
];
