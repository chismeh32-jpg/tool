// Modo demostración: simula Windows para poder ver y probar la interfaz en
// cualquier sistema (o en Windows con TOOLBOX_MOCK=1). No toca nada del equipo.
const CLEANUP = require("../data/cleanup");
const TWEAKS = require("../data/tweaks");
const APPS = require("../data/apps");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GB = 1024 ** 3;
const MB = 1024 ** 2;

const FAKE_SIZES = {
  "temp-user": 1.8 * GB, "temp-windows": 420 * MB, "wu-cache": 3.1 * GB, "delivery-opt": 2.4 * GB,
  thumbnails: 96 * MB, "error-reports": 610 * MB, "recycle-bin": 750 * MB, "old-updates": null,
};
const tweakState = Object.fromEntries(TWEAKS.map((t, i) => [t.id, i % 4 === 0]));
const installed = new Set(["Google.Chrome", "7zip.7zip", "Valve.Steam", "Discord.Discord"]);
let diskFree = 41 * GB;

async function systemInfo() {
  await wait(300);
  return {
    os: "Microsoft Windows 11 Home (demo)", version: "10.0.26100", build: "26100",
    ram: 16 * GB, cpu: "AMD Ryzen 5 5600X 6-Core Processor", computer: "PC-DEMO", user: "tú",
    drive: "C:", diskTotal: 476 * GB, diskFree, admin: true, uptimeHours: 52.3, mock: true,
  };
}

async function createRestorePoint(log) {
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
    const freed = it.id === "old-updates" ? 4.2 * GB : (FAKE_SIZES[it.id] || 0) * 0.93;
    FAKE_SIZES[it.id] = (FAKE_SIZES[it.id] || 0) * 0.07;
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
    const status = installed.has(app.id) ? "already" : "done";
    installed.add(app.id);
    log(status === "done" ? `✔ ${app.name} instalada.` : `✔ ${app.name} ya estaba instalada.`);
    onItem && onItem(app.id, { status });
    results.push({ id: app.id, status });
  }
  return results;
}

async function appsUpgradeAll(log) { log("▶ Buscando actualizaciones (demo)…"); await wait(1500); log("✔ Todo al día."); return { ok: true }; }

module.exports = {
  systemInfo, createRestorePoint, restartExplorer,
  cleanupScan, cleanupRun,
  tweaksStatus, tweakSet,
  wingetAvailable, appsInstalled, appsInstall, appsUpgradeAll,
};
