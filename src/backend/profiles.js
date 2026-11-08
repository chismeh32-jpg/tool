// Planificar y aplicar perfiles. Funciona con cualquier backend (real o demo).
const PROFILES = require("../data/profiles");
const TWEAKS = require("../data/tweaks");
const { APPS: BLOAT } = require("../data/bloatware");
const CLEANUP = require("../data/cleanup");

/** Qué cambiaría el perfil en ESTE equipo (lo ya aplicado o ausente se marca para no repetirlo). */
async function planProfile(backend, id) {
  const p = PROFILES.find((x) => x.id === id);
  if (!p) throw new Error("Perfil desconocido");
  const [tweakStatus, bloatStatus, sizes] = await Promise.all([
    backend.tweaksStatus(),
    backend.bloatStatus(),
    backend.cleanupScan(p.cleanup),
  ]);
  return {
    id,
    tweaks: p.tweaks.map((t) => ({ id: t, already: !!tweakStatus[t] })),
    bloat: p.bloat.map((b) => ({ id: b, present: !!(bloatStatus[b] && (bloatStatus[b].installed || bloatStatus[b].provisioned)) })),
    cleanup: p.cleanup.map((c) => ({ id: c, bytes: sizes[c] })),
  };
}

/**
 * Aplica lo elegido: ajustes → quitar apps → limpieza.
 * sel = { tweaks: [ids], bloat: [ids], cleanup: [ids] } (ya validados).
 * onPhase({ phase: "tweaks"|"bloat"|"cleanup", done, total })
 */
async function applyProfile(backend, sel, log, onPhase = () => {}) {
  const out = { tweaks: [], bloat: [], cleanup: [], restartExplorer: false, logout: false };

  if (sel.tweaks.length) {
    log("— Ajustes —");
    let done = 0;
    for (const id of sel.tweaks) {
      onPhase({ phase: "tweaks", done, total: sel.tweaks.length });
      const r = await backend.tweakSet(id, true, log);
      out.tweaks.push({ id, ok: !!r.ok, message: r.message });
      const t = TWEAKS.find((x) => x.id === id);
      if (r.ok && t.restart === "explorer") out.restartExplorer = true;
      if (r.ok && t.restart === "logout") out.logout = true;
      done++;
    }
  }
  if (sel.bloat.length) {
    log("— Quitar apps de Windows —");
    onPhase({ phase: "bloat", done: 0, total: sel.bloat.length });
    let done = 0;
    out.bloat = await backend.bloatRemove(sel.bloat, log, (id, r) => {
      if (r.status !== "running") onPhase({ phase: "bloat", done: ++done, total: sel.bloat.length });
    });
  }
  if (sel.cleanup.length) {
    log("— Limpieza —");
    onPhase({ phase: "cleanup", done: 0, total: sel.cleanup.length });
    let done = 0;
    out.cleanup = await backend.cleanupRun(sel.cleanup, log, (id, r) => {
      if (r.status !== "running") onPhase({ phase: "cleanup", done: ++done, total: sel.cleanup.length });
    });
  }
  if (out.restartExplorer) await backend.restartExplorer(log);
  return out;
}

/** Comprueba que todos los identificadores de los perfiles existen en los catálogos. */
function validateProfiles() {
  const errors = [];
  const known = { tweaks: new Set(TWEAKS.map((x) => x.id)), bloat: new Set(BLOAT.map((x) => x.id)), cleanup: new Set(CLEANUP.map((x) => x.id)) };
  for (const p of PROFILES) for (const kind of ["tweaks", "bloat", "cleanup"]) {
    for (const id of p[kind]) if (!known[kind].has(id)) errors.push(`${p.id}.${kind}: ${id}`);
  }
  return errors;
}

module.exports = { PROFILES, planProfile, applyProfile, validateProfiles };
