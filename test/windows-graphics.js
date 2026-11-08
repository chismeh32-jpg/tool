// Prueba REAL de «Gráficos» en Windows (GitHub Actions).
// El servidor no tiene tarjeta NVIDIA ni AMD: se comprueba que los ayudantes nativos COMPILAN,
// ARRANCAN y responden «no disponible» sin fallar, y se prueban de verdad los ajustes de Windows.
const assert = require("assert");
const g = require("../src/backend/graphics");
const { runPowerShell } = require("../src/backend/powershell");
const log = (t) => console.log("   " + t);

(async () => {
  console.log("1) Detección del equipo");
  const d = await g.gpuDetect();
  console.log("  ", JSON.stringify(d));
  assert.ok(d.cpu, "debe leer el procesador");
  assert.ok(Array.isArray(d.gpus) && d.gpus.length >= 1, "debe listar al menos un adaptador");

  console.log("2) Ayudante de NVIDIA (sin tarjeta NVIDIA → «no disponible»)");
  assert.ok(g.helperPath("toolbox-nv.exe"), "toolbox-nv.exe debe estar compilado");
  const nv = await g.nvidiaState();
  console.log("  ", JSON.stringify(nv));
  assert.strictEqual(nv.info.available, false, "sin NVIDIA debe responder available:false");
  assert.ok(!nv.info.missing, "el ayudante debe existir");
  assert.strictEqual(nv.info.stage, "init", "debe fallar al inicializar NVAPI, no después");

  console.log("3) Ayudante de AMD (sin tarjeta AMD → «no disponible»)");
  assert.ok(g.helperPath("toolbox-amd.exe"), "toolbox-amd.exe debe estar compilado");
  const amd = await g.amdState();
  console.log("  ", JSON.stringify(amd));
  assert.strictEqual(amd.available, false, "sin AMD debe responder available:false");
  assert.ok(!amd.missing, "el ayudante debe existir");

  console.log("4) Ajustes de Windows: activar, comprobar y dejar como estaban");
  const before = await g.windowsState();
  console.log("   antes:", JSON.stringify(before));
  // Valor previo de la cadena de DirectX, para comprobar que no se pierden otras opciones
  const read = async () => ((await runPowerShell("$d = TB-Get 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings'; Emit @{ v = $d.value; e = $d.exists }")).json[0]);
  const dxOriginal = await read();
  await runPowerShell("TB-Set 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings' 'String' 'VRROptimizeEnable=0;'");
  for (const key of ["hags", "windowedOpt", "gameMode"]) {
    for (const v of [!before[key], before[key]]) {
      const r = await g.windowsSet(key, v, log);
      assert.ok(r.ok, `${key}=${v} debe aplicarse`);
      assert.strictEqual((await g.windowsState())[key], v, `${key} debe leerse como ${v}`);
    }
  }
  const dx = await read();
  console.log("   cadena DirectX:", dx.v);
  assert.ok(/VRROptimizeEnable=0;/.test(dx.v), "no debe perder las demás opciones de DirectX");
  if (dxOriginal.e) await runPowerShell(`TB-Set 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings' 'String' '${String(dxOriginal.v).replace(/'/g, "''")}'`);
  else await runPowerShell("TB-DelValue 'HKCU' 'Software\\Microsoft\\DirectX\\UserGpuPreferences' 'DirectXUserGlobalSettings'");

  console.log("5) Tareas de telemetría de NVIDIA (solo lectura)");
  const tasks = await g.nvidiaTelemetryTasks();
  console.log("  ", JSON.stringify(tasks));
  assert.ok(Array.isArray(tasks));

  console.log("\n✔ «Gráficos» probado en Windows real.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
