// Apps que Windows trae preinstaladas (paquetes AppX).
//   id:       nombre exacto del paquete (Get-AppxPackage -Name)
//   storeId:  id en Microsoft Store, para poder reinstalarla con «winget --source msstore»
//   warn:     aviso que se muestra antes de quitarla
//   preRemove:PowerShell que se ejecuta antes de quitarla
// Basado en la lista de WinUtil (MIT), con textos propios.
const GROUPS = [
  {
    id: "ads",
    name: "Publicidad y extras de Microsoft",
    summary: "Apps que promocionan servicios de Microsoft o que casi nadie usa. Quitarlas es seguro.",
    recommended: true,
  },
  {
    id: "xbox",
    name: "Xbox y juegos",
    summary: "Solo quítalas si no juegas con Xbox Game Pass ni con juegos de la Microsoft Store.",
    recommended: false,
  },
  {
    id: "tools",
    name: "Herramientas que quizá uses",
    summary: "Apps útiles que vienen con Windows. Quita solo las que tengas claro que no usas.",
    recommended: false,
  },
];

const APPS = [
  // Publicidad y extras
  { id: "Microsoft.BingNews", group: "ads", name: "Noticias", summary: "Titulares de Microsoft Start con publicidad.", storeId: "9WZDNCRFHVFW" },
  { id: "Microsoft.BingWeather", group: "ads", name: "El Tiempo", summary: "Previsión del tiempo de MSN.", storeId: "9WZDNCRFJ3Q2" },
  { id: "Microsoft.BingSearch", group: "ads", name: "Búsqueda de Bing", summary: "Integra Bing en la búsqueda de Windows.", storeId: "9NZBF4GT040C" },
  { id: "Microsoft.StartExperiencesApp", group: "ads", name: "Contenido de los widgets", summary: "Las noticias, deportes y bolsa del panel de widgets.", storeId: "9PC1H9VN18CM" },
  { id: "Microsoft.Copilot", group: "ads", name: "Copilot", summary: "El asistente de IA de Microsoft.", storeId: "9NHT9RB2F4HD" },
  { id: "Microsoft.MicrosoftOfficeHub", group: "ads", name: "Microsoft 365 (Office)", summary: "Un acceso directo que anuncia Office. No quita Word ni Excel si los tienes instalados.", storeId: "9WZDNCRD29V9" },
  { id: "Clipchamp.Clipchamp", group: "ads", name: "Clipchamp", summary: "Editor de vídeo online de Microsoft.", storeId: "9P1J8S7CCWWT" },
  { id: "Microsoft.MicrosoftSolitaireCollection", group: "ads", name: "Solitaire Collection", summary: "Solitarios con anuncios y suscripción." },
  { id: "Microsoft.GetHelp", group: "ads", name: "Obtener ayuda", summary: "Asistente de soporte de Microsoft.", storeId: "9PKDZBMV1H3T" },
  { id: "Microsoft.WindowsFeedbackHub", group: "ads", name: "Centro de opiniones", summary: "Para enviar sugerencias y fallos a Microsoft.", storeId: "9NBLGGH4R32N" },
  { id: "Microsoft.Todos", group: "ads", name: "Microsoft To Do", summary: "Lista de tareas sincronizada con tu cuenta Microsoft.", storeId: "9NBLGGH5R558" },
  { id: "Microsoft.PowerAutomateDesktop", group: "ads", name: "Power Automate", summary: "Automatización de tareas para empresas.", storeId: "9NFTCH6J7FHV" },
  { id: "Microsoft.Windows.DevHome", group: "ads", name: "Dev Home", summary: "Panel para programadores (Microsoft ya lo ha retirado).", storeId: "9N8MHTPHNGVV" },
  { id: "Microsoft.OutlookForWindows", group: "ads", name: "Outlook (nuevo)", summary: "El nuevo Outlook que sustituye a Correo y Calendario.", storeId: "9NRX63209R7B",
    warn: "Si usas Outlook para tu correo, no lo quites." },
  { id: "MSTeams", group: "ads", name: "Microsoft Teams", summary: "Chat y videollamadas de Microsoft.", storeId: "XP8BT8DW290MPQ",
    warn: "Si lo usas para el trabajo o clase, no lo quites." },

  // Xbox
  { id: "Microsoft.GamingApp", group: "xbox", name: "App de Xbox", summary: "Tienda y biblioteca de Xbox Game Pass para PC.", storeId: "9MV0B5HZVK9Z" },
  { id: "Microsoft.XboxGamingOverlay", group: "xbox", name: "Xbox Game Bar", summary: "La barra de Win+G para grabar partidas y ver el rendimiento.", storeId: "9NZKPSTSNW4P",
    preRemove: String.raw`Get-Process -Name GameBar* -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; New-Item -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR' -Force | Out-Null; Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR' -Name AppCaptureEnabled -Value 0 -Type DWord` },
  { id: "Microsoft.XboxSpeechToTextOverlay", group: "xbox", name: "Subtítulos de chat de Xbox", summary: "Convierte en texto el chat de voz de los juegos." },
  { id: "Microsoft.XboxIdentityProvider", group: "xbox", name: "Inicio de sesión de Xbox", summary: "Permite iniciar sesión con tu cuenta Xbox dentro de los juegos.", storeId: "9WZDNCRD1HKW",
    warn: "Muchos juegos de PC (incluidos algunos de Steam) lo usan para iniciar sesión." },
  { id: "Microsoft.Xbox.TCUI", group: "xbox", name: "Ventanas de cuenta de Xbox", summary: "Las ventanas de amigos y perfil de Xbox dentro de los juegos.",
    warn: "Algunos juegos lo necesitan para iniciar sesión." },

  // Herramientas
  { id: "Microsoft.WindowsCalculator", group: "tools", name: "Calculadora", summary: "La calculadora de Windows.", storeId: "9WZDNCRFHVN5" },
  { id: "Microsoft.Windows.Photos", group: "tools", name: "Fotos", summary: "El visor de fotos predeterminado.", storeId: "9WZDNCRFJBH4",
    warn: "Si la quitas, instala otro visor de imágenes antes." },
  { id: "Microsoft.Paint", group: "tools", name: "Paint", summary: "El editor de dibujo clásico.", storeId: "9PCFS5B6T72H" },
  { id: "Microsoft.WindowsNotepad", group: "tools", name: "Bloc de notas", summary: "El editor de texto de Windows.", storeId: "9MSMLRH6LZF3" },
  { id: "Microsoft.ScreenSketch", group: "tools", name: "Recortes", summary: "Capturas de pantalla con Win+Mayús+S.", storeId: "9MZ95KL8MR0L" },
  { id: "Microsoft.WindowsCamera", group: "tools", name: "Cámara", summary: "Fotos y vídeos con la webcam.", storeId: "9WZDNCRFJBBG" },
  { id: "Microsoft.WindowsSoundRecorder", group: "tools", name: "Grabadora de sonido", summary: "Graba audio con el micrófono.", storeId: "9WZDNCRFHWKN" },
  { id: "Microsoft.WindowsAlarms", group: "tools", name: "Reloj", summary: "Alarmas, temporizadores y sesiones de concentración.", storeId: "9WZDNCRFJ3PR" },
  { id: "Microsoft.MicrosoftStickyNotes", group: "tools", name: "Notas rápidas", summary: "Notas adhesivas en el escritorio.", storeId: "9NBLGGH4QGHW" },
  { id: "Microsoft.ZuneMusic", group: "tools", name: "Reproductor multimedia", summary: "El reproductor de música y vídeo de Windows.", storeId: "9WZDNCRFJ3PT" },
  { id: "Microsoft.ZuneVideo", group: "tools", name: "Películas y TV", summary: "Reproductor y tienda de vídeo antiguo.", storeId: "9WZDNCRFJ3P2" },
  { id: "Microsoft.YourPhone", group: "tools", name: "Enlace Móvil", summary: "Conecta tu móvil al PC (mensajes, fotos, llamadas).", storeId: "9NMPJ99VJBWV" },
  { id: "MicrosoftWindows.CrossDevice", group: "tools", name: "Dispositivos móviles", summary: "Servicio de conexión con el móvil que usa Enlace Móvil.", storeId: "9NTXGKQ8P7N0",
    warn: "Si usas Enlace Móvil o la cámara del móvil como webcam, no lo quites." },
  { id: "MicrosoftCorporationII.QuickAssist", group: "tools", name: "Asistencia rápida", summary: "Para que alguien te ayude conectándose a tu PC.", storeId: "9P7BP5VNWKX5" },
];

module.exports = { GROUPS, APPS };
