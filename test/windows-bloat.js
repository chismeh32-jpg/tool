// Prueba REAL de «Quitar apps» en Windows (GitHub Actions).
const assert = require("assert");
const backend = require("../src/backend/windows");
const { runProcess } = require("../src/backend/powershell");
const { GROUPS, APPS } = require("../src/data/bloatware");

const log = (t) => console.log("   " + t);

(async () => {
  console.log("1) Catálogo");
  const groups = new Set(GROUPS.map((g) => g.id));
  for (const a of APPS) assert.ok(a.id && a.name && a.summary && groups.has(a.group), `entrada mal definida: ${a.id}`);
  assert.strictEqual(new Set(APPS.map((a) => a.id)).size, APPS.length, "ids repetidos");

  console.log("2) Qué hay instalado");
  const st = await backend.bloatStatus();
  const present = APPS.filter((a) => st[a.id].installed || st[a.id].provisioned).map((a) => a.id);
  console.log("   presentes en este Windows:", present.join(", ") || "(ninguna)");

  console.log("3) Quitar una que no está instalada → «notInstalled»");
  const absent = APPS.find((a) => !present.includes(a.id));
  if (absent) {
    const [r] = await backend.bloatRemove([absent.id], log);
    assert.strictEqual(r.status, "notInstalled");
  }

  console.log("4) Quitar de verdad una app presente (sin aviso) y comprobar que desaparece");
  const victim = APPS.find((a) => present.includes(a.id) && !a.warn && !a.preRemove);
  if (victim) {
    const [r] = await backend.bloatRemove([victim.id], log);
    console.log("  ", r);
    if (r.status === "removed") {
      const after = await backend.bloatStatus();
      assert.ok(!after[victim.id].installed && !after[victim.id].provisioned, `${victim.id} debería haber desaparecido`);
    } else {
      assert.strictEqual(r.status, "error"); // p. ej. Windows Server no deja quitar alguna
      assert.ok(r.reason, "un error debe explicar el motivo");
    }
  } else console.log("   (este Windows no tiene ninguna app de la lista que se pueda probar)");

  console.log("5) Los ids de Microsoft Store existen (informativo: Windows Server puede no tener la Store)");
  let found = 0, checked = 0;
  for (const a of APPS.filter((x) => x.storeId)) {
    const { code } = await runProcess("winget", ["show", "--id", a.storeId, "--source", "msstore",
      "--accept-source-agreements", "--disable-interactivity"], { timeoutMs: 60000 });
    checked++;
    if (code === 0) found++;
    console.log(`   ${code === 0 ? "✔" : "?"} ${a.storeId} ${a.name}${code === 0 ? "" : ` (0x${code.toString(16)})`}`);
  }
  console.log(`   ${found}/${checked} encontrados en msstore`);

  console.log("\n✔ «Quitar apps» probado en Windows real.");
})().catch((e) => { console.error("\n✖ FALLO:", e); process.exit(1); });
