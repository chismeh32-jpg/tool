// Prueba REAL del desinstalador completo y de los perfiles (GitHub Actions, Windows).
// Se fabrica un programa falso con restos y con TRAMPAS que nunca deben proponerse.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const backend = require("../src/backend/windows");
const { runPowerShell, runProcess } = require("../src/backend/powershell");
const profiles = require("../src/backend/profiles");

const log = (t) => console.log("   " + t);
const UN = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
const PF = process.env.ProgramFiles, AD = process.env.APPDATA, LAD = process.env.LOCALAPPDATA;
const regExists = async (k) => (await runProcess("reg.exe", ["query", k])).code === 0;

(async () => {
  console.log("1) Preparar un programa falso con restos y trampas");
  const appDir = path.join(PF, "ToolBoxTestApp");
  const files = {
    [path.join(appDir, "bin", "app.txt")]: "x",
    [path.join(appDir, "datos.txt")]: "resto en la carpeta de instalación",
    [path.join(AD, "ToolBoxTestApp", "ajustes.json")]: "{}",
    [path.join(LAD, "TestVendorZ", "ToolBoxTestApp", "cache.bin")]: "y".repeat(50000),
    [path.join(LAD, "TestVendorZ", "OtherApp", "conservar.txt")]: "TRAMPA: es de otro programa",
    [path.join(AD, "ToolBoxTestAppHelper", "conservar.txt")]: "TRAMPA: nombre parecido pero distinto",
  };
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, c); }
  const uninstallCmd = `cmd.exe /c rmdir /s /q "${path.join(appDir, "bin")}" & reg delete "${UN}\\ToolBoxTestApp" /f`;
  await runPowerShell(String.raw`
    $u = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
    New-Item -Path "$u\ToolBoxTestApp" -Force | Out-Null
    Set-ItemProperty "$u\ToolBoxTestApp" DisplayName 'ToolBoxTestApp 2.1 (x64)'
    Set-ItemProperty "$u\ToolBoxTestApp" Publisher 'TestVendorZ Software'
    Set-ItemProperty "$u\ToolBoxTestApp" DisplayVersion '2.1'
    Set-ItemProperty "$u\ToolBoxTestApp" InstallLocation '${appDir}'
    Set-ItemProperty "$u\ToolBoxTestApp" UninstallString '${uninstallCmd.replace(/'/g, "''")}'
    New-Item -Path "$u\OtherApp" -Force | Out-Null
    Set-ItemProperty "$u\OtherApp" DisplayName 'OtherApp'
    Set-ItemProperty "$u\OtherApp" Publisher 'TestVendorZ Software'
    Set-ItemProperty "$u\OtherApp" InstallLocation '${path.join(LAD, "TestVendorZ", "OtherApp")}'
    Set-ItemProperty "$u\OtherApp" UninstallString 'cmd.exe /c exit 0'
    New-Item -Path 'HKCU:\Software\ToolBoxTestApp' -Force | Out-Null; Set-ItemProperty 'HKCU:\Software\ToolBoxTestApp' Tema 'oscuro'
    New-Item -Path 'HKCU:\Software\TestVendorZ\ToolBoxTestApp' -Force | Out-Null
    New-Item -Path 'HKCU:\Software\TestVendorZ\OtherApp' -Force | Out-Null; Set-ItemProperty 'HKCU:\Software\TestVendorZ\OtherApp' Conservar 1`);

  console.log("2) Lista de programas");
  const list = await backend.programsList();
  console.log(`   ${list.length} programas; ejemplos: ${list.slice(0, 5).map((p) => p.name).join(", ")}`);
  const entry = list.find((p) => p.name.startsWith("ToolBoxTestApp"));
  assert.ok(entry, "el programa falso debe aparecer en la lista");

  console.log("3) Desinstalar con su desinstalador oficial");
  const r = await backend.programUninstall(entry, log, { waitMs: 60000 });
  console.log("  ", r);
  assert.ok(r.uninstalled, "debe detectar que se desinstaló");

  console.log("4) Buscar restos");
  const others = list.filter((p) => p.key !== entry.key);
  const left = await backend.leftoversScan(entry, others);
  left.forEach((l) => console.log(`   · ${l.kind} ${l.path} (${l.reason})`));
  const paths = left.map((l) => l.path.toLowerCase());
  const has = (p) => paths.includes(p.toLowerCase());
  assert.ok(has(appDir), "debe proponer la carpeta de instalación");
  assert.ok(has(path.join(AD, "ToolBoxTestApp")), "debe proponer AppData\\Roaming\\ToolBoxTestApp");
  assert.ok(has(path.join(LAD, "TestVendorZ", "ToolBoxTestApp")), "debe proponer la subcarpeta dentro del fabricante");
  assert.ok(has("HKCU\\Software\\ToolBoxTestApp"), "debe proponer HKCU\\Software\\ToolBoxTestApp");
  assert.ok(has("HKCU\\Software\\TestVendorZ\\ToolBoxTestApp"), "debe proponer la clave dentro del fabricante");
  for (const trap of [path.join(AD, "ToolBoxTestAppHelper"), path.join(LAD, "TestVendorZ"), path.join(LAD, "TestVendorZ", "OtherApp"),
    "HKCU\\Software\\TestVendorZ", "HKCU\\Software\\TestVendorZ\\OtherApp"]) {
    assert.ok(!has(trap), `NUNCA debe proponer ${trap}`);
  }

  console.log("5) Borrar los restos (Papelera + copia del registro)");
  const backupDir = path.join(os.tmpdir(), "toolbox-backups-test");
  const res = await backend.leftoversClean(left, backupDir, log);
  const failed = res.filter((x) => !x.ok);
  assert.deepStrictEqual(failed.map((f) => `${f.path}: ${f.message}`), [], "todos los restos deben borrarse");
  assert.ok(!fs.existsSync(appDir) && !fs.existsSync(path.join(AD, "ToolBoxTestApp")) && !fs.existsSync(path.join(LAD, "TestVendorZ", "ToolBoxTestApp")));
  assert.ok(!(await regExists("HKCU\\Software\\ToolBoxTestApp")) && !(await regExists("HKCU\\Software\\TestVendorZ\\ToolBoxTestApp")));
  assert.ok(fs.readdirSync(backupDir).filter((f) => f.endsWith(".reg")).length >= 2, "debe haber copias .reg");
  // Las trampas siguen intactas
  assert.ok(fs.existsSync(path.join(LAD, "TestVendorZ", "OtherApp", "conservar.txt")), "OtherApp debe seguir");
  assert.ok(fs.existsSync(path.join(AD, "ToolBoxTestAppHelper", "conservar.txt")), "la carpeta de nombre parecido debe seguir");
  assert.ok(await regExists("HKCU\\Software\\TestVendorZ\\OtherApp"), "la clave de OtherApp debe seguir");
  console.log("   ✔ Restos borrados y trampas intactas.");

  console.log("5b) Desinstalador en una ruta CON ESPACIOS (como casi todos en «Program Files»)");
  // El desinstalador es una copia de cmd.exe que apunta la línea de órdenes exacta que recibe.
  const spacedDir = path.join(PF, "ToolBox Spaced Test");
  const spacedExe = path.join(spacedDir, "uninstall.exe");
  const cmdlineFile = path.join(process.env.SystemRoot, "Temp", "toolbox-cmdline-test.txt");
  fs.mkdirSync(spacedDir, { recursive: true });
  fs.copyFileSync(path.join(process.env.SystemRoot, "System32", "cmd.exe"), spacedExe);
  fs.rmSync(cmdlineFile, { force: true });
  const spacedCmd = `"${spacedExe}" /v:on /d /c echo !CMDCMDLINE!> "${cmdlineFile}" & reg delete "${UN}\\ToolBoxSpacedTest" /f`;
  await runPowerShell(String.raw`
    $u = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ToolBoxSpacedTest'
    New-Item -Path $u -Force | Out-Null
    Set-ItemProperty $u DisplayName 'ToolBox Spaced Test'
    Set-ItemProperty $u UninstallString '${spacedCmd.replace(/'/g, "''")}'`);
  const spaced = (await backend.programsList()).find((p) => p.name === "ToolBox Spaced Test");
  assert.ok(spaced, "el programa con espacios debe aparecer");
  const rs = await backend.programUninstall(spaced, log, { waitMs: 60000 });
  const seen = fs.existsSync(cmdlineFile) ? fs.readFileSync(cmdlineFile, "utf8").trim() : "(no se ejecutó)";
  console.log("   línea recibida:", seen);
  assert.ok(rs.uninstalled, "el desinstalador con espacios debe ejecutarse y terminar");
  assert.ok(seen.startsWith(`"${spacedExe}"`), "la ruta del desinstalador debe llegar ENTRECOMILLADA");
  fs.rmSync(spacedDir, { recursive: true, force: true });
  fs.rmSync(cmdlineFile, { force: true });

  console.log("6) Perfil «Privacidad» de verdad (ajustes + limpieza)");
  assert.deepStrictEqual(profiles.validateProfiles(), []);
  const plan = await profiles.planProfile(backend, "privacy");
  console.log("  ", JSON.stringify(plan));
  const sel = { tweaks: plan.tweaks.filter((t) => !t.already).map((t) => t.id), bloat: plan.bloat.filter((b) => b.present).map((b) => b.id), cleanup: plan.cleanup.map((c) => c.id) };
  const out = await profiles.applyProfile(backend, sel, log, (ph) => console.log(`   fase ${ph.phase} ${ph.done}/${ph.total}`));
  assert.ok(out.tweaks.every((t) => t.ok), "todos los ajustes del perfil deben aplicarse");
  const st = await backend.tweaksStatus();
  for (const id of sel.tweaks) assert.strictEqual(st[id], true, `${id} debe quedar activado`);
  for (const id of sel.tweaks) await backend.tweakSet(id, false, () => {}); // dejar el sistema como estaba
  console.log("   ✔ Perfil aplicado y verificado.");

  await runProcess("reg.exe", ["delete", `${UN}\\OtherApp`, "/f"]);
  console.log("\n✔ Desinstalador completo y perfiles probados en Windows real.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
