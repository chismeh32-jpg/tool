// Gráficos (Windows real): detección, NVIDIA (toolbox-nv.exe), AMD (toolbox-amd.exe) y ajustes de Windows.
const fs = require("fs");
const path = require("path");
const { runPowerShell, runProcess } = require("./powershell");
const G = require("../data/graphics");

// ---------------------------------------------------------------- Ayudantes nativos
function helperPath(name) {
  const candidates = [
    process.env.TOOLBOX_BIN && path.join(process.env.TOOLBOX_BIN, name),
    process.resourcesPath && path.join(process.resourcesPath, "bin", name),
    path.join(__dirname, "..", "..", "native", "bin", name),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function runHelper(name, args) {
  const exe = helperPath(name);
  if (!exe) return { available: false, ok: false, missing: true };
  const { code, output } = await runProcess(exe, args, { timeoutMs: 60000 });
  const line = output.find((l) => l.trim().startsWith("{"));
  try { return JSON.parse(line); } catch { return { available: false, ok: false, error: `Respuesta no válida (código ${code})` }; }
}

// ---------------------------------------------------------------- Detección
async function gpuDetect() {
  const { json } = await runPowerShell(String.raw`
    $g = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = "$($_.Name)"; vendor = "$($_.AdapterCompatibility)"; driver = "$($_.DriverVersion)" } })
    $c = (Get-CimInstance Win32_Processor | Select-Object -First 1)
    Emit @{ gpus = $g; cpu = "$($c.Name)".Trim(); cpuVendor = "$($c.Manufacturer)" }`);
  const r = json[0] || { gpus: [], cpu: "" };
  const gpus = [].concat(r.gpus || []).filter(Boolean).map((g) => ({
    ...g,
    kind: /nvidia/i.test(g.vendor + g.name) ? "nvidia" : /advanced micro devices|amd|radeon/i.test(g.vendor + g.name) ? "amd" : /intel/i.test(g.vendor + g.name) ? "intel" : "other",
  }));
  return { gpus, cpu: r.cpu, cpuVendor: /amd|advanced micro/i.test(r.cpuVendor || r.cpu) ? "amd" : /intel/i.test(r.cpuVendor || r.cpu) ? "intel" : "other" };
}

// ---------------------------------------------------------------- NVIDIA
async function nvidiaState() {
  const info = await runHelper("toolbox-nv.exe", ["info"]);
  if (!info.available) return { info };
  const got = await runHelper("toolbox-nv.exe", ["get", ...G.NVIDIA.map((s) => "0x" + s.id.toString(16))]);
  const values = {};
  for (const s of G.NVIDIA) {
    const r = (got.results || []).find((x) => x.id === s.id);
    // «set:false» = el perfil global no lo define → se usa el valor de fábrica de NVIDIA
    values[s.key] = r && r.ok ? (r.set ? r.value : s.factory) : null;
  }
  return { info, values };
}

async function nvidiaApply(values, log) {
  const args = Object.entries(values).map(([k, v]) => {
    const s = G.NVIDIA.find((x) => x.key === k);
    // Se acepta cualquier entero de 32 bits: la copia de seguridad puede tener valores que ToolBox no ofrece
    if (!s || !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 0xffffffff) throw new Error(`Valor no permitido: ${k}=${v}`);
    return `0x${s.id.toString(16)}=${v}`;
  });
  log(`▶ NVIDIA: aplicando ${args.length} ajuste(s)…`);
  const r = await runHelper("toolbox-nv.exe", ["set", ...args]);
  log(r.ok ? "✔ Ajustes de NVIDIA guardados." : `✖ NVIDIA: ${JSON.stringify(r.results || r.error)}`);
  return r;
}

async function nvidiaFactory(keys, log) {
  const ids = G.NVIDIA.filter((s) => keys.includes(s.key)).map((s) => "0x" + s.id.toString(16));
  log("▶ NVIDIA: volviendo a los valores de fábrica…");
  const r = await runHelper("toolbox-nv.exe", ["reset", ...ids]);
  log(r.ok ? "✔ Valores de fábrica de NVIDIA restaurados." : `✖ NVIDIA: ${JSON.stringify(r.results || r.error)}`);
  return r;
}

// ---------------------------------------------------------------- AMD
async function amdState() {
  return runHelper("toolbox-amd.exe", ["info"]);
}

async function amdApply(values, log) {
  const allowed = new Set([...G.AMD.map((a) => a.key), "sharpness"]);
  const args = Object.entries(values).map(([k, v]) => {
    if (!allowed.has(k) || !Number.isInteger(Number(v))) throw new Error(`Valor no permitido: ${k}=${v}`);
    return `${k}=${Number(v)}`;
  });
  log(`▶ AMD: aplicando ${args.join(", ")}…`);
  const r = await runHelper("toolbox-amd.exe", ["set", ...args]);
  log(r.ok ? "✔ Ajustes de AMD guardados." : `✖ AMD: ${JSON.stringify(r.results || r)}`);
  return r;
}

// ---------------------------------------------------------------- Windows
const DX = "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences";

async function windowsState() {
  const { json } = await runPowerShell(String.raw`
    $h = TB-Get 'HKLM' 'SYSTEM\CurrentControlSet\Control\GraphicsDrivers' 'HwSchMode'
    $d = TB-Get 'HKCU' 'Software\Microsoft\DirectX\UserGpuPreferences' 'DirectXUserGlobalSettings'
    $m = TB-Get 'HKCU' 'Software\Microsoft\GameBar' 'AutoGameModeEnabled'
    Emit @{ hags = $h.value; dx = $d.value; gameMode = $m.value }`);
  const r = json[0] || {};
  return {
    hags: String(r.hags) === "2",
    windowedOpt: /(^|;)SwapEffectUpgradeEnable=1(;|$)/.test(r.dx || ""),
    gameMode: r.gameMode === undefined || r.gameMode === null || String(r.gameMode) !== "0", // sin valor = activado
  };
}

/** Cambia una clave «X=1;» dentro de la cadena DirectXUserGlobalSettings sin tocar las demás. */
function setDxFlag(current, flag, value) {
  const parts = String(current || "").split(";").map((p) => p.trim()).filter(Boolean).filter((p) => !p.startsWith(flag + "="));
  parts.push(`${flag}=${value}`);
  return parts.join(";") + ";";
}

async function windowsSet(key, enable, log) {
  let script;
  if (key === "hags") {
    script = `TB-Set 'HKLM' 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' 'HwSchMode' 'DWord' ${enable ? 2 : 1}`;
  } else if (key === "gameMode") {
    script = `TB-Set 'HKCU' 'Software\\Microsoft\\GameBar' 'AutoGameModeEnabled' 'DWord' ${enable ? 1 : 0}`;
  } else if (key === "windowedOpt") {
    const { json } = await runPowerShell("$d = TB-Get 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings'; Emit @{ v = $d.value }");
    const next = setDxFlag((json[0] || {}).v, "SwapEffectUpgradeEnable", enable ? 1 : 0);
    script = `TB-Set 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings' 'String' '${next.replace(/'/g, "''")}'`;
  } else throw new Error("Ajuste desconocido");
  const { json } = await runPowerShell(`try { ${script}; Emit @{ ok = $true } } catch { Emit @{ ok = $false; message = $_.Exception.Message } }`);
  const r = json[0] || { ok: false };
  const name = G.WINDOWS.find((w) => w.key === key).name;
  log(r.ok ? `✔ ${name}: ${enable ? "activado" : "desactivado"}.` : `✖ ${name}: ${r.message}`);
  return r;
}

// ---------------------------------------------------------------- Telemetría de NVIDIA (tareas programadas)
async function nvidiaTelemetryTasks() {
  const { json } = await runPowerShell(String.raw`
    $t = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'NvTm*' } | ForEach-Object { @{ name = $_.TaskName; path = $_.TaskPath; enabled = ($_.State -ne 'Disabled') } })
    Emit @{ tasks = $t }`);
  return [].concat((json[0] || {}).tasks || []).filter(Boolean);
}

async function nvidiaTelemetrySet(enable, log) {
  const { json } = await runPowerShell(String.raw`
    $n = 0
    Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'NvTm*' } | ForEach-Object {
      if (${enable ? "$true" : "$false"}) { Enable-ScheduledTask -InputObject $_ | Out-Null } else { Disable-ScheduledTask -InputObject $_ | Out-Null }
      $n++
    }
    Emit @{ count = $n }`);
  const n = (json[0] || {}).count || 0;
  log(`${enable ? "✔ Reactivadas" : "✔ Desactivadas"} ${n} tarea(s) de telemetría de NVIDIA.`);
  return { ok: true, count: n };
}

module.exports = {
  helperPath, setDxFlag, gpuDetect,
  nvidiaState, nvidiaApply, nvidiaFactory,
  amdState, amdApply,
  windowsState, windowsSet,
  nvidiaTelemetryTasks, nvidiaTelemetrySet,
};
