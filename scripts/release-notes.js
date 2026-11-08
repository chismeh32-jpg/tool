// Genera las notas de una versión a partir de la sección «## Novedades» del README.
// Uso: node scripts/release-notes.js v0.7.0  > notas.md
const fs = require("fs");
const path = require("path");

const tag = process.argv[2] || "";
const version = tag.replace(/^v/, "");
const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
const lines = readme.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`**${version} `) || l.startsWith(`**${version}**`));
let body = "";
if (start >= 0) {
  let end = lines.findIndex((l, i) => i > start && (/^\*\*\d+\.\d+\.\d+/.test(l) || /^## /.test(l)));
  if (end < 0) end = lines.length;
  body = lines.slice(start, end).join("\n").trim();
}
process.stdout.write(`${body || `ToolBox ${version}`}

---

### Descargar
- **ToolBox-Setup-${version}.exe** → instalador (recomendado). Se instala en «Archivos de programa».
- **ToolBox-Portable-${version}.exe** → se ejecuta sin instalar.
- **SHA256SUMS.txt** → sumas de verificación para comprobar que la descarga no se ha alterado.

> Windows SmartScreen puede avisar de que la app «no es conocida» porque todavía no está firmada digitalmente:
> pulsa **Más información → Ejecutar de todas formas**. ToolBox pedirá permisos de administrador al abrirse.
`);
