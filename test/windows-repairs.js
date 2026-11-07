// Prueba REAL de las reparaciones en Windows (GitHub Actions, windows-latest).
// Se omiten las de red («release/renew» cortaría la conexión del propio servidor de pruebas).
const assert = require("assert");
const backend = require("../src/backend/windows");
const REPAIRS = require("../src/data/repairs");

const SKIP = new Set(["network-quick", "network-full"]);
const log = (t) => console.log("   " + t);

(async () => {
  console.log("Catálogo de reparaciones");
  for (const r of REPAIRS) {
    assert.ok(r.id && r.problem && r.name && r.summary && r.after && r.duration, `faltan textos en ${r.id}`);
    assert.ok(r.steps.length > 0 && r.steps.every((s) => s.label && (s.ps || s.exe)), `pasos mal definidos en ${r.id}`);
  }

  const order = ["printer", "time-sync", "winget-repair", "windows-update", "system-files"];
  const failures = [];
  for (const id of order) {
    if (SKIP.has(id)) continue;
    console.log(`\n=== ${id}`);
    const t0 = Date.now();
    const seen = new Set();
    const res = await backend.runRepair(id, log, (p) => {
      if (p.percent != null && p.percent % 25 < 1 && !seen.has(`${p.step}-${Math.floor(p.percent)}`)) {
        seen.add(`${p.step}-${Math.floor(p.percent)}`);
        console.log(`   … paso ${p.step}/${p.total} ${Math.round(p.percent)} %`);
      }
    });
    console.log(`   resultado (${Math.round((Date.now() - t0) / 1000)} s):`, JSON.stringify(res));
    if (!res.ok) failures.push(`${id}: ${res.failed} → ${res.message}`);
  }

  // Después de reiniciar Windows Update, los servicios deben volver a estar en marcha
  const { runPowerShell } = require("../src/backend/powershell");
  const { json } = await runPowerShell("Emit @{ s = (Get-Service wuauserv, bits, Spooler | ForEach-Object { \"$($_.Name)=$($_.Status)\" }) -join ',' }");
  console.log("\nServicios:", json[0].s);
  assert.ok(/Spooler=Running/.test(json[0].s), "la cola de impresión debe quedar arrancada");

  assert.deepStrictEqual(failures, [], "todas las reparaciones probadas deben completarse");
  console.log("\n✔ Reparaciones probadas en Windows real.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
