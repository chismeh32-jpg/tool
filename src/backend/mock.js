// Modo demostración: simula Windows para poder ver y probar la interfaz en
// cualquier sistema (o en Windows con TOOLBOX_MOCK=1). No toca nada del equipo.
const CLEANUP = require("../data/cleanup");
const TWEAKS = require("../data/tweaks");
const APPS = require("../data/apps");
const REPAIRS = require("../data/repairs");
const BLOAT = require("../data/bloatware").APPS;
// En la demo, todas están instaladas salvo algunas herramientas; Xbox Identity simula que Windows no deja quitarla
const bloatInstalled = new Set(BLOAT.filter((a) => !["Microsoft.ZuneVideo", "Microsoft.Windows.DevHome"].includes(a.id)).map((a) => a.id));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GB = 1024 ** 3;
const MB = 1024 ** 2;

const FAKE_SIZES = {
  "temp-user": 1.8 * GB, "temp-windows": 420 * MB, "wu-cache": 3.1 * GB, "delivery-opt": 2.4 * GB,
  thumbnails: 96 * MB, "error-reports": -1, "recycle-bin": 750 * MB, "old-updates": null,
};
const tweakState = Object.fromEntries(TWEAKS.map((t, i) => [t.id, i % 4 === 0]));
const installed = new Set(["Google.Chrome", "7zip.7zip", "Valve.Steam", "Discord.Discord"]);
let diskFree = 41 * GB;
let restoreEnabled = false; // para enseñar el aviso de «Restaurar sistema desactivado»

async function systemInfo() {
  await wait(300);
  return {
    os: "Microsoft Windows 11 Home (demo)", version: "10.0.26100", build: "26100",
    ram: 16 * GB, cpu: "AMD Ryzen 5 5600X 6-Core Processor", computer: "PC-DEMO", user: "tú",
    drive: "C:", diskTotal: 476 * GB, diskFree, admin: true, uptimeHours: 52.3, desktopUser: "tú", mock: true,
  };
}

async function restoreStatus() { return { enabled: restoreEnabled, blockedByPolicy: false }; }

async function createRestorePoint(log, { allowEnable = false } = {}) {
  if (!restoreEnabled && !allowEnable) {
    log("ℹ Restaurar sistema está desactivado en este PC; se pide permiso para activarlo.");
    return { ok: false, needsEnable: true, message: "Restaurar sistema está desactivado." };
  }
  restoreEnabled = true;
  log("Creando punto de restauración (demo)…");
  await wait(1200);
  log("✔ Punto de restauración creado.");
  return { ok: true };
}

async function restartExplorer(log) { log("Reiniciando el Explorador (demo)…"); await wait(600); log("✔ Explorador reiniciado."); }

async function cleanupScan(ids, onItem) {
  const out = {};
  for (const id of ids) {
    await wait(250 + Math.random() * 400);
    out[id] = FAKE_SIZES[id] === undefined ? 0 : FAKE_SIZES[id];
    onItem && onItem(id, out[id]);
  }
  return out;
}

async function cleanupRun(ids, log, onItem) {
  const results = [];
  for (const it of CLEANUP.filter((c) => ids.includes(c.id))) {
    onItem && onItem(it.id, { status: "running" });
    log(`▶ ${it.name}…`);
    await wait(it.slow ? 2500 : 700);
    const freed = it.id === "old-updates" ? 4.2 * GB : it.id === "error-reports" ? 610 * MB : Math.max(0, FAKE_SIZES[it.id] || 0) * 0.93;
    FAKE_SIZES[it.id] = Math.max(0, FAKE_SIZES[it.id] || 0) * 0.07;
    diskFree += freed;
    const r = { id: it.id, freed, removed: 120, skipped: it.paths ? 3 : null, ok: true };
    log(`   ${it.paths ? "3 archivos estaban en uso y se han saltado." : "Operación completada."}`);
    onItem && onItem(it.id, { status: "done", ...r });
    results.push(r);
  }
  return results;
}

async function tweaksStatus() { await wait(200); return { ...tweakState }; }

async function tweakSet(id, enable, log) {
  const t = TWEAKS.find((x) => x.id === id);
  log(`${enable ? "▶ Aplicando" : "↩ Deshaciendo"}: ${t.name}`);
  await wait(350);
  tweakState[id] = enable;
  log("✔ Hecho.");
  return { ok: true };
}

async function wingetAvailable() { return true; }
async function appsInstalled() { await wait(500); return Object.fromEntries(APPS.map((a) => [a.id, installed.has(a.id)])); }

async function appsInstall(ids, log, onItem) {
  const results = [];
  for (const app of APPS.filter((a) => ids.includes(a.id))) {
    onItem && onItem(app.id, { status: "running" });
    log(`▶ Instalando ${app.name}…`);
    await wait(900);
    // La demo enseña también los casos especiales de winget
    const outcome = installed.has(app.id) ? { status: "already" }
      : app.id === "OBSProject.OBSStudio" ? { status: "reboot" }
      : app.id === "Zoom.Zoom" ? { status: "userScope" }
      : app.id === "GOG.Galaxy" ? { status: "error", reason: "Fallo de descarga. Revisa tu conexión a Internet." }
      : { status: "done" };
    if (outcome.status !== "error") installed.add(app.id);
    log({ done: `✔ ${app.name} instalada.`, already: `✔ ${app.name} ya estaba instalada.`,
      reboot: `✔ ${app.name} instalada. Reinicia el PC para terminar.`,
      userScope: `ℹ ${app.name} ya está instalada solo para tu usuario; ToolBox (como administrador) no puede modificarla.`,
      error: `✖ No se pudo instalar ${app.name}. ${outcome.reason || ""}` }[outcome.status]);
    onItem && onItem(app.id, outcome);
    results.push({ id: app.id, ...outcome });
  }
  return results;
}

async function appsUpgradeAll(log) { log("▶ Buscando actualizaciones (demo)…"); await wait(1500); log("✔ Todo al día."); return { ok: true }; }

async function runRepair(id, log, onProgress) {
  const rep = REPAIRS.find((r) => r.id === id);
  const result = { ok: true, reboot: !!rep.rebootRequired, warnings: [], notes: [], failed: null };
  log(`▶ ${rep.name}`);
  for (let i = 0; i < rep.steps.length; i++) {
    const step = rep.steps[i];
    log(`   Paso ${i + 1}/${rep.steps.length}: ${step.label}…`);
    const slow = rep.id === "system-files";
    for (let p = 0; p <= 100; p += slow ? 10 : 50) {
      onProgress({ step: i + 1, total: rep.steps.length, label: step.label, percent: step.exe ? p : null });
      await wait(slow ? 250 : 200);
    }
    log("   ✔ Hecho.");
  }
  if (rep.id === "system-files") { result.reboot = true; result.notes.push("El disco está bien.", "La imagen de Windows está sana.", "SFC encontró archivos dañados y los reparó."); }
  if (rep.rebootSuggested) result.reboot = true;
  log(`✔ ${rep.name}: terminado.`);
  return result;
}

async function bloatStatus() {
  await wait(400);
  return Object.fromEntries(BLOAT.map((a) => [a.id, { installed: bloatInstalled.has(a.id), provisioned: bloatInstalled.has(a.id) }]));
}

async function bloatRemove(ids, log, onItem) {
  const results = [];
  for (const a of BLOAT.filter((x) => ids.includes(x.id))) {
    onItem && onItem(a.id, { status: "running" });
    await wait(350);
    const r = !bloatInstalled.has(a.id) ? { status: "notInstalled" }
      : a.id === "Microsoft.XboxIdentityProvider" ? { status: "error", reason: "Windows no permite quitar esta app (forma parte del sistema)." }
      : { status: "removed" };
    if (r.status === "removed") bloatInstalled.delete(a.id);
    log(r.status === "removed" ? `✔ ${a.name} quitada.` : r.status === "notInstalled" ? `✔ ${a.name} no estaba instalada.` : `✖ ${a.name}: ${r.reason}`);
    onItem && onItem(a.id, r);
    results.push({ id: a.id, ...r });
  }
  return results;
}

async function bloatReinstall(ids, log, onItem) {
  const results = [];
  for (const a of BLOAT.filter((x) => ids.includes(x.id))) {
    onItem && onItem(a.id, { status: "running" });
    await wait(800);
    const r = a.storeId ? { status: "reinstalled" } : { status: "manual", reason: "Búscala en Microsoft Store para volver a instalarla." };
    if (r.status === "reinstalled") bloatInstalled.add(a.id);
    log(r.status === "reinstalled" ? `✔ ${a.name} reinstalada.` : `ℹ ${a.name}: ${r.reason}`);
    onItem && onItem(a.id, r);
    results.push({ id: a.id, ...r });
  }
  return results;
}

// ---- Desinstalador (demo)
let demoPrograms = [
  { key: "HKLM\\DEMO\\Discord", name: "Discord", publisher: "Discord Inc.", version: "1.0.9170", date: "20260912", sizeKB: 412000, location: "C:\\Users\\tú\\AppData\\Local\\Discord" },
  { key: "HKLM\\DEMO\\Steam", name: "Steam", publisher: "Valve Corporation", version: "2.10.91.91", date: "20250301", sizeKB: 0, location: "C:\\Program Files (x86)\\Steam" },
  { key: "HKLM\\DEMO\\McAfee", name: "McAfee WebAdvisor", publisher: "McAfee, LLC", version: "4.1.1.796", date: "20240105", sizeKB: 96000, location: "C:\\Program Files\\McAfee\\WebAdvisor" },
  { key: "HKLM\\DEMO\\WinRAR", name: "WinRAR 7.01 (64-bit)", publisher: "win.rar GmbH", version: "7.01.0", date: "20250620", sizeKB: 8900, location: "C:\\Program Files\\WinRAR\\" },
  { key: "HKLM\\DEMO\\Candy", name: "Juego de caramelos 3", publisher: "King", version: "1.0", date: "20230411", sizeKB: 310000, location: "" },
];
async function programsList() { await wait(500); return demoPrograms.slice().sort((a, b) => a.name.localeCompare(b.name, "es")); }
async function programUninstall(entry, log, { signal = {} } = {}) {
  log(`▶ Abriendo el desinstalador de ${entry.name}… (demo)`);
  for (let i = 0; i < 12; i++) { if (signal.aborted) return { uninstalled: false, aborted: true }; await wait(250); }
  demoPrograms = demoPrograms.filter((p) => p.key !== entry.key);
  log(`✔ ${entry.name} desinstalado.`);
  return { uninstalled: true, exitCode: 0 };
}
async function leftoversScan(entry) {
  await wait(700);
  const n = entry.name.split(" ")[0];
  return [
    { kind: "folder", path: `C:\\Users\\tú\\AppData\\Roaming\\${n}`, bytes: 184 * MB, reason: "Carpeta con el nombre del programa" },
    { kind: "folder", path: `C:\\ProgramData\\${n}`, bytes: 12 * MB, reason: "Carpeta con el nombre del programa" },
    { kind: "key", path: `HKCU\\Software\\${n}`, reason: "Configuración del programa en el registro" },
  ];
}
async function leftoversClean(items, backupDir, log) {
  await wait(600);
  return items.map((i) => { log(`✔ ${i.kind === "folder" ? "Carpeta enviada a la Papelera" : "Clave borrada (con copia)"}: ${i.path}`); return { ...i, ok: true }; });
}

// ---- Gráficos (demo: como el PC del usuario, NVIDIA + Ryzen con gráficos integrados)
const G = require("../data/graphics");
const nvValues = { power: 5, lowLatency: 0, textureQuality: 0 };
const amdFeat = { antiLag: false, sharpening: true, chill: false, boost: false, enhancedSync: true, sharpness: 80 };
const winGfx = { hags: true, windowedOpt: false, gameMode: true };
let nvTasks = [{ name: "NvTmRep_CrashReport1", path: "\\", enabled: true }, { name: "NvTmRepOnLogon", path: "\\", enabled: true }];
async function gpuDetect() {
  await wait(300);
  return { cpu: "AMD Ryzen 7 7800X3D 8-Core Processor", cpuVendor: "amd", gpus: [
    { name: "NVIDIA GeForce RTX 4070", vendor: "NVIDIA", driver: "32.0.15.7283", kind: "nvidia" },
    { name: "AMD Radeon(TM) Graphics", vendor: "Advanced Micro Devices, Inc.", driver: "32.0.12033.5", kind: "amd" }] };
}
async function nvidiaState() { await wait(300); return { info: { available: true, ok: true, driver: "572.83", branch: "r570_00", gpus: ["NVIDIA GeForce RTX 4070"] }, values: { ...nvValues } }; }
async function nvidiaApply(values, log) { await wait(400); Object.assign(nvValues, values); log("✔ Ajustes de NVIDIA guardados."); return { ok: true }; }
async function nvidiaFactory(keys, log) { await wait(400); for (const s of G.NVIDIA) if (keys.includes(s.key)) nvValues[s.key] = s.factory; log("✔ Valores de fábrica de NVIDIA restaurados."); return { ok: true }; }
async function amdState() {
  await wait(300);
  const f = (k, extra = {}) => ({ supported: true, enabled: amdFeat[k], ...extra });
  return { available: true, ok: true, gpu: "AMD Radeon(TM) Graphics", gpuCount: 1, features: {
    antiLag: f("antiLag"), sharpening: f("sharpening", { sharpness: amdFeat.sharpness, min: 10, max: 100 }), chill: f("chill"), boost: { supported: false, enabled: false }, enhancedSync: f("enhancedSync") } };
}
async function amdApply(values, log) { await wait(400); for (const [k, v] of Object.entries(values)) amdFeat[k] = k === "sharpness" ? Number(v) : !!Number(v); log("✔ Ajustes de AMD guardados."); return { ok: true }; }
async function windowsState() { await wait(150); return { ...winGfx }; }
async function windowsSet(key, enable, log) { await wait(250); winGfx[key] = enable; log(`✔ ${key}: ${enable ? "activado" : "desactivado"}.`); return { ok: true }; }
async function nvidiaTelemetryTasks() { return nvTasks.map((t) => ({ ...t })); }
async function nvidiaTelemetrySet(enable, log) { nvTasks = nvTasks.map((t) => ({ ...t, enabled: enable })); log(`✔ ${nvTasks.length} tareas de telemetría ${enable ? "reactivadas" : "desactivadas"}.`); return { ok: true, count: nvTasks.length }; }

async function reboot(log) { log("Reinicio solicitado (demo: no se reinicia nada)."); return { ok: true }; }

module.exports = {
  runRepair, reboot,
  bloatStatus, bloatRemove, bloatReinstall,
  programsList, programUninstall, leftoversScan, leftoversClean,
  gpuDetect, nvidiaState, nvidiaApply, nvidiaFactory, amdState, amdApply, windowsState, windowsSet, nvidiaTelemetryTasks, nvidiaTelemetrySet,
  systemInfo, restoreStatus, createRestorePoint, restartExplorer,
  cleanupScan, cleanupRun,
  tweaksStatus, tweakSet,
  wingetAvailable, appsInstalled, appsInstall, appsUpgradeAll,
};
