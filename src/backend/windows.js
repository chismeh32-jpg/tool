// Implementación real para Windows.
const { runPowerShell, runProcess, ps } = require("./powershell");
const CLEANUP = require("../data/cleanup");
const TWEAKS = require("../data/tweaks");
const APPS = require("../data/apps");

const WINGET_ALREADY_INSTALLED = 0x8a150061;
const WINGET_NO_UPGRADE = 0x8a15002b;

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

async function createRestorePoint(log) {
  log("Creando punto de restauración (puede tardar un minuto)…");
  const { json } = await runPowerShell(String.raw`
    try { Enable-ComputerRestore -Drive "$env:SystemDrive\" -ErrorAction Stop } catch { }
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

async function cleanupScan(ids, onItem) {
  const items = CLEANUP.filter((c) => ids.includes(c.id));
  const script = items.map((it) =>
    `try { $b = ${scanSnippet(it)} } catch { $b = $null }\nEmit @{ id = ${ps(it.id)}; bytes = $b }`).join("\n");
  const result = {};
  await runPowerShell(script, {
    onJson: (o) => { result[o.id] = o.bytes; onItem && onItem(o.id, o.bytes); },
  });
  return result;
}

async function cleanupRun(ids, log, onItem) {
  const results = [];
  for (const it of CLEANUP.filter((c) => ids.includes(c.id))) {
    onItem && onItem(it.id, { status: "running" });
    log(`▶ ${it.name}…`);
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

async function appsInstalled() {
  try {
    const { output } = await runProcess("winget", ["list", "--accept-source-agreements", "--disable-interactivity"]);
    const text = output.join("\n").toLowerCase();
    return Object.fromEntries(APPS.map((a) => [a.id, text.includes(a.id.toLowerCase())]));
  } catch { return {}; }
}

async function appsInstall(ids, log, onItem) {
  const results = [];
  for (const app of APPS.filter((a) => ids.includes(a.id))) {
    onItem && onItem(app.id, { status: "running" });
    log(`▶ Instalando ${app.name}…`);
    let status;
    try {
      const { code } = await runProcess("winget", ["install", "--id", app.id, "--exact", "--silent",
        "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { onLine: (l) => log("   " + l) });
      status = code === 0 ? "done" : code === WINGET_ALREADY_INSTALLED ? "already" : "error";
    } catch (e) {
      log("   " + e.message);
      status = "error";
    }
    log(status === "done" ? `✔ ${app.name} instalada.` : status === "already" ? `✔ ${app.name} ya estaba instalada.` : `✖ No se pudo instalar ${app.name}.`);
    onItem && onItem(app.id, { status });
    results.push({ id: app.id, status });
  }
  return results;
}

async function appsUpgradeAll(log) {
  log("▶ Buscando e instalando actualizaciones de tus apps…");
  const { code } = await runProcess("winget", ["upgrade", "--all", "--silent",
    "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"], { onLine: (l) => log("   " + l) });
  const ok = code === 0 || code === WINGET_NO_UPGRADE;
  log(ok ? "✔ Todo al día." : "⚠ Algunas apps no se pudieron actualizar (mira el registro).");
  return { ok };
}

module.exports = {
  systemInfo, createRestorePoint, restartExplorer,
  cleanupScan, cleanupRun,
  tweaksStatus, tweakSet,
  wingetAvailable, appsInstalled, appsInstall, appsUpgradeAll,
};
