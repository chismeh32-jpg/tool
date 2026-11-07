// Ejecuta scripts de PowerShell (Windows PowerShell 5.1, incluido en todos los Windows 10/11).
// Los scripts se escriben a un .ps1 temporal (con BOM para que respete las tildes) y se
// lanzan con -File. Cualquier línea que empiece por @@JSON@@ es un resultado estructurado;
// el resto se trata como texto de registro.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const JSON_MARK = "@@JSON@@";

const PRELUDE = String.raw`
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8

function Emit($o) { [Console]::Out.WriteLine('@@JSON@@' + ($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }

# --- Archivos -------------------------------------------------------------
function TB-Expand([string]$p) {
  $e = [Environment]::ExpandEnvironmentVariables($p)
  # Nunca tocar rutas sin expandir, relativas o demasiado cortas (p. ej. "C:\")
  if ($e -match '%' -or -not [IO.Path]::IsPathRooted($e) -or $e.Length -lt 8) { return $null }
  return $e
}
function TB-DirSize([IO.DirectoryInfo]$Root) {
  # Recorrido con .NET (mucho más rápido que Get-ChildItem). No entra en enlaces (junctions)
  # y se salta las carpetas sin permiso en vez de fallar.
  $t = [int64]0
  $stack = New-Object System.Collections.Generic.Stack[IO.DirectoryInfo]
  $stack.Push($Root)
  while ($stack.Count -gt 0) {
    $d = $stack.Pop()
    try { $entries = $d.GetFileSystemInfos() } catch { continue }
    foreach ($e in $entries) {
      if ($e -is [IO.DirectoryInfo]) {
        if (-not ($e.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $stack.Push($e) }
      } else { $t += $e.Length }
    }
  }
  return $t
}
function TB-Size([string[]]$Paths) {
  $t = [int64]0
  foreach ($p in $Paths) {
    $e = TB-Expand $p; if (-not $e) { continue }
    if ($e.Contains('*')) {
      # Patrón de archivos (p. ej. thumbcache_*.db)
      $dir = [IO.Path]::GetDirectoryName($e)
      if ([IO.Directory]::Exists($dir)) {
        foreach ($f in ([IO.DirectoryInfo]$dir).GetFiles([IO.Path]::GetFileName($e))) { $t += $f.Length }
      }
    } elseif ([IO.Directory]::Exists($e)) {
      $t += TB-DirSize ([IO.DirectoryInfo]$e)
    }
  }
  return $t
}
function TB-Clear([string[]]$Paths) {
  $ok = 0; $skip = 0
  foreach ($p in $Paths) {
    $e = TB-Expand $p
    if (-not $e -or -not (Test-Path -Path $e)) { continue }
    Get-ChildItem -Path $e -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        if ($_.PSIsContainer) {
          # Un enlace (junction) se borra como enlace: nunca se entra en su destino
          if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { [IO.Directory]::Delete($_.FullName, $false) }
          else { [IO.Directory]::Delete($_.FullName, $true) }
        } else {
          $_.Attributes = 'Normal'
          [IO.File]::Delete($_.FullName)
        }
        $ok++
      } catch { $skip++ }
    }
  }
  return @{ removed = $ok; skipped = $skip }
}
function TB-Free { return [int64](Get-PSDrive -Name $env:SystemDrive.TrimEnd(':')).Free }

# --- Registro -------------------------------------------------------------
function TB-Root([string]$h) {
  switch ($h) { 'HKCU' { return [Microsoft.Win32.Registry]::CurrentUser } 'HKLM' { return [Microsoft.Win32.Registry]::LocalMachine } }
  throw "Rama de registro no admitida: $h"
}
function TB-Get([string]$h, [string]$sub, [string]$name) {
  $k = (TB-Root $h).OpenSubKey($sub)
  if (-not $k) { return @{ exists = $false } }
  $v = $k.GetValue($name, $null, 'DoNotExpandEnvironmentNames'); $k.Close()
  if ($null -eq $v) { return @{ exists = $false } }
  return @{ exists = $true; value = "$v" }
}
function TB-Set([string]$h, [string]$sub, [string]$name, [string]$kind, $value) {
  $k = (TB-Root $h).CreateSubKey($sub)
  if ($kind -eq 'DWord') { $k.SetValue($name, [int]$value, [Microsoft.Win32.RegistryValueKind]::DWord) }
  else { $k.SetValue($name, [string]$value, [Microsoft.Win32.RegistryValueKind]::String) }
  $k.Close()
}
function TB-DelValue([string]$h, [string]$sub, [string]$name) {
  $k = (TB-Root $h).OpenSubKey($sub, $true)
  if ($k) { $k.DeleteValue($name, $false); $k.Close() }
}
function TB-DelKey([string]$h, [string]$sub) { (TB-Root $h).DeleteSubKeyTree($sub, $false) }
`;

/** Convierte un valor JS en un literal de PowerShell entre comillas simples. */
function ps(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Ejecuta un script.
 * @param {string} script
 * @param {{onLine?: (line:string)=>void, onJson?: (obj:any)=>void}} [opts]
 * @returns {Promise<{code:number, json:any[], output:string[]}>}
 */
function runPowerShell(script, opts = {}) {
  const file = path.join(os.tmpdir(), `toolbox-${crypto.randomUUID()}.ps1`);
  fs.writeFileSync(file, "\uFEFF" + PRELUDE + "\n" + script, "utf8");

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file],
      { windowsHide: true });

    const json = [];
    const output = [];
    let buffer = "";

    const handleLine = (raw) => {
      const line = raw.replace(/\s+$/, "");
      if (!line) return;
      if (line.startsWith(JSON_MARK)) {
        try {
          const obj = JSON.parse(line.slice(JSON_MARK.length));
          json.push(obj);
          opts.onJson && opts.onJson(obj);
        } catch { /* línea corrupta: se ignora */ }
        return;
      }
      output.push(line);
      opts.onLine && opts.onLine(line);
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n|\r/);
      buffer = parts.pop();
      parts.forEach(handleLine);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => chunk.split(/\r?\n/).forEach((l) => l.trim() && opts.onLine && opts.onLine("⚠ " + l.trim())));

    let timedOut = false;
    const timer = opts.timeoutMs ? setTimeout(() => {
      timedOut = true;
      // taskkill /T cierra también los procesos hijos (p. ej. dism.exe)
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill());
    }, opts.timeoutMs) : null;

    child.on("error", (err) => { clearTimeout(timer); cleanup(); reject(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buffer) handleLine(buffer);
      cleanup();
      resolve({ code, json, output, timedOut });
    });
  });

  function cleanup() { fs.rm(file, { force: true }, () => {}); }
}

/** Ejecuta un programa (p. ej. winget) con argumentos fijos y va pasando su salida línea a línea. */
function runProcess(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let buffer = "";
    const output = [];
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const parts = buffer.split(/\r?\n|\r/);
      buffer = parts.pop();
      for (const raw of parts) {
        const line = raw.trim();
        // winget dibuja barras de progreso y "spinners": solo nos quedamos con texto útil
        if (!line || !/[\p{L}\d]{2,}/u.test(line) || /^[\s█▒░\-\\|/]+$/.test(line)) continue;
        output.push(line);
        opts.onLine && opts.onLine(line);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => {
      if (buffer.trim()) output.push(buffer.trim());
      resolve({ code: code === null ? -1 : code >>> 0, output });
    });
  });
}

module.exports = { runPowerShell, runProcess, ps };
