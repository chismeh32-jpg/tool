// Modo demostración: simula Windows para poder ver y probar la interfaz en
// cualquier sistema (o en Windows con TOOLBOX_MOCK=1). No toca nada del equipo.
const CLEANUP = require("../data/cleanup");
const TWEAKS = require("../data/tweaks");
const APPS = require("../data/apps");
const REPAIRS = require("../data/repairs");

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
    drive: "C:", diskTotal: 476 * GB, diskFree, admin: true, uptimeHours: 52.3, mock: true,
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
  const result = { ok: true, reboot: !!rep.rebootRequired, warnings: [], failed: null };
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
  if (rep.id === "system-files") { result.reboot = true; result.warnings.push("Revisando los archivos del sistema (SFC): se repararon algunos archivos (demo)."); }
  if (rep.rebootSuggested) result.reboot = true;
  log(`✔ ${rep.name}: terminado.`);
  return result;
}

async function reboot(log) { log("Reinicio solicitado (demo: no se reinicia nada)."); return { ok: true }; }

module.exports = {
  runRepair, reboot,
  systemInfo, restoreStatus, createRestorePoint, restartExplorer,
  cleanupScan, cleanupRun,
  tweaksStatus, tweakSet,
  wingetAvailable, appsInstalled, appsInstall, appsUpgradeAll,
};
