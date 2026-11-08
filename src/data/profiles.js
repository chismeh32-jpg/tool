// Perfiles de un clic: combinan ajustes, apps de Windows que quitar y limpiezas.
// Los identificadores deben existir en tweaks.js, bloatware.js y cleanup.js (lo comprueba la prueba).
const SAFE_CLEANUP = ["temp-user", "temp-windows", "wu-cache", "delivery-opt", "error-reports"];

module.exports = [
  {
    id: "recommended",
    icon: "⭐",
    name: "Recomendado",
    who: "Para cualquiera",
    summary: "Lo que casi todo el mundo agradece: sin anuncios, extensiones visibles y espacio libre.",
    tweaks: ["show-extensions", "no-start-ads", "no-ad-id", "end-task"],
    bloat: [
      "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.StartExperiencesApp", "Microsoft.MicrosoftOfficeHub",
      "Clipchamp.Clipchamp", "Microsoft.MicrosoftSolitaireCollection", "Microsoft.GetHelp", "Microsoft.WindowsFeedbackHub",
      "Microsoft.PowerAutomateDesktop", "Microsoft.Windows.DevHome",
    ],
    cleanup: SAFE_CLEANUP,
  },
  {
    id: "gamer",
    icon: "🎮",
    name: "Gamer",
    who: "Si juegas en el PC",
    summary: "Ratón preciso, sin interrupciones en mitad de la partida y sin apps que no usas. Las apps de Xbox se mantienen.",
    tweaks: ["no-mouse-accel", "no-sticky-keys", "end-task", "no-start-ads", "show-extensions"],
    bloat: [
      "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.StartExperiencesApp", "Microsoft.MicrosoftOfficeHub",
      "Clipchamp.Clipchamp", "Microsoft.GetHelp", "Microsoft.WindowsFeedbackHub", "Microsoft.PowerAutomateDesktop",
      "Microsoft.Windows.DevHome", "Microsoft.Copilot",
    ],
    cleanup: SAFE_CLEANUP,
  },
  {
    id: "privacy",
    icon: "🔒",
    name: "Privacidad",
    who: "Si quieres que Windows comparta lo mínimo",
    summary: "Menos datos para Microsoft y los anunciantes, búsquedas sin Bing y fuera Copilot.",
    tweaks: ["no-ad-id", "telemetry-min", "no-bing-search", "no-start-ads"],
    bloat: [
      "Microsoft.Copilot", "Microsoft.BingSearch", "Microsoft.BingNews", "Microsoft.BingWeather",
      "Microsoft.StartExperiencesApp", "Microsoft.WindowsFeedbackHub", "Microsoft.GetHelp",
    ],
    cleanup: ["error-reports"],
  },
];
