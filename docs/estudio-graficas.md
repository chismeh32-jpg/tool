# Estudio: ¿puede ToolBox configurar AMD Adrenalin y el Panel de control de NVIDIA?

> Pregunta: ¿se puede aplicar «la mejor configuración» de la tarjeta gráfica y quitar lo que sobra (notificaciones,
> anuncios, superposiciones) desde ToolBox, de forma segura y reversible?

## Resumen

| | ¿Se puede? | Cómo | Fiabilidad |
|---|---|---|---|
| **Ajustes 3D de NVIDIA** (baja latencia, energía, filtrado, caché de sombreadores…) | ✅ Sí | **NVAPI**: la librería oficial que el propio driver instala (`nvapi64.dll`). Es lo mismo que usa el Panel de control | Alta |
| **Ajustes 3D de AMD** (Anti-Lag, Boost, Chill, Image Sharpening, Enhanced Sync, FreeSync…) | ✅ Sí | **ADLX**: el SDK oficial de AMD, que viene con el driver | Alta |
| **Notificaciones y anuncios de AMD Adrenalin** | ⚠️ Solo guiando | AMD no documenta dónde se guardan; se cambian en *Preferencias → Anuncios / Notificaciones emergentes* | — |
| **Notificaciones, superposición y telemetría de NVIDIA App** | ⚠️ En parte | La superposición y las notificaciones solo desde la propia app; las tareas de telemetría se pueden desactivar, pero vuelven con cada actualización del driver | Media |
| **Ajustes gráficos de Windows** (programación de GPU por hardware, optimizaciones de juegos en ventana, GPU preferida por juego) | ✅ Sí | Registro de Windows | Alta |

**Conclusión:** sí se puede, y por la vía **oficial** de cada fabricante (no tocando archivos internos a ciegas). La parte
de notificaciones y anuncios es la más débil: no hay forma documentada, así que ToolBox debería **explicar dónde
desactivarlas** y abrir la pantalla correcta, en vez de inventarse claves del registro.

---

## 1. NVIDIA

### Cómo se guardan los ajustes
El Panel de control de NVIDIA guarda la configuración en la **base de datos de perfiles del driver (DRS)**. Hay un
perfil **global** y uno por juego. NVIDIA publica la API para leerla y cambiarla: `NvAPI_DRS_CreateSession`,
`LoadSettings`, `GetBaseProfile`, `SetSetting`, `SaveSettings` y `RestoreAllDefaults`.
Los archivos de cabecera están en GitHub (`NVIDIA/nvapi`, licencia MIT) y la implementación la pone el driver.

La prueba de que funciona es **NVIDIA Profile Inspector**, la herramienta que usan los entusiastas desde hace años. Se
basa exactamente en esto y además admite importar perfiles sin ventanas: `nvidiaProfileInspector.exe -silentImport archivo.nip`.

### Qué ajustes ofrecería ToolBox (perfil global)
| Ajuste | «Mejor para jugar» | Ojo |
|---|---|---|
| Modo de baja latencia | Activado (o Ultra si el juego no tiene NVIDIA Reflex) | Si el juego tiene Reflex, manda Reflex |
| Modo de control de energía | Preferir rendimiento máximo | En portátiles gasta más batería → solo sobremesa |
| Calidad del filtrado de texturas | Alto rendimiento | Diferencia visual mínima |
| Tamaño de la caché de sombreadores | 10 GB o ilimitado | Menos tirones al cargar |
| Optimización de subprocesos | Automática | (Valor por defecto, se deja) |
| Sincronización vertical | Controlada por la app | Con G-Sync se configura distinto |

### Dos formas de hacerlo
1. **Usar NVAPI directamente** (recomendada). Un pequeño programa auxiliar en C++ que se compila en GitHub Actions con
   las cabeceras oficiales. Permite leer el estado, guardar los valores anteriores para **deshacer** y aplicar solo
   lo elegido.
2. **Incluir NVIDIA Profile Inspector** (MIT) e importar un `.nip`. Es más rápido de hacer, pero depende de un
   programa externo y deshacer los cambios es peor.

### NVIDIA App: notificaciones, superposición y telemetría
- **Superposición y notificaciones:** se apagan en *NVIDIA App → Configuración → Funciones*. No hay una forma
  documentada de hacerlo desde fuera.
- **Telemetría:** en versiones antiguas eran tareas programadas (`NvTmRep…`, `NvTmMon…`). Se pueden desactivar, pero
  **vuelven con cada actualización** del driver y sus nombres cambian entre versiones.
- **No se debe tocar** el servicio *NVIDIA Display Container* (NvContainer): si se desactiva, deja de abrirse el Panel
  de control y dejan de funcionar la grabación y la superposición.

## 2. AMD

### Cómo se guardan los ajustes
AMD tiene un SDK oficial, **ADLX** (*AMD Device Library eXtra*), que viene con el driver y está publicado en GitHub
(GPUOpen, con bindings oficiales para Python). Su servicio de gráficos 3D (`IADLX3DSettingsServices`) da acceso a:
**Anti-Lag, Boost, Chill, Image Sharpening, Enhanced Sync, Wait for Vertical Refresh, Anti-Aliasing, filtrado
anisotrópico, Frame Rate Target Control y Radeon Super Resolution**, por GPU. Además tiene servicios de pantalla
(FreeSync, escalado) y de *tuning*.

> Licencia: el SDK se rige por el «ADLX SDK License Agreement». Permite distribuir, **solo en forma compilada**, el
> software creado con él para usarlo con hardware de AMD. Es justo lo que hace ToolBox: el código fuente de AMD no
> se incluye en el repositorio; se descarga y se compila en GitHub Actions.

### Qué ajustes ofrecería ToolBox
| Ajuste | «Mejor para jugar» | Ojo |
|---|---|---|
| Radeon Anti-Lag | Activado | Algunos juegos online antiguos dieron problemas con Anti-Lag+; el Anti-Lag normal es seguro |
| Radeon Image Sharpening | Activado, al 50–80 % | Cuestión de gustos |
| Radeon Chill | Desactivado (o tope de FPS = Hz del monitor) | Chill limita los FPS a propósito |
| Radeon Boost | Desactivado | Baja la resolución en movimiento |
| Enhanced Sync | Desactivado | Puede dar tirones en algunos juegos |
| FreeSync | Activado si el monitor lo admite | — |

### Notificaciones y anuncios de Adrenalin
AMD los tiene en **Preferencias → «Anuncios» y «Notificaciones emergentes»**, pero **no documenta dónde se guardan**.
Las búsquedas solo encuentran claves para otras cosas (por ejemplo, atajos de teclado en `SOFTWARE\AMD\DVR`).
ToolBox debería guiar paso a paso (y abrir AMD Software) en vez de escribir claves sin verificar.

**No se debe desactivar** el servicio *AMD External Events Utility*: es necesario para FreeSync.

## 3. Windows (sirve para cualquier tarjeta)
| Ajuste | Dónde | Notas |
|---|---|---|
| Programación de GPU acelerada por hardware | `HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers` → `HwSchMode` (2 = sí, 1 = no) | Requiere reiniciar. Necesaria para la generación de fotogramas de DLSS 3 |
| Optimizaciones para juegos en ventana | `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` → `DirectXUserGlobalSettings` | Valores conocidos pero no documentados oficialmente: verificar en un PC real |
| GPU preferida por juego (portátiles con dos gráficas) | `HKCU\Software\Microsoft\DirectX\UserGpuPreferences` → `<ruta del .exe>` = `GpuPreference=2;` | Igual que Configuración → Pantalla → Gráficos |
| Modo de juego | Ya disponible en otros ajustes | — |

## 4. Riesgos y límites
- **No existe «la mejor configuración» universal.** Depende del juego, del monitor y de si es portátil. ToolBox
  debería ofrecer 2–3 perfiles (*Mínima latencia*, *Equilibrado*, *Restaurar valores de fábrica*), explicar cada
  ajuste y no prometer FPS mágicos.
- **No lo puedo probar en GitHub:** los servidores de pruebas no tienen tarjeta NVIDIA ni AMD. Los ajustes de
  Windows sí se pueden probar allí; los de NVIDIA y AMD tendrían que probarse en tu PC.
- **Las actualizaciones del driver** pueden devolver algunos valores a su estado de fábrica (sobre todo la telemetría
  y algunas preferencias de AMD).
- **Deshacer:** antes de cambiar nada, ToolBox guardaría los valores actuales para poder restaurarlos con un botón.

## 5. Plan propuesto
1. **Detección:** qué tarjeta y qué driver tienes (`Win32_VideoController`) para mostrar solo lo que aplica.
2. **Fase 1 (se puede hacer y probar ya):** sección «Gráficos» con los ajustes de Windows, y guías claras con botón
   para abrir NVIDIA App o AMD Software y quitar notificaciones y anuncios.
3. **Fase 2 (NVIDIA):** programa auxiliar con NVAPI que lee y aplica el perfil global, con copia para deshacer.
4. **Fase 3 (AMD):** programa auxiliar con ADLX para Anti-Lag, Sharpening, Chill, Boost, Enhanced Sync y FreeSync,
   con copia para deshacer.

## Estado (ToolBox 0.6.0)
- ✅ Hecho: detección, ajustes de Windows, guías, telemetría de NVIDIA, ayudante NVAPI (`native/nvidia`) y ayudante
  ADLX (`native/amd`), con copia para deshacer.
- ✅ Probado en Windows real (sin tarjeta): compilan, arrancan y responden «no disponible» sin fallar; los ajustes de
  Windows se aplican y se deshacen.
- ⏳ Pendiente de probar en un PC con NVIDIA y con AMD.
- Fuera por ahora (no documentados): modo de latencia «Ultra» de NVIDIA y anuncios de Adrenalin por registro.

## Fuentes
- NVAPI, funciones DRS: <https://docs.nvidia.com/nvapi/group__drsapi.html>
- NVAPI en GitHub: <https://github.com/nvidia/nvapi> · licencia MIT de la parte publicada: <https://www.gamingonlinux.com/2020/07/nvidia-open-sourced-part-of-nvapi-sdk-to-aid-windows-emulation-environments/page=1>
- Ejemplo de uso de DRS: <https://gist.github.com/rickbrew/10e5c0fa3593ceb6f03766914f43a0c6>
- NVIDIA Profile Inspector (`-silentImport`): <https://github.com/Orbmu2k/nvidiaProfileInspector>
- NVIDIA App, superposición, notificaciones y telemetría: <https://www.techwisezoneblog.com/stop-nvidia-app-running-background/> · <https://frozentweaks.com/tweaks/disable-nvidia-telemetry-services> · <https://www.ghacks.net/2016/11/07/nvidia-telemetry-tracking/>
- ADLX, servicio de ajustes 3D: <https://gpuopen.com/manuals/adlx/adlx-sdk-references/adlx-interfaces/3d-graphics/iadlx3dsettingsservices> · ejemplos: <https://gpuopen.com/manuals/adlx/programming-with-adlx/adlx-samples/c-samples/3d-graphics>
- ADLX para Python: <https://pypi.org/project/amd-adlx/> · <https://gpuopen.com/manuals/adlx/adlx-page_guide_bindpy/>
- AMD Software, Preferencias (anuncios y notificaciones): <https://amd.com/en/resources/support-articles/faqs/DH3-001.html>
- Programación de GPU por hardware (`HwSchMode`): <https://winaero.com/turn-on-or-off-hardware-accelerated-gpu-scheduling-in-windows-10/> · <https://www.ninjaone.com/blog/manage-hardware-accelerated-gpu-scheduling/>
