// Desinstalación completa de programas (Windows).
// 1) Lista lo instalado leyendo las claves «Uninstall» del registro (lo mismo que Configuración → Apps).
// 2) Ejecuta el desinstalador OFICIAL del programa y espera a que termine de verdad.
// 3) Busca restos con reglas estrictas y SOLO propone; el usuario decide.
// 4) Las carpetas van a la Papelera y del registro se guarda copia (.reg) antes de borrar.
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { runPowerShell, runProcess, ps } = require("./powershell");

// ---------------------------------------------------------------- Lista
async function programsList() {
  const { json } = await runPowerShell(String.raw`
    $roots = @(
      @{ h = 'HKLM'; p = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' },
      @{ h = 'HKLM'; p = 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' },
      @{ h = 'HKCU'; p = 'Software\Microsoft\Windows\CurrentVersion\Uninstall' })
    $list = foreach ($r in $roots) {
      $base = (TB-Root $r.h).OpenSubKey($r.p); if (-not $base) { continue }
      foreach ($sub in $base.GetSubKeyNames()) {
        $k = $base.OpenSubKey($sub); if (-not $k) { continue }
        $name = $k.GetValue('DisplayName'); $un = $k.GetValue('UninstallString')
        $rt = "$($k.GetValue('ReleaseType'))"
        if ($name -and $un -and -not $k.GetValue('SystemComponent') -and -not $k.GetValue('ParentKeyName') -and $rt -notmatch 'Update|Hotfix') {
          [pscustomobject]@{
            key = "$($r.h)\$($r.p)\$sub"; name = "$name"; publisher = "$($k.GetValue('Publisher'))"
            version = "$($k.GetValue('DisplayVersion'))"; date = "$($k.GetValue('InstallDate'))"
            sizeKB = [int64]($k.GetValue('EstimatedSize') -as [int64]); location = "$($k.GetValue('InstallLocation'))"
            uninstall = "$un"; quiet = "$($k.GetValue('QuietUninstallString'))"
          }
        }
        $k.Close()
      }
    }
    Emit @{ programs = @($list) }`);
  const raw = [].concat((json[0] || {}).programs || []).filter(Boolean);
  const seen = new Set();
  return raw.filter((p) => {
    const k = `${p.name}|${p.version}`.toLowerCase();
    if (seen.has(k) || /^toolbox$/i.test(p.name)) return false; // ToolBox no se desinstala a sí mismo
    seen.add(k);
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ---------------------------------------------------------------- Desinstalar
/** Separa «programa + argumentos» de una línea de desinstalación del registro. */
function parseCommand(cmd) {
  cmd = String(cmd || "").trim();
  const msi = /msiexec(?:\.exe)?\s+.*?\/[IX]\s*(\{[0-9A-F-]{36}\})/i.exec(cmd);
  if (msi) return { exe: "msiexec.exe", args: `/x ${msi[1]}`, msi: true };
  if (cmd.startsWith('"')) {
    const end = cmd.indexOf('"', 1);
    return { exe: cmd.slice(1, end), args: cmd.slice(end + 1).trim() };
  }
  const m = /^(.*?\.exe)(\s+.*)?$/i.exec(cmd);
  if (m) return { exe: m[1], args: (m[2] || "").trim() };
  return { exe: cmd, args: "" };
}

const keyExists = async (key) => (await runProcess("reg.exe", ["query", key])).code === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ejecuta el desinstalador oficial y espera a que el programa desaparezca del registro.
 * Muchos desinstaladores (NSIS, Inno) se copian a Temp y el proceso original termina enseguida,
 * por eso no basta con esperar al proceso.
 * signal.aborted = true → deja de esperar.
 */
async function programUninstall(entry, log, { quiet = false, signal = {}, waitMs = 15 * 60 * 1000 } = {}) {
  let cmd = parseCommand(quiet && entry.quiet ? entry.quiet : entry.uninstall);
  if (quiet && cmd.msi) cmd = { ...cmd, args: cmd.args + " /qn /norestart" };
  log(`▶ Abriendo el desinstalador de ${entry.name}…`);
  log(`   ${cmd.exe} ${cmd.args}`);
  const exitCode = await new Promise((resolve) => {
    // Con windowsVerbatimArguments Node no entrecomilla NADA, tampoco el propio programa: sin argv0
    // entrecomillado, «C:\Program Files\X\uninstall.exe» llegaría partido por el espacio.
    const child = spawn(cmd.exe, cmd.args ? [cmd.args] : [], { windowsVerbatimArguments: true, windowsHide: false, argv0: `"${cmd.exe}"` });
    child.on("error", (e) => { log("   ✖ " + e.message); resolve(-1); });
    child.on("close", (code) => resolve(code === null ? -1 : code >>> 0));
  });
  log(`   El desinstalador terminó (código ${exitCode}). Comprobando…`);
  const MSI_CANCELLED = 1602;
  const start = Date.now();
  // Si salió con error, damos un margen corto; si salió bien, esperamos a que acabe su copia en Temp
  const limit = exitCode === 0 || exitCode === 3010 ? waitMs : 15000;
  while (await keyExists(entry.key)) {
    if (signal.aborted) { log("   Dejamos de esperar (a petición tuya)."); return { uninstalled: false, exitCode, aborted: true }; }
    if (exitCode === MSI_CANCELLED || Date.now() - start > limit) {
      log("   ✖ El programa sigue instalado (¿se canceló el desinstalador?).");
      return { uninstalled: false, exitCode };
    }
    await sleep(2000);
  }
  log(`✔ ${entry.name} desinstalado.`);
  return { uninstalled: true, exitCode, reboot: exitCode === 3010 };
}

// ---------------------------------------------------------------- Restos
/**
 * Busca restos con coincidencias EXACTAS del nombre normalizado (sin versión ni símbolos),
 * nunca carpetas genéricas («Microsoft», «Common Files»…) ni nada que use otro programa instalado.
 */
async function leftoversScan(entry, others) {
  const otherLocations = others.map((o) => o.location).filter((l) => l && l.length > 6);
  const { json } = await runPowerShell(String.raw`
    function N([string]$s) {
      $s = $s -replace '\(.*?\)', '' -replace '\b(x64|x86|arm64|64-bit|32-bit|64 bits|32 bits)\b', '' -replace '\bv?\d+(\.\d+)*\b', ''
      return ($s -replace '[^\p{L}\p{N}]', '').ToLowerInvariant()
    }
    $name = ${ps(entry.name)}; $publisher = ${ps(entry.publisher || "")}; $location = ${ps(entry.location || "")}
    # Nunca se propone borrar ENTERA una carpeta/clave con estos nombres (se comparten entre programas)
    $generic = @('microsoft','microsoftcorporation','windows','commonfiles','packages','temp','programs','installer','google','intel','nvidia','nvidiacorporation','amd','realtek','apple','adobe','oracle','mozilla','')
    # Y en estas claves del registro ni siquiera se entra
    $neverKeys = @('classes','policies','wow6432node','clients','registeredapplications','windows')
    $names = @(N $name)
    $pubWords = @($publisher -split '\s+' | Where-Object { $_ })
    if ($pubWords.Count) {
      $first = N $pubWords[0]
      $rest = ($name -split '\s+' | Where-Object { (N $_) -ne $first }) -join ' '
      if ($rest) { $names += N $rest }
    }
    $names = @($names | Where-Object { $_.Length -ge 3 -and $generic -notcontains $_ } | Select-Object -Unique)
    $pubs = @(@((N $publisher), $(if ($pubWords.Count) { N $pubWords[0] })) | Where-Object { $_ -and $_.Length -ge 3 } | Select-Object -Unique)
    $others = @(${otherLocations.map(ps).join(", ") || "''"} | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() })
    $roots = @($env:ProgramFiles, ${'$'}{env:ProgramFiles(x86)}, $env:ProgramData, $env:APPDATA, $env:LOCALAPPDATA, (Join-Path $env:LOCALAPPDATA 'Programs'), (Join-Path $env:USERPROFILE 'AppData\LocalLow')) |
      Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
    $protected = @($roots + @($env:SystemRoot, $env:USERPROFILE, $env:SystemDrive + '\') | ForEach-Object { $_.TrimEnd('\').ToLowerInvariant() })

    function Is-Safe([string]$p) {
      $l = $p.TrimEnd('\').ToLowerInvariant()
      if ($protected -contains $l -or $l.Length -lt 10) { return $false }
      if ($l.StartsWith($env:SystemRoot.ToLowerInvariant())) { return $false }
      foreach ($o in $others) { if ($o -eq $l -or $o.StartsWith($l + '\') -or $l.StartsWith($o + '\')) { return $false } }
      return $true
    }
    $found = @{}
    function Add-Folder([string]$p, [string]$reason, [string]$parent) {
      if (-not (Test-Path -LiteralPath $p -PathType Container) -or -not (Is-Safe $p) -or $found.ContainsKey($p.ToLowerInvariant())) { return }
      $found[$p.ToLowerInvariant()] = $true
      Emit @{ kind = 'folder'; path = $p; bytes = (TB-DirSize ([IO.DirectoryInfo]$p)); reason = $reason; parent = $parent }
    }

    if ($location) { Add-Folder $location.Trim('"') 'Carpeta de instalación' '' }
    foreach ($root in $roots) {
      foreach ($d in @(Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue)) {
        $dn = N $d.Name
        if ($names -contains $dn) { Add-Folder $d.FullName "Carpeta con el nombre del programa" '' }
        elseif ($pubs -contains $dn) {
          # Dentro de la carpeta del fabricante (p. ej. Google\Chrome) solo la subcarpeta exacta del programa
          foreach ($s in @(Get-ChildItem -LiteralPath $d.FullName -Directory -Force -ErrorAction SilentlyContinue)) {
            if ($names -contains (N $s.Name)) { Add-Folder $s.FullName "Carpeta del programa dentro de la de su fabricante" $d.FullName }
          }
        }
      }
    }

    $keyRoots = @('HKCU\Software', 'HKLM\SOFTWARE', 'HKLM\SOFTWARE\WOW6432Node')
    $seenKeys = @{}
    function Add-Key([string]$k, [string]$reason, [string]$parent) {
      if ($seenKeys.ContainsKey($k.ToLowerInvariant())) { return }
      $seenKeys[$k.ToLowerInvariant()] = $true
      Emit @{ kind = 'key'; path = $k; reason = $reason; parent = $parent }
    }
    foreach ($kr in $keyRoots) {
      $hive, $sub = $kr -split '\\', 2
      $base = (TB-Root $hive).OpenSubKey($sub); if (-not $base) { continue }
      foreach ($kn in $base.GetSubKeyNames()) {
        $n = N $kn
        if ($neverKeys -contains $n) { continue }
        if ($names -contains $n -and $generic -notcontains $n) { Add-Key "$kr\$kn" 'Configuración del programa en el registro' '' }
        elseif ($pubs -contains $n) {
          $pk = $base.OpenSubKey($kn)
          if ($pk) { foreach ($s in $pk.GetSubKeyNames()) { if ($names -contains (N $s)) { Add-Key "$kr\$kn\$s" 'Configuración del programa (dentro de su fabricante)' "$kr\$kn" } }; $pk.Close() }
        }
      }
      $base.Close()
    }
    $uk = ${ps(entry.key)}
    $h, $s = $uk -split '\\', 2
    $k = (TB-Root $h).OpenSubKey($s)
    if ($k) { $k.Close(); Add-Key $uk 'Entrada huérfana en «Programas instalados»' '' }`);
  return json.filter((j) => j.kind);
}

/** Borra los restos elegidos: carpetas a la Papelera, registro con copia .reg previa. */
async function leftoversClean(items, backupDir, log) {
  fs.mkdirSync(backupDir, { recursive: true });
  const results = [];
  const folders = items.filter((i) => i.kind === "folder");
  if (folders.length) {
    const { json } = await runPowerShell(String.raw`
      Add-Type -AssemblyName Microsoft.VisualBasic
      foreach ($it in @(${folders.map((f) => `@{ p = ${ps(f.path)}; parent = ${ps(f.parent || "")} }`).join(", ")})) {
        try {
          [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($it.p, 'OnlyErrorDialogs', 'SendToRecycleBin')
          if ($it.parent -and (Test-Path -LiteralPath $it.parent) -and -not @(Get-ChildItem -LiteralPath $it.parent -Force -ErrorAction SilentlyContinue).Count) {
            Remove-Item -LiteralPath $it.parent -Force -ErrorAction SilentlyContinue
          }
          Emit @{ path = $it.p; ok = $true }
        } catch { Emit @{ path = $it.p; ok = $false; message = $_.Exception.Message } }
      }`);
    for (const f of folders) {
      const r = json.find((j) => j.path === f.path) || { ok: false, message: "Sin respuesta" };
      log(r.ok ? `✔ Carpeta enviada a la Papelera: ${f.path}` : `✖ No se pudo borrar ${f.path}: ${r.message}`);
      results.push({ ...f, ok: !!r.ok, message: r.message });
    }
  }
  let n = 0;
  for (const k of items.filter((i) => i.kind === "key")) {
    const file = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${++n}.reg`);
    const exp = await runProcess("reg.exe", ["export", k.path, file, "/y"]);
    if (exp.code !== 0) {
      log(`✖ No se pudo hacer copia de ${k.path}; no se borra.`);
      results.push({ ...k, ok: false, message: "No se pudo hacer copia de seguridad" });
      continue;
    }
    const del = await runProcess("reg.exe", ["delete", k.path, "/f"]);
    if (del.code === 0 && k.parent) {
      // Si la clave del fabricante se queda VACÍA (sin valores ni subclaves), también sobra.
      // DeleteSubKey no es recursivo: Windows lo rechaza si queda algo dentro, así que nunca
      // puede llevarse por delante la configuración de otro programa del mismo fabricante.
      const [h, s] = [k.parent.slice(0, k.parent.indexOf("\\")), k.parent.slice(k.parent.indexOf("\\") + 1)];
      await runPowerShell(String.raw`
        $root = TB-Root ${ps(h)}; $sub = ${ps(s)}
        $pk = $root.OpenSubKey($sub)
        if ($pk) {
          $empty = ($pk.SubKeyCount -eq 0 -and $pk.ValueCount -eq 0); $pk.Close()
          if ($empty) { try { $root.DeleteSubKey($sub, $false) } catch { } }
        }`);
    }
    log(del.code === 0 ? `✔ Clave borrada (copia en ${path.basename(file)}): ${k.path}` : `✖ No se pudo borrar ${k.path}`);
    results.push({ ...k, ok: del.code === 0, backup: file });
  }
  return results;
}

module.exports = { programsList, parseCommand, programUninstall, leftoversScan, leftoversClean };
