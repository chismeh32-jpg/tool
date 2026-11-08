// Implementación real para Windows.
const { runPowerShell, runProcess, ps } = require("./powershell");
const CLEANUP = require("../data/cleanup");
const TWEAKS = require("../data/tweaks");
const APPS = require("../data/apps");
const REPAIRS = require("../data/repairs");
const BLOAT = require("../data/bloatware").APPS;


function splitHive(fullPath) {
  const i = fullPath.indexOf("\\");
  return { hive: fullPath.slice(0, i), sub: fullPath.slice(i + 1) };
}

// ---------------------------------------------------------------- Sistema
async function systemInfo() {
  const { json } = await runPowerShell(String.raw`
    $os = Get-CimInstance Win32_OperatingSystem
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
    $cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $admin = ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    Emit @{
      os = $os.Caption; version = $os.Version; build = $os.BuildNumber
      ram = [int64]$os.TotalVisibleMemorySize * 1024
      cpu = $cpu.Trim(); computer = $env:COMPUTERNAME; user = $env:USERNAME
      drive = $env:SystemDrive; diskTotal = [int64]$disk.Size; diskFree = [int64]$disk.FreeSpace
      admin = $admin
      uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
    }`);
  return { ...json[0], mock: false };
}

async function restoreStatus() {
  const { json } = await runPowerShell(String.raw`
    $sr = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
    $policy = (Get-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\SystemRestore' -Name DisableSR -ErrorAction SilentlyContinue).DisableSR
    $interval = (Get-ItemProperty -Path $sr -Name RPSessionInterval -ErrorAction SilentlyContinue).RPSessionInterval
    Emit @{ enabled = ($interval -eq 1); blockedByPolicy = ($policy -eq 1) }`);
  return json[0] || { enabled: false, blockedByPolicy: false };
}

/**
 * Crea un punto de restauración. Si «Restaurar sistema» está apagado, NO lo enciende
 * salvo que el usuario lo haya aceptado (allowEnable), porque reserva espacio en disco.
 */
async function createRestorePoint(log, { allowEnable = false } = {}) {
  const st = await restoreStatus();
  if (st.blockedByPolicy) {
    const message = "Restaurar sistema está bloqueado por una directiva de tu equipo (empresa o centro educativo).";
    log("✖ " + message);
    return { ok: false, blocked: true, message };
  }
  if (!st.enabled && !allowEnable) {
    log("ℹ Restaurar sistema está desactivado en este PC; se pide permiso para activarlo.");
    return { ok: false, needsEnable: true, message: "Restaurar sistema está desactivado." };
  }
  log(st.enabled ? "Creando punto de restauración (puede tardar un minuto)…" : "Activando Restaurar sistema y creando el punto (puede tardar un minuto)…");
  const { json } = await runPowerShell(String.raw`
    ${st.enabled ? "" : String.raw`try { Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop } catch { }`}
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore'
    $old = (Get-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue).SystemRestorePointCreationFrequency
    # Windows solo deja crear uno cada 24 h; quitamos ese límite un momento
    New-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -Value 0 -PropertyType DWord -Force | Out-Null
    $ok = $true; $msg = ''
    try { Checkpoint-Computer -Description 'ToolBox' -RestorePointType MODIFY_SETTINGS -ErrorAction Stop }
    catch { $ok = $false; $msg = $_.Exception.Message }
    if ($null -eq $old) { Remove-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -ErrorAction SilentlyContinue }
    else { Set-ItemProperty -Path $key -Name SystemRestorePointCreationFrequency -Value $old }
    Emit @{ ok = $ok; message = $msg }`, { onLine: log });
  const r = json[0] || { ok: false, message: "Sin respuesta de PowerShell" };
  log(r.ok ? "✔ Punto de restauración creado." : "✖ No se pudo crear el punto de restauración: " + r.message);
  return r;
}

async function restartExplorer(log) {
  log("Reiniciando el Explorador de Windows…");
  await runPowerShell(String.raw`
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }`);
  log("✔ Explorador reiniciado.");
}

// ---------------------------------------------------------------- Limpieza
function scanSnippet(item) {
  if (item.scanScript === null) return "$null";
  if (item.scanScript) return `& { ${item.scanScript} }`;
  return `TB-Size @(${item.paths.map(ps).join(", ")})`;
}

// Cada elemento se mide en su propio proceso y en paralelo, con un tiempo máximo:
// una carpeta enorme ya no retrasa a las demás.
const SCAN_TIMEOUT_MS = 90 * 1000;
const UNMEASURABLE = -1; // no se pudo medir a tiempo

async function cleanupScan(ids, onItem) {
  const items = CLEANUP.filter((c) => ids.includes(c.id));
  const result = {};
  await Promise.all(items.map(async (it) => {
    let bytes;
    if (it.scanScript === null) {
      bytes = null; // se mide al limpiar
    } else {
      const { json, timedOut } = await runPowerShell(
        `try { $b = ${scanSnippet(it)} } catch { $b = $null }\nEmit @{ bytes = $b }`,
        { timeoutMs: SCAN_TIMEOUT_MS }).catch(() => ({ json: [], timedOut: true }));
      bytes = !timedOut && json[0] && typeof json[0].bytes === "number" ? json[0].bytes : UNMEASURABLE;
    }
    result[it.id] = bytes;
    onItem && onItem(it.id, bytes);
  }));
  return result;
}

async function cleanupRun(ids, log, onItem) {
  const results = [];
  for (const it of CLEANUP.filter((c) => ids.includes(c.id))) {
    onItem && onItem(it.id, { status: "running" });
    log(`▶ ${it.name}…`);
    if (it.exe) { results.push(await cleanupRunExe(it, log, onItem)); continue; }
    const body = it.cleanScript
      ? `& { ${it.cleanScript} } | ForEach-Object { [Console]::Out.WriteLine("$_") }; $code = $LASTEXITCODE; $r = @{ removed = $null; skipped = $null }`
      : `$r = TB-Clear @(${it.paths.map(ps).join(", ")}); $code = 0`;
    const { json } = await runPowerShell(`
      $f0 = TB-Free
      ${it.before || ""}
      ${body}
      ${it.afterScript || ""}
      $f1 = TB-Free
      Emit @{ id = ${ps(it.id)}; freed = [math]::Max([int64]0, $f1 - $f0); removed = $r.removed; skipped = $r.skipped; code = $code }`,
    { onLine: (l) => log("   " + l) });
    const r = json[0] || { id: it.id, freed: 0, code: -1 };
    r.ok = !r.code;
    results.push(r);
    onItem && onItem(it.id, { status: r.ok ? "done" : "error", ...r });
  }
  return results;
}

/** Limpieza con un programa de Windows (DISM): muestra el porcentaje en directo. */
async function cleanupRunExe(it, log, onItem) {
  const free = async () => ((await runPowerShell("Emit @{ f = TB-Free }")).json[0] || {}).f || 0;
  const f0 = await free();
  const { code } = await runProcess(it.exe, it.args, {
    onLine: (l) => log("   " + l),
    onProgress: (pct) => onItem && onItem(it.id, { status: "running", percent: pct }),
  });
  const f1 = await free();
  const ok = (it.okCodes || [0]).includes(code);
  const r = { id: it.id, freed: Math.max(0, f1 - f0), removed: null, skipped: null, code, ok };
  if (!ok) log(`   ✖ ${it.exe} terminó con el código 0x${code.toString(16).toUpperCase()}.`);
  onItem && onItem(it.id, { status: ok ? "done" : "error", ...r });
  return r;
}

// ---------------------------------------------------------------- Reparaciones
/**
 * Ejecuta una reparación paso a paso.
 * onProgress({ step, total, label, percent }) para la barra; devuelve
 * { ok, reboot, warnings: [], failed: label|null }.
 */
async function runRepair(id, log, onProgress) {
  const rep = REPAIRS.find((r) => r.id === id);
  const result = { ok: true, reboot: !!rep.rebootRequired, warnings: [], notes: [], failed: null };
  log(`▶ ${rep.name}`);
  for (let i = 0; i < rep.steps.length; i++) {
    const step = rep.steps[i];
    if (result.failed && !step.always) continue;
    const progress = (pct) => onProgress && onProgress({ step: i + 1, total: rep.steps.length, label: step.label, percent: pct });
    progress(null);
    log(`   Paso ${i + 1}/${rep.steps.length}: ${step.label}…`);
    let ok = true, reboot = false, message = "";
    try {
      if (step.exe) {
        const { code, output } = await runProcess(step.exe, step.args, {
          utf16: step.utf16, onLine: (l) => log("      " + l), onProgress: progress,
        });
        // Lo que el programa dice en texto (p. ej. SFC «reparó archivos») cuenta aunque el código sea 0
        const text = output.join("\n");
        const rule = (step.outputRules || []).find((r) => r.match.test(text));
        if (rule) {
          if (rule.note) result.notes.push(rule.note);
          if (rule.warn) result.warnings.push(rule.warn);
          if (rule.reboot) reboot = true;
        }
        reboot = reboot || (step.rebootCodes || []).includes(code);
        ok = reboot || (step.okCodes || [0]).includes(code);
        if (!ok) message = `${step.failText || "El paso no terminó bien."} (código 0x${code.toString(16).toUpperCase()})`;
      } else {
        const { json } = await runPowerShell(`try {\n${step.ps}\nEmit @{ ok = $true } } catch { Emit @{ ok = $false; message = $_.Exception.Message } }`,
          { onLine: (l) => log("      " + l) });
        json.filter((j) => j.warn).forEach((j) => { result.warnings.push(j.warn); log("      ⚠ " + j.warn); });
        const end = json.find((j) => "ok" in j) || { ok: false, message: "Sin respuesta de PowerShell" };
        ok = end.ok; message = end.message || "";
      }
    } catch (e) {
      ok = false; message = e.code === "ENOENT" ? `No se encontró ${step.exe} en este PC.` : e.message;
    }
    if (reboot) result.reboot = true;
    if (ok) log("   ✔ Hecho.");
    else if (step.warnOnFail) { result.warnings.push(`${step.label}: ${message}`); log("   ⚠ " + message); }
    else { result.ok = false; result.failed = step.label; result.message = message; log("   ✖ " + message); }
    progress(100);
  }
  log(result.ok ? `✔ ${rep.name}: terminado${result.warnings.length ? " con avisos" : ""}.` : `✖ ${rep.name}: no se pudo completar.`);
  return result;
}

async function reboot(log) {
  log("Reiniciando el equipo en 10 segundos…");
  await runProcess("shutdown.exe", ["/r", "/t", "10", "/c", "ToolBox: reinicio para terminar los cambios."]);
  return { ok: true };
}

// ---------------------------------------------------------------- Apps de Windows (bloatware)
/** Qué apps del catálogo están instaladas (para cualquier usuario) o incluidas en la plantilla de usuarios nuevos. */
async function bloatStatus() {
  const { json } = await runPowerShell(String.raw`
    $names = @(Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name -Unique)
    $prov = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue | Select-Object -ExpandProperty DisplayName -Unique)
    Emit @{ names = $names; prov = $prov }`);
  const r = json[0] || { names: [], prov: [] };
  const installed = new Set([].concat(r.names || []).map((n) => String(n).toLowerCase()));
  const provisioned = new Set([].concat(r.prov || []).map((n) => String(n).toLowerCase()));
  return Object.fromEntries(BLOAT.map((a) => {
    const k = a.id.toLowerCase();
    return [a.id, { installed: installed.has(k), provisioned: provisioned.has(k) }];
  }));
}

/** Quita las apps para todos los usuarios y de la plantilla (para que no vuelvan con usuarios nuevos). */
async function bloatRemove(ids, log, onItem) {
  const apps = BLOAT.filter((a) => ids.includes(a.id));
  const body = apps.map((a) => String.raw`
    $name = ${ps(a.id)}
    Emit @{ id = $name; status = 'running' }
    ${a.preRemove ? `try { ${a.preRemove} } catch { }` : ""}
    $pkgs = @(Get-AppxPackage -AllUsers -Name $name -ErrorAction SilentlyContinue | Sort-Object PackageFullName -Unique)
    $provs = @($provAll | Where-Object { $_.DisplayName -eq $name })
    if (-not $pkgs.Count -and -not $provs.Count) {
      Emit @{ id = $name; status = 'notInstalled' }
    } else {
      $err = $null
      foreach ($p in $pkgs) { try { Remove-AppxPackage -Package $p.PackageFullName -AllUsers -ErrorAction Stop } catch { $err = $_.Exception.Message } }
      foreach ($p in $provs) { try { Remove-AppxProvisionedPackage -Online -PackageName $p.PackageName -ErrorAction Stop | Out-Null } catch { if (-not $err) { $err = $_.Exception.Message } } }
      $still = @(Get-AppxPackage -AllUsers -Name $name -ErrorAction SilentlyContinue)
      if ($still.Count) { Emit @{ id = $name; status = 'error'; message = "$err" } } else { Emit @{ id = $name; status = 'removed' } }
    }`).join("\n");
  const results = [];
  log(`▶ Quitando ${apps.length} app${apps.length === 1 ? "" : "s"} de Windows…`);
  await runPowerShell(String.raw`
    # La lista de la plantilla se pide una sola vez: es lenta
    $provAll = @(Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue)
    ${body}`, {
    onLine: (l) => log("   " + l),
    onJson: (o) => {
      const app = BLOAT.find((a) => a.id === o.id);
      if (!app) return;
      if (o.status === "running") { onItem && onItem(o.id, { status: "running" }); return; }
      let reason;
      if (o.status === "error") {
        reason = /0x80073CFA|cannot be removed|no se puede quitar|forma parte de Windows/i.test(o.message || "")
          ? "Windows no permite quitar esta app (forma parte del sistema)."
          : (o.message || "Windows no permitió quitarla.").split("\n")[0];
      }
      log(o.status === "removed" ? `✔ ${app.name} quitada.` : o.status === "notInstalled" ? `✔ ${app.name} no estaba instalada.` : `✖ ${app.name}: ${reason}`);
      const r = { id: o.id, status: o.status, reason };
      results.push(r);
      onItem && onItem(o.id, r);
    },
  });
  // Cualquier app sin respuesta (p. ej. PowerShell se cerró) cuenta como error
  for (const a of apps) if (!results.find((r) => r.id === a.id)) {
    const r = { id: a.id, status: "error", reason: "No hubo respuesta de Windows." };
    results.push(r); onItem && onItem(a.id, r);
  }
  return results;
}

/** Vuelve a instalar apps desde Microsoft Store (winget, origen msstore). */
async function bloatReinstall(ids, log, onItem) {
  const results = [];
  for (const app of BLOAT.filter((a) => ids.includes(a.id))) {
    onItem && onItem(app.id, { status: "running" });
    log(`▶ Reinstalando ${app.name} desde Microsoft Store…`);
    let r;
    if (!app.storeId) {
      r = { status: "manual", reason: "Búscala en Microsoft Store para volver a instalarla." };
    } else {
      try {
        const { code } = await runProcess("winget", ["install", "--id", app.storeId, "--source", "msstore", "--silent",
          "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { onLine: (l) => log("   " + l) });
        const o = wingetOutcome(code);
        r = ["done", "reboot", "already", "uptodate", "userScope"].includes(o.status) ? { status: "reinstalled" } : { status: "error", reason: o.reason };
      } catch (e) {
        r = { status: "error", reason: e.code === "ENOENT" ? "winget no está instalado." : e.message };
      }
    }
    log(r.status === "reinstalled" ? `✔ ${app.name} reinstalada.` : r.status === "manual" ? `ℹ ${app.name}: ${r.reason}` : `✖ ${app.name}: ${r.reason || "no se pudo reinstalar."}`);
    onItem && onItem(app.id, r);
    results.push({ id: app.id, ...r });
  }
  return results;
}

// ---------------------------------------------------------------- Ajustes
async function tweaksStatus() {
  const lines = [];
  TWEAKS.forEach((t) => t.registry.forEach((e, i) => {
    const { hive, sub } = splitHive(e.path);
    lines.push(`$v = TB-Get ${ps(hive)} ${ps(sub)} ${ps(e.name)}; Emit @{ id = ${ps(t.id)}; i = ${i}; exists = $v.exists; value = $v.value }`);
  }));
  const { json } = await runPowerShell(lines.join("\n"));
  const status = {};
  for (const t of TWEAKS) {
    const vals = json.filter((j) => j.id === t.id);
    status[t.id] = t.registry.every((e, i) => {
      const v = vals.find((x) => x.i === i);
      return v && v.exists && String(v.value) === String(e.value);
    });
  }
  return status;
}

async function tweakSet(id, enable, log) {
  const t = TWEAKS.find((x) => x.id === id);
  const lines = t.registry.map((e) => {
    const { hive, sub } = splitHive(e.path);
    if (enable) return `TB-Set ${ps(hive)} ${ps(sub)} ${ps(e.name)} ${ps(e.type)} ${ps(e.value)}`;
    if (e.removeKeyOnUndo) {
      const k = splitHive(e.removeKeyOnUndo);
      return `TB-DelKey ${ps(k.hive)} ${ps(k.sub)}`;
    }
    if (e.original === null) return `TB-DelValue ${ps(hive)} ${ps(sub)} ${ps(e.name)}`;
    return `TB-Set ${ps(hive)} ${ps(sub)} ${ps(e.name)} ${ps(e.type)} ${ps(e.original)}`;
  });
  log(`${enable ? "▶ Aplicando" : "↩ Deshaciendo"}: ${t.name}`);
  const { json } = await runPowerShell(`try {\n${lines.join("\n")}\nEmit @{ ok = $true } } catch { Emit @{ ok = $false; message = $_.Exception.Message } }`);
  const r = json[0] || { ok: false, message: "Sin respuesta" };
  log(r.ok ? "✔ Hecho." : "✖ Error: " + r.message);
  return r;
}

// ---------------------------------------------------------------- Apps
async function wingetAvailable() {
  try { return (await runProcess("winget", ["--version"])).code === 0; } catch { return false; }
}

/** IDs de winget instalados. «winget export» da los identificadores exactos, sin los recortes
 *  («…») de la tabla de «winget list»; si falla, se lee la tabla por columnas. */
async function appsInstalled() {
  const ids = await installedIdsFromExport().catch(() => null) || await installedIdsFromList().catch(() => new Set());
  return Object.fromEntries(APPS.map((a) => [a.id, ids.has(a.id.toLowerCase())]));
}

async function installedIdsFromExport() {
  const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");
  const file = path.join(os.tmpdir(), `toolbox-export-${crypto.randomUUID()}.json`);
  try {
    await runProcess("winget", ["export", "-o", file, "--source", "winget", "--accept-source-agreements", "--disable-interactivity"]);
    const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    const ids = new Set();
    for (const src of data.Sources || []) for (const p of src.Packages || []) ids.add(String(p.PackageIdentifier).toLowerCase());
    return ids;
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

async function installedIdsFromList() {
  const { output } = await runProcess("winget", ["list", "--accept-source-agreements", "--disable-interactivity"]);
  return parseWingetTableIds(output);
}

/** Lee la columna «Id» de una tabla de winget (sea cual sea el idioma de las cabeceras). */
function parseWingetTableIds(lines) {
  const ids = new Set();
  const sep = lines.findIndex((l) => /^-{3,}\s*$/.test(l));
  if (sep < 1) return ids;
  const header = lines[sep - 1];
  const m = header.match(/^(\S+\s+)\S/); // primera columna (Nombre) + espacios → empieza «Id»
  if (!m) return ids;
  const idStart = m[1].length;
  for (const row of lines.slice(sep + 1)) {
    const id = row.slice(idStart).trim().split(/\s+/)[0];
    if (id && !id.includes("…")) ids.add(id.toLowerCase());
  }
  return ids;
}

/** Traduce el código de salida de winget a un estado comprensible.
 *  https://learn.microsoft.com/windows/package-manager/winget/returnCodes */
function wingetOutcome(code) {
  switch (code >>> 0) {
    case 0: return { status: "done" };
    case 3010: case 0x8a150109: return { status: "reboot" };       // instalado; falta reiniciar
    case 1641: case 0x8a15010b: return { status: "reboot" };       // instalado; el instalador reinicia
    case 0x8a150061: return { status: "already" };                 // ya estaba instalado
    case 0x8a15002b: return { status: "uptodate" };                // no hay versión nueva
    case 0x8a15007d: return { status: "userScope" };               // instalado «solo para tu usuario»
    case 0x8a150014: return { status: "error", reason: "No se encontró el programa en winget." };
    case 0x8a150008:
      return { status: "error", reason: "Fallo de descarga. Revisa tu conexión a Internet." };
    default: return { status: "error", reason: `winget devolvió el código 0x${(code >>> 0).toString(16).toUpperCase()}.` };
  }
}

const OUTCOME_TEXT = {
  done: (n) => `✔ ${n} instalada.`,
  reboot: (n) => `✔ ${n} instalada. Reinicia el PC para terminar.`,
  already: (n) => `✔ ${n} ya estaba instalada.`,
  uptodate: (n) => `✔ ${n} ya estaba al día.`,
  userScope: (n) => `ℹ ${n} ya está instalada solo para tu usuario; ToolBox (como administrador) no puede modificarla.`,
  error: (n, r) => `✖ No se pudo instalar ${n}. ${r || ""}`,
};

async function appsInstall(ids, log, onItem) {
  const results = [];
  for (const app of APPS.filter((a) => ids.includes(a.id))) {
    onItem && onItem(app.id, { status: "running" });
    log(`▶ Instalando ${app.name}…`);
    let outcome;
    try {
      const { code } = await runProcess("winget", ["install", "--id", app.id, "--exact", "--source", "winget", "--silent",
        "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { onLine: (l) => log("   " + l) });
      outcome = wingetOutcome(code);
    } catch (e) {
      outcome = { status: "error", reason: e.code === "ENOENT" ? "winget no está instalado." : e.message };
    }
    log(OUTCOME_TEXT[outcome.status](app.name, outcome.reason));
    onItem && onItem(app.id, outcome);
    results.push({ id: app.id, ...outcome });
  }
  return results;
}

async function appsUpgradeAll(log) {
  log("▶ Buscando e instalando actualizaciones de tus apps…");
  const { code } = await runProcess("winget", ["upgrade", "--all", "--include-unknown", "--silent",
    "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { onLine: (l) => log("   " + l) });
  const { status } = wingetOutcome(code);
  const ok = ["done", "uptodate", "reboot"].includes(status);
  log(status === "reboot" ? "✔ Actualizado. Reinicia el PC para terminar." : ok ? "✔ Todo al día." :
    "⚠ Algunas apps no se pudieron actualizar (las instaladas «solo para tu usuario» no se pueden actualizar como administrador).");
  return { ok, reboot: status === "reboot" };
}

module.exports = {
  parseWingetTableIds, wingetOutcome,
  systemInfo, restoreStatus, createRestorePoint, restartExplorer,
  cleanupScan, cleanupRun,
  tweaksStatus, tweakSet,
  wingetAvailable, appsInstalled, appsInstall, appsUpgradeAll,
  runRepair, reboot,
  bloatStatus, bloatRemove, bloatReinstall,
};
