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
function TB-Warn([string]$Message) { Emit @{ warn = $Message } }
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
/** Si una línea indica progreso («[===  45.0% ]», «Verificación 45 % completada»), devuelve el porcentaje. */
function parsePercent(line) {
  const m = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(line);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * Ejecuta un programa (winget, DISM, sfc…) con argumentos fijos y va pasando su salida línea a línea.
 * - opts.utf16: el programa escribe en UTF-16 (p. ej. sfc.exe) en vez de UTF-8.
 * - opts.onProgress(pct): se llama con los porcentajes; esas líneas no se mandan a onLine.
 * - opts.timeoutMs: tiempo máximo; después se cierra el proceso (y sus hijos).
 */
function runProcess(command, args, opts = {}) {
  const { StringDecoder } = require("string_decoder");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    const output = [];
    const handle = (raw) => {
      const line = raw.replace(/\u0000/g, "").trim();
      // winget dibuja barras de progreso y "spinners": solo nos quedamos con texto útil
      if (!line || !/[\p{L}\d]{2,}/u.test(line) || /^[\s█▒░\-\\|/]+$/.test(line)) return;
      const pct = opts.onProgress ? parsePercent(line) : null;
      if (pct !== null) { opts.onProgress(pct); return; }
      output.push(line);
      opts.onLine && opts.onLine(line);
    };
    // Un lector por flujo: así una letra con tilde partida entre dos trozos no se estropea
    const reader = () => {
      const dec = new StringDecoder(opts.utf16 ? "utf16le" : "utf8");
      let buffer = "";
      return {
        push(chunk) {
          buffer += dec.write(chunk);
          const parts = buffer.split(/\r?\n|\r/);
          buffer = parts.pop();
          parts.forEach(handle);
        },
        end() { buffer += dec.end(); if (buffer) handle(buffer); buffer = ""; },
      };
    };
    const out = reader(), err = reader();
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => err.push(c));

    let timedOut = false;
    const timer = opts.timeoutMs ? setTimeout(() => {
      timedOut = true;
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => child.kill());
    }, opts.timeoutMs) : null;

    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      out.end(); err.end();
      resolve({ code: code === null ? -1 : code >>> 0, output, timedOut });
    });
  });
}

module.exports = { runPowerShell, runProcess, parsePercent, ps };
