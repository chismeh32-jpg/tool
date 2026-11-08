// Ajustes de tarjeta gráfica. Los identificadores de NVIDIA vienen de NvApiDriverSettings.h
// (NVAPI oficial, github.com/NVIDIA/nvapi). Solo se usan ajustes DOCUMENTADOS.
const NVIDIA = [
  {
    key: "power", id: 0x1057eb71, name: "Modo de control de energía",
    summary: "Con «Rendimiento máximo» la tarjeta no baja de frecuencia en mitad de la partida (menos tirones).",
    warn: "En portátiles gasta más batería y calienta más.",
    options: { 5: "Normal (de fábrica)", 0: "Adaptable", 1: "Preferir rendimiento máximo" },
    factory: 5,
  },
  {
    key: "lowLatency", id: 0x007ba09e, name: "Modo de baja latencia",
    summary: "La tarjeta prepara menos fotogramas por adelantado: notas antes tus clics y movimientos.",
    warn: "Si el juego tiene NVIDIA Reflex, actívalo dentro del juego: tiene prioridad sobre esto.",
    options: { 0: "Desactivado (de fábrica)", 1: "Activado" },
    factory: 0,
  },
  {
    key: "textureQuality", id: 0x00ce2691, name: "Filtrado de texturas – Calidad",
    summary: "«Alto rendimiento» gana algún FPS a cambio de una diferencia de imagen casi imperceptible.",
    options: { 0: "Calidad (de fábrica)", 20: "Alto rendimiento", 10: "Rendimiento", 4294967286: "Alta calidad" },
    factory: 0,
  },
];

const NVIDIA_PRESETS = [
  { id: "latency", name: "Mínima latencia", summary: "Para juegos competitivos: máxima respuesta.", values: { power: 1, lowLatency: 1, textureQuality: 20 } },
  { id: "balanced", name: "Equilibrado", summary: "Respuesta rápida sin forzar el consumo.", values: { power: 5, lowLatency: 1, textureQuality: 0 } },
];

// AMD Software: Adrenalin Edition (ADLX)
const AMD = [
  { key: "antiLag", name: "Radeon Anti-Lag", summary: "Reduce el retraso entre tus acciones y lo que ves en pantalla." },
  { key: "sharpening", name: "Radeon Image Sharpening", summary: "Hace la imagen más nítida, sobre todo con escalado (FSR). Es cuestión de gustos." },
  { key: "chill", name: "Radeon Chill", summary: "Baja los FPS cuando no te mueves para ahorrar energía. Para jugar en serio, mejor apagado." },
  { key: "boost", name: "Radeon Boost", summary: "Baja la resolución mientras te mueves rápido. Da FPS pero la imagen se ve peor." },
  { key: "enhancedSync", name: "Enhanced Sync", summary: "Alternativa a la sincronización vertical. En algunos juegos causa tirones." },
];

const AMD_PRESETS = [
  { id: "latency", name: "Mínima latencia", summary: "Anti-Lag activado y fuera lo que limita o reduce la imagen.", values: { antiLag: 1, chill: 0, boost: 0, enhancedSync: 0 } },
];

// Ajustes de Windows para cualquier tarjeta
const WINDOWS = [
  {
    key: "hags", name: "Programación de GPU acelerada por hardware",
    summary: "La tarjeta gestiona su propia memoria. Reduce un poco la latencia y es necesaria para la generación de fotogramas de DLSS 3.",
    restart: "reboot",
  },
  {
    key: "windowedOpt", name: "Optimizaciones para juegos en ventana",
    summary: "Los juegos en ventana o «pantalla completa sin bordes» funcionan casi como en pantalla completa (menos latencia, soporte de G-SYNC/FreeSync).",
  },
  {
    key: "gameMode", name: "Modo de juego de Windows",
    summary: "Windows da prioridad al juego y evita instalar actualizaciones o mostrar avisos mientras juegas.",
  },
];

const GUIDES = {
  nvidia: {
    title: "Quitar notificaciones y la superposición de NVIDIA App",
    steps: [
      "Abre NVIDIA App (busca «NVIDIA App» en el menú Inicio).",
      "Ve a Configuración → Funciones y desactiva «Superposición de NVIDIA» si no la usas para grabar o ver FPS.",
      "Ve a Configuración → Notificaciones y desactiva las que no quieras (novedades, recompensas, juegos…).",
      "No desactives el servicio «NVIDIA Display Container»: sin él no se abre el Panel de control.",
    ],
  },
  amd: {
    title: "Quitar anuncios y notificaciones de AMD Software",
    steps: [
      "Abre AMD Software: Adrenalin Edition (clic derecho en el escritorio o menú Inicio).",
      "Pulsa el engranaje (Configuración) → Preferencias.",
      "Desactiva «Anuncios» y «Notificaciones emergentes» (Toast Notifications).",
      "No desactives el servicio «AMD External Events Utility»: lo necesita FreeSync.",
    ],
  },
};

module.exports = { NVIDIA, NVIDIA_PRESETS, AMD, AMD_PRESETS, WINDOWS, GUIDES };
