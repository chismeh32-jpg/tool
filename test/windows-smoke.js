// Prueba real en Windows (se ejecuta en GitHub Actions con windows-latest).
// Comprueba que los scripts de PowerShell funcionan de verdad sin necesidad de abrir la interfaz.
const assert = require("assert");
const backend = require("../src/backend/windows");
const CLEANUP = require("../src/data/cleanup");
const TWEAKS = require("../src/data/tweaks");

const log = (t) => console.log("   " + t);

(async () => {
  console.log("1) Información del sistema");
  const info = await backend.systemInfo();
  console.log(info);
  assert.ok(info.diskTotal > 0 && info.diskFree > 0, "debe leer el disco");
  assert.ok(info.os, "debe leer el nombre de Windows");

  console.log("2) Análisis de limpieza (no borra nada)");
  const sizes = await backend.cleanupScan(CLEANUP.map((c) => c.id));
  console.log(sizes);
  for (const c of CLEANUP) {
    assert.ok(c.id in sizes, `falta el tamaño de ${c.id}`);
    if (c.scanScript !== null) assert.ok(typeof sizes[c.id] === "number", `${c.id} debe devolver un número`);
  }

  console.log("3) Limpieza real de temporales de usuario");
  const fs = require("fs"), os = require("os"), path = require("path");
  const marker = path.join(os.tmpdir(), "toolbox-smoke-dir");
  fs.mkdirSync(marker, { recursive: true });
  fs.writeFileSync(path.join(marker, "basura.txt"), "x".repeat(1024 * 1024));
  const [res] = await backend.cleanupRun(["temp-user"], log);
  console.log(res);
  assert.ok(res.ok, "la limpieza debe terminar bien");
  assert.ok(!fs.existsSync(marker), "la carpeta de prueba debe haberse borrado");

  console.log("4) Estado de los ajustes");
  const status = await backend.tweaksStatus();
  console.log(status);
  for (const t of TWEAKS) assert.ok(t.id in status, `falta el estado de ${t.id}`);

  console.log("5) Aplicar y deshacer cada ajuste");
  for (const t of TWEAKS) {
    const was = status[t.id];
    assert.ok((await backend.tweakSet(t.id, true, log)).ok, `aplicar ${t.id}`);
    assert.strictEqual((await backend.tweaksStatus())[t.id], true, `${t.id} debe verse activado`);
    assert.ok((await backend.tweakSet(t.id, false, log)).ok, `deshacer ${t.id}`);
    assert.strictEqual((await backend.tweaksStatus())[t.id], false, `${t.id} debe verse desactivado`);
    if (was) await backend.tweakSet(t.id, true, log); // dejarlo como estaba
  }

  console.log("6) winget");
  console.log("   disponible:", await backend.wingetAvailable());

  console.log("\n✔ Todas las pruebas de Windows han pasado.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
