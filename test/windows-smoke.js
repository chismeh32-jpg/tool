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
  const t0 = Date.now();
  const sizes = await backend.cleanupScan(CLEANUP.map((c) => c.id));
  console.log(sizes, `→ ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const c of CLEANUP) {
    assert.ok(c.id in sizes, `falta el tamaño de ${c.id}`);
    if (c.scanScript !== null) assert.ok(typeof sizes[c.id] === "number" && sizes[c.id] >= 0, `${c.id} debe medirse a tiempo`);
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

  console.log("6) winget: códigos de salida y lectura de tablas");
  const o = backend.wingetOutcome;
  assert.strictEqual(o(0).status, "done");
  assert.strictEqual(o(3010).status, "reboot");
  assert.strictEqual(o(-1978334967).status, "reboot");
  assert.strictEqual(o(-1978335135).status, "already");
  assert.strictEqual(o(-1978335107).status, "userScope");
  assert.strictEqual(o(1).status, "error");
  const ids = backend.parseWingetTableIds(["Name   Id            Version", "-------------------------", "Foo    Foo.Bar       1.0", "Baz    Recortado…    2.0"]);
  assert.ok(ids.has("foo.bar") && ids.size === 1, "debe leer la columna Id e ignorar los recortados");

  console.log("7) winget disponible y catálogo válido");
  assert.ok(await backend.wingetAvailable(), "winget debe estar disponible");
  const { runProcess } = require("../src/backend/powershell");
  const APPS = require("../src/data/apps");
  const missing = [];
  for (const app of APPS) {
    const { code } = await runProcess("winget", ["show", "--id", app.id, "--exact", "--source", "winget",
      "--accept-source-agreements", "--disable-interactivity"]);
    console.log(`   ${code === 0 ? "✔" : "✖"} ${app.id}`);
    if (code !== 0) missing.push(app.id);
  }
  assert.deepStrictEqual(missing, [], "todos los ids del catálogo deben existir en winget");

  console.log("8) Detección de apps instaladas");
  const inst = await backend.appsInstalled();
  console.log("   instaladas según winget:", Object.keys(inst).filter((k) => inst[k]).join(", ") || "(ninguna del catálogo)");
  assert.strictEqual(Object.keys(inst).length, APPS.length);

  console.log("9) Estado de Restaurar sistema (solo lectura)");
  console.log("  ", await backend.restoreStatus());

  console.log("\n✔ Todas las pruebas de Windows han pasado.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
