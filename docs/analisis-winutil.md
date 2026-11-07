# Informe: análisis completo de WinUtil (Chris Titus Tech)

> Repositorio estudiado: <https://github.com/ChrisTitusTech/winutil> · commit `2ef5e5d` (3 nov 2026) · licencia MIT
> Objetivo: entender **qué hace, cómo lo hace y qué podemos aprender** para mejorar **ToolBox**.

---

## 1. Resumen en 30 segundos

- **WinUtil** es un único script de PowerShell (~20.000 líneas de código fuente) con una interfaz gráfica de Windows (WPF). Se lanza con `irm christitus.com/win | iex`.
- Hace **seis cosas**: instalar programas (239), aplicar ajustes (69), quitar bloatware (34 apps), activar funciones de Windows y reparaciones, controlar Windows Update y **crear una ISO de Windows 11 personalizada**.
- **Su punto fuerte es la ingeniería**: casi todo son listas en JSON con el valor original para deshacer, maneja bien los errores de winget, tiene un sistema de tareas en segundo plano robusto y 64 archivos de pruebas.
- **Su punto débil es la experiencia de usuario**: todo en inglés, textos técnicos y cortos, ajustes delicados (desactivar BitLocker, borrar Edge) mezclados con otros inofensivos, y se ejecuta descargando código de Internet sin firma.
- **Para ToolBox**: hemos encontrado **6 fallos o carencias reales** en nuestra instalación de apps (la más importante: los códigos de error de winget que tratamos mal) y una lista clara de funciones que merece la pena añadir.

---

## 2. Cómo está construido

| Pieza | Qué es | Tamaño |
|---|---|---|
| `functions/public` | Lo que hace cada botón | 35 archivos · ~3.000 líneas |
| `functions/private` | Toda la lógica interna | 89 archivos · ~9.700 líneas |
| `config/*.json` | Catálogos: apps, ajustes, bloatware, funciones, DNS, perfiles, temas | 8 archivos · ~5.100 líneas |
| `xaml/inputXML.xaml` | La ventana (WPF) | ~2.500 líneas |
| `pester/` | Pruebas automáticas | 64 archivos · ~16.000 líneas |
| `docs/` | Web de documentación (Astro) con un «Config Builder» y un «Tweak Explorer» | — |
| `Compile.ps1` | Junta todo en un solo `winutil.ps1` | — |

**Cómo arranca:**
1. `irm christitus.com/win | iex` descarga `winutil.ps1` de la última versión publicada en GitHub y lo ejecuta en memoria.
2. Si no es administrador, se **relanza elevado** (pide UAC) pasando los parámetros codificados en base64 para evitar inyecciones.
3. Abre la ventana en un hilo propio y manda el trabajo pesado a un **«pool» de hilos en segundo plano** para que la interfaz no se congele.
4. También puede ir **sin ventana** (`-Preset Standard` o `-Config archivo.json`), útil para automatizar la puesta a punto de muchos PCs.

**Cómo publican versiones:** GitHub Actions compila el script, pasa las pruebas (Pester) y el analizador de código (PSScriptAnalyzer), y publica `winutil.ps1` en *Releases*. **No firman el script.**

---

## 3. Todo lo que hace

### 3.1 Instalar programas
- **239 apps** en 10 categorías (Utilidades 53, Desarrollo 43, Pro 24, Multimedia 21, Microsoft 19, Comunicación 18, Documentos 17, Juegos 17, Navegadores 15, Autoalojadas 12). 148 son de código abierto y llevan una insignia «FOSS».
- Cada app tiene ID de **winget** y, casi siempre, de **Chocolatey** (el usuario elige cuál usar; si falta el de Choco, usa winget).
- Instalar, **desinstalar**, **actualizar todo** y **«detectar instaladas»** (marca las casillas de lo que ya tienes).
- Iconos de cada app incluidos dentro del script (no los descarga).

### 3.2 Ajustes («Tweaks») — 69 entradas
| Grupo | Cuántos | Ejemplos |
|---|---|---|
| **Essential** | 18 | Telemetría, historial de actividad, ubicación, servicios a manual, hibernación, widgets, punto de restauración, borrar temporales, limpieza de disco + DISM `/ResetBase`, **desactivar BitLocker** |
| **Advanced – CAUTION** | 24 | Quitar Edge, quitar OneDrive, quitar IA/Copilot/Recall, desactivar IPv6/Teredo, efectos visuales al mínimo, indexado de búsqueda, notificaciones, almacenamiento reservado, bloquear software de Razer/Logitech, lista de bloqueo de Adobe, DNS |
| **Preferencias (interruptores)** | 24 | Modo oscuro, extensiones, ocultos, aceleración del ratón, teclas especiales, Bing en Inicio, barra de tareas centrada, Num Lock al arrancar, modo juego, rutas largas, pantalla de bloqueo… |
| **Planes de energía** | 2 | Activar/quitar «Máximo rendimiento» |

**Perfiles listos:** *Minimal* (4 ajustes), *Standard* (12) y *Advanced* (17), más uno para bloatware.

### 3.3 Bloatware (AppX) — 34 apps de Microsoft
Teams, Clipchamp, Copilot, Noticias, Tiempo, Xbox, Phone Link, Solitario, Outlook nuevo, etc. Las quita **para todos los usuarios** y también de la «plantilla» de Windows (*provisioned*), para que no vuelvan al crear otro usuario. **También puede reinstalarlas** desde la Microsoft Store.

### 3.4 Funciones y reparaciones
- **Funciones de Windows:** .NET 3.5, Hyper-V, WSL, Sandbox, NFS, componentes antiguos (Media Player/DirectPlay), copia diaria del registro y menú F8 clásico.
- **Reparaciones:**
  - **Reparar sistema:** `chkdsk /scan` → `sfc /scannow` → `DISM /RestoreHealth`, interpretando bien los códigos de salida.
  - **Reiniciar Windows Update:** para servicios, renombra la carpeta de descargas, vuelve a registrar 36 DLL, borra políticas, reinicia winsock y fuerza la búsqueda. Tiene un modo «agresivo» que además resetea permisos.
  - **Reiniciar la red** (`netsh winsock/ip reset`), **cambiar el servidor de hora** (NTP) y **reinstalar winget**.
- **Atajos a paneles clásicos:** Panel de control, Programas y características, Sonido, Red, Energía, Restaurar sistema…
- **Extras:** servidor SSH, perfil de PowerShell de Chris Titus, Autologon, O&O ShutUp10.

### 3.5 Windows Update
Tres perfiles: **Por defecto** (deshace todo), **Recomendado** (retrasa las actualizaciones grandes 365 días y las de seguridad 4, sin drivers por Windows Update) y **Desactivar** (con aviso fuerte).

### 3.6 DNS
8 proveedores (Google, Cloudflare con y sin filtros, Quad9, OpenDNS y AdGuard), con **DNS cifrado (DoH)** cuando Windows lo soporta y un modo **«el más rápido»** que mide la latencia y elige solo entre proveedores sin filtros.

### 3.7 Creador de ISO de Windows 11 (~1.900 líneas)
Toma una ISO oficial y genera otra que se instala sola: crea una cuenta local, se salta los requisitos de **TPM, Secure Boot, CPU y RAM**, quita bloatware, aplica ajustes de privacidad y puede **meter los drivers de tu PC actual**. También puede escribirla en un USB (formatea el disco, con confirmación).

### 3.8 Otros
- **Exportar/importar** tu selección a un JSON. Al exportar, copia al portapapeles el comando que lo aplica en otro PC.
- **Informe del entorno** (JSON con datos permitidos y los logs) para pedir ayuda.
- Tema claro/oscuro, escalado de fuente, buscador y cola de tareas.

---

## 4. Cómo lo hace por dentro (lo interesante)

### 4.1 Motor de ajustes declarativo
Cada ajuste del JSON puede tener cuatro tipos de cambio:
```
registry: [{ Path, Name, Type, Value, OriginalValue }]   ← OriginalValue = "<RemoveEntry>" para borrar
service:  [{ Name, StartupType, OriginalType }]
InvokeScript / UndoScript: [ "código PowerShell" ]
appx:     [ "paquetes a quitar" ]
```
- **Aplicar:** pone `Value`, `StartupType` y ejecuta `InvokeScript`. **Deshacer:** pone `OriginalValue`, `OriginalType` y ejecuta `UndoScript`. Es la misma idea que ToolBox.
- **Detalle fino:** antes de cambiar un servicio, comprueba que sigue en el valor esperado. Si el usuario u otro programa lo cambió, **lo deja en paz y avisa**.
- **Detección de «ya aplicado»:** lee el registro y el estado de los servicios. Si un valor no existe, usa `DefaultState` para saber qué significa.
- 5 ajustes **no se pueden deshacer** (quitar widgets, IA, limpieza de disco, temporales y punto de restauración).

### 4.2 Instalación con winget: lo más útil para nosotros
`Install-WinUtilProgramWinget.ps1` recoge años de errores reales:

| Código de winget | Qué significa | Cómo lo trata WinUtil |
|---|---|---|
| `0` | Instalado | ✔ |
| `3010`, `1641`, `0x8A150109`, `0x8A15010B` | Instalado, **falta reiniciar** | ✔ con aviso (no es un error) |
| `0x8A150061` | Ya estaba instalado | Saltado |
| `0x8A15002B` | No hay actualización | Saltado |
| `0x8A15007D` | **App instalada «solo para tu usuario»: winget como administrador no puede tocarla** | Saltado con explicación |
| Otro | Error | Fallo con el código en hexadecimal y un enlace a la documentación |

Además: siempre usa `--source winget`, para que no salte la Microsoft Store pidiendo aceptar condiciones. En «actualizar todo» añade `--include-unknown`. Y PowerShell 7 lo actualiza aparte, verificando el hash y la firma.

### 4.3 «Detectar instaladas»
Ejecuta `winget list` y busca cada ID **en la columna de ID** (calcula dónde empieza la columna a partir de la cabecera), para evitar falsos positivos con nombres parecidos y filas con emojis.

### 4.4 Quitar bloatware de verdad
1. `Remove-AppxPackage -AllUsers` paquete a paquete. El «pipeline» falla en silencio en PowerShell 7, por eso no lo usan.
2. `Remove-AppxProvisionedPackage` **en Windows PowerShell 5.1**, porque en la versión 7 se cuelga o da «Class not registered».
3. Casos especiales: cierra Game Bar antes de quitar Xbox Overlay y quita el complemento de Teams para Office.

### 4.5 Sistema de tareas
Una tarea a la vez, con **cola**, barra de progreso, progreso en el icono de la barra de tareas, **pausa o cancelación** y un **log por sesión** en `%LocalAppData%\winutil\logs`. Si cierras la ventana a mitad de una tarea, te pregunta si terminarla en segundo plano o pararla.

---

## 5. Lo que WinUtil hace bien (ideas para copiar)

1. **Tratar bien los códigos de winget** (ver 4.2). Es lo más valioso de todo el repositorio para nosotros.
2. **Detectar el estado real** de lo instalado y de lo aplicado.
3. **No pisar cambios del usuario** (servicios).
4. **Reparaciones con un clic** (SFC/DISM/chkdsk, Windows Update y red): muy útiles para gente no técnica, si se explican bien.
5. **Perfiles** (Mínimo, Estándar, Avanzado) y **exportar/importar** la configuración.
6. **DNS «el más rápido»** con DoH.
7. **Quitar bloatware también de la plantilla** y permitir reinstalarlo.
8. **Log a archivo** e **informe para soporte**.
9. **Pruebas automáticas** de cada pieza.

## 6. Puntos débiles y riesgos de WinUtil

| Problema | Por qué importa |
|---|---|
| **Solo en inglés y con textos técnicos** («Teredo», «WPBT», «S0 Sleep»…) | El usuario medio no sabe qué está tocando. Es justo el hueco que cubre ToolBox. |
| **Ajustes delicados en «Essential»** | «Desactivar BitLocker» y «Desactivar hibernación» están en el grupo «esencial», junto a cosas inofensivas. En un portátil, quitar el cifrado o la hibernación no es «esencial». |
| **Limpieza de disco con `/ResetBase`** en el perfil *Standard* | Hace permanentes todas las actualizaciones instaladas sin decírselo claramente al usuario. ToolBox usa la versión sin `/ResetBase` y lo explica. |
| **Se ejecuta descargando código sin firmar** (`irm … \| iex`) | Confías en el dominio y en GitHub. Ellos mismos avisan de que circulan copias falsas. |
| **Un ajuste descarga código de terceros en el momento** (la lista de bloqueo de Adobe sale de otro repositorio de GitHub y se pega en el archivo `hosts`) | Si ese repositorio cambia, cambia lo que se aplica. |
| **Algunos «deshacer» no devuelven el estado exacto** | Por ejemplo, el de «detección automática de carpetas» borra todas las vistas guardadas del Explorador, y el de quitar OneDrive o Edge lo reinstala desde winget. |
| **El creador de ISO desactiva Windows Update durante la instalación** | En el primer inicio de sesión vuelve a activar servicios y políticas, pero **antes borra las tareas programadas de Windows Update**, y esas no se restauran explícitamente. Es un punto a vigilar (no lo he podido probar). |
| **Elevado siempre, incluso para instalar apps** | Por eso existe el código `0x8A15007D`: las apps instaladas «para tu usuario» (Spotify, Discord…) no se pueden actualizar ni desinstalar desde WinUtil. |

---

## 7. ToolBox frente a WinUtil

| | WinUtil | ToolBox (v0.1) |
|---|---|---|
| Tipo | Script de PowerShell + ventana WPF | App de escritorio (Electron) con instalador |
| Idioma y tono | Inglés, técnico | **Español, explicado para todos** |
| Antes de actuar | Casillas y un botón «Run» | **Explica qué hace y qué notarás**, y pide confirmación |
| Limpieza | Temporales + `cleanmgr` + DISM `/ResetBase` | **Analiza primero** (8 tipos, tamaños), limpia sin seguir enlaces, DISM sin `/ResetBase` |
| Apps | 239, winget + Choco, desinstalar, detectar | 40, winget, actualizar todo, detectar (básico) |
| Ajustes | 69 (24 interruptores) | 12 interruptores, todos reversibles |
| Bloatware | ✔ 34 apps | ✘ |
| Reparaciones | ✔ SFC/DISM/chkdsk, Windows Update, red, winget | ✘ |
| Windows Update / DNS / energía | ✔ | ✘ |
| Perfiles / exportar | ✔ | ✘ |
| Punto de restauración | ✔ (como ajuste) | ✔ (se ofrece antes de lo arriesgado) |
| Log a archivo | ✔ | ✘ (solo en pantalla) |
| Pruebas en Windows real | Pester | Prueba en GitHub Actions (Windows real) |

**Conclusión:** WinUtil tiene **más funciones**. ToolBox es **más claro y más seguro para alguien que no sabe de informática**. La estrategia es incorporar sus funciones más útiles **sin perder esa claridad**.

---

## 8. Fallos y mejoras concretas para ToolBox (detectados al comparar)

Ordenados por importancia:

1. 🔴 **Códigos de winget mal interpretados.** En `src/backend/windows.js` solo distinguimos «0 = bien» y «ya instalado».
   - **Instalaciones que piden reiniciar** (`3010`, `1641`, `0x8A150109`, `0x8A15010B`) se muestran como **error** aunque hayan funcionado.
   - **Apps instaladas «para tu usuario»** (`0x8A15007D`) salen como error sin explicación.
   - → Copiar su tabla de códigos y mostrar mensajes claros.
2. 🔴 **Falta `--source winget`** al instalar. Sin eso, winget puede consultar la Microsoft Store y fallar o pedir condiciones.
3. 🟠 **«Actualizar todo» sin `--include-unknown`**: se salta apps cuya versión winget no reconoce.
4. 🟠 **Detección de «Instalada» poco fiable.** Buscamos el ID como texto suelto en `winget list`, así que los IDs largos que winget recorta con «…» no se detectan. → Usar su método por columna.
5. 🟠 **Spotify, y en general las apps que solo se instalan «por usuario»,** fallan cuando el instalador corre como administrador. ToolBox siempre corre elevado. WinUtil, de hecho, no incluye Spotify. → Instalarlas **sin elevación** o avisar.
6. 🟡 **IDs sin verificar:** de nuestras 40 apps, 36 coinciden con su catálogo. `Opera.OperaGX`, `Spotify.Spotify`, `Python.Python.3.12` (ellos ya usan 3.14) y `Oracle.JavaRuntimeEnvironment` no están en su lista y conviene comprobarlos.
7. 🟡 **Punto de restauración:** llamamos siempre a `Enable-ComputerRestore`, que **activa Restaurar sistema** si el usuario lo tenía apagado (y eso ocupa disco). → Avisar antes, como hacen ellos al comprobar primero si ya hay puntos.
8. 🟡 **Log a archivo** para poder pedir ayuda (ahora solo se ve en pantalla).
9. 🟡 **Análisis de limpieza lento** (casi 2 minutos en el Windows de GitHub). → Medir cada carpeta por separado y en paralelo, con un límite de tiempo.

Lo que **ya hacemos mejor** y conviene mantener:
- Limpieza que no entra en enlaces (*junctions*).
- DISM sin `/ResetBase`, explicado.
- «Teclas especiales» guardadas como texto (`REG_SZ`), que es el tipo que usa Windows (ellos usan `DWord`).
- La interfaz solo puede pedir acciones por identificador, nunca ejecutar comandos libres.

---

## 9. Hoja de ruta propuesta

**v0.2 – Fiabilidad (sin funciones nuevas)**
- Arreglar los puntos 1 a 5 y 7 a 9 de arriba.

**v0.3 – Reparar Windows** (lo más útil para gente no técnica)
- «Mi PC va raro» → reparar sistema (chkdsk + SFC + DISM), con explicación y tiempo estimado.
- «Windows Update no funciona» → reinicio de Windows Update (versión normal, no la agresiva).
- «No tengo Internet» → reinicio de red.
- «Las apps no se instalan» → reparar winget.

**v0.4 – Quitar bloatware**
- Las 34 apps de su lista, agrupadas («Publicidad de Microsoft», «Xbox», «Herramientas que quizá uses»…) y con botón de **reinstalar**.

**v0.5 – Más control**
- DNS (con «el más rápido» y DoH), perfiles de Windows Update («Recomendado», sin opción de desactivarlo del todo), plan de energía.
- Ajustes nuevos seguros: historial de actividad, ubicación, *ConsumerFeatures*, WPBT, apps de dispositivos, Num Lock, modo juego, porcentaje de batería y rutas largas.
- **Perfiles** («Recomendado», «Gamer», «Privacidad») y exportar/importar.

**No copiaríamos:** desactivar BitLocker, desactivar Windows Update, quitar Edge u OneDrive, la lista de Adobe descargada en el momento, IPv6 ni el creador de ISO con *bypass* de TPM. O, como mucho, solo en una sección «Experto» con avisos muy claros.

---

## Anexo: ajustes de WinUtil candidatos para ToolBox

| Ajuste | Riesgo | ¿Para ToolBox? |
|---|---|---|
| Historial de actividad (no publicar/subir) | Bajo | ✔ |
| Ubicación desactivada | Medio (algunas apps la usan) | ✔ con aviso |
| ConsumerFeatures (apps promocionadas) | Bajo | ✔ (complementa «Quitar anuncios») |
| WPBT (programas del fabricante al arrancar) | Bajo-medio | ✔ en «Avanzado» |
| Apps de dispositivos (anuncios al conectar un monitor) | Bajo | ✔ |
| Servicios a manual (DiagTrack, MapsBroker…) | Medio | ⚠ Solo DiagTrack |
| Hibernación | Medio (portátiles) | ⚠ Solo en PCs de sobremesa |
| Widgets fuera | Bajo, pero sin deshacer | ⚠ Con opción de reinstalar |
| Efectos visuales al mínimo | Bajo | ✔ («Modo rendimiento») |
| Apps en segundo plano | Bajo | ✔ |
| Storage Sense | — | ✘ (ToolBox lo complementa) |
| Desactivar BitLocker | **Alto** | ✘ |
| Quitar Edge / OneDrive | Alto | ✘ |
| Desactivar IPv6 / Teredo | Medio | ✘ |
| Num Lock al arrancar, modo juego, rutas largas, porcentaje de batería | Bajo | ✔ |
