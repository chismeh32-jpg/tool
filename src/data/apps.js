// Catálogo de aplicaciones que ToolBox puede instalar con winget.
// "id" es el identificador oficial del paquete en winget (https://winget.run).
module.exports = [
  // Navegadores
  { id: "Google.Chrome", name: "Google Chrome", category: "Navegadores", summary: "El navegador más usado." },
  { id: "Mozilla.Firefox", name: "Firefox", category: "Navegadores", summary: "Navegador libre centrado en la privacidad." },
  { id: "Brave.Brave", name: "Brave", category: "Navegadores", summary: "Navegador con bloqueador de anuncios incluido." },
  { id: "Opera.OperaGX", name: "Opera GX", category: "Navegadores", summary: "Navegador pensado para gamers." },

  // Comunicación
  { id: "Discord.Discord", name: "Discord", category: "Comunicación", summary: "Chat de voz y texto con amigos y comunidades." },
  { id: "Telegram.TelegramDesktop", name: "Telegram", category: "Comunicación", summary: "Mensajería rápida, también en el PC." },
  { id: "Zoom.Zoom", name: "Zoom", category: "Comunicación", summary: "Videollamadas y reuniones." },

  // Juegos
  { id: "Valve.Steam", name: "Steam", category: "Juegos", summary: "La tienda de juegos de PC más grande." },
  { id: "EpicGames.EpicGamesLauncher", name: "Epic Games", category: "Juegos", summary: "Tienda de Epic con juegos gratis cada semana." },
  { id: "GOG.Galaxy", name: "GOG Galaxy", category: "Juegos", summary: "Juegos sin DRM y biblioteca unificada." },
  { id: "ElectronicArts.EADesktop", name: "EA app", category: "Juegos", summary: "Lanzador de los juegos de EA." },
  { id: "Ubisoft.Connect", name: "Ubisoft Connect", category: "Juegos", summary: "Lanzador de los juegos de Ubisoft." },

  // Multimedia
  { id: "VideoLAN.VLC", name: "VLC", category: "Multimedia", summary: "Reproduce cualquier vídeo o audio." },
  { id: "Spotify.Spotify", name: "Spotify", category: "Multimedia", summary: "Música y podcasts." },
  { id: "OBSProject.OBSStudio", name: "OBS Studio", category: "Multimedia", summary: "Graba la pantalla o haz directos." },
  { id: "Audacity.Audacity", name: "Audacity", category: "Multimedia", summary: "Editor de audio sencillo y gratuito." },
  { id: "HandBrake.HandBrake", name: "HandBrake", category: "Multimedia", summary: "Convierte y comprime vídeos." },
  { id: "dotPDN.PaintDotNet", name: "Paint.NET", category: "Multimedia", summary: "Editor de imágenes fácil y potente." },
  { id: "ShareX.ShareX", name: "ShareX", category: "Multimedia", summary: "Capturas de pantalla y GIFs con un atajo." },

  // Utilidades
  { id: "7zip.7zip", name: "7-Zip", category: "Utilidades", summary: "Abre y crea archivos .zip, .rar, .7z…" },
  { id: "voidtools.Everything", name: "Everything", category: "Utilidades", summary: "Encuentra cualquier archivo al instante." },
  { id: "Microsoft.PowerToys", name: "PowerToys", category: "Utilidades", summary: "Herramientas extra de Microsoft para Windows." },
  { id: "AntibodySoftware.WizTree", name: "WizTree", category: "Utilidades", summary: "Descubre qué ocupa espacio en tu disco." },
  { id: "Bitwarden.Bitwarden", name: "Bitwarden", category: "Utilidades", summary: "Gestor de contraseñas gratuito." },
  { id: "qBittorrent.qBittorrent", name: "qBittorrent", category: "Utilidades", summary: "Cliente de torrents sin publicidad." },
  { id: "Rufus.Rufus", name: "Rufus", category: "Utilidades", summary: "Crea USB de arranque para instalar sistemas." },
  { id: "CrystalDewWorld.CrystalDiskInfo", name: "CrystalDiskInfo", category: "Utilidades", summary: "Comprueba la salud de tus discos." },
  { id: "REALiX.HWiNFO", name: "HWiNFO", category: "Utilidades", summary: "Información y temperaturas de tu hardware." },

  // Documentos
  { id: "TheDocumentFoundation.LibreOffice", name: "LibreOffice", category: "Documentos", summary: "Alternativa gratuita a Office." },
  { id: "SumatraPDF.SumatraPDF", name: "SumatraPDF", category: "Documentos", summary: "Lector de PDF ligerísimo." },
  { id: "Notepad++.Notepad++", name: "Notepad++", category: "Documentos", summary: "Bloc de notas con superpoderes." },
  { id: "Obsidian.Obsidian", name: "Obsidian", category: "Documentos", summary: "Notas enlazadas, guardadas en tu PC." },

  // Desarrollo
  { id: "Microsoft.VisualStudioCode", name: "Visual Studio Code", category: "Programación", summary: "Editor de código." },
  { id: "Git.Git", name: "Git", category: "Programación", summary: "Control de versiones." },
  { id: "OpenJS.NodeJS.LTS", name: "Node.js LTS", category: "Programación", summary: "Ejecuta JavaScript fuera del navegador." },
  { id: "Python.Python.3.12", name: "Python 3.12", category: "Programación", summary: "Lenguaje de programación." },
  { id: "Microsoft.WindowsTerminal", name: "Windows Terminal", category: "Programación", summary: "Terminal moderna con pestañas." },

  // Componentes
  { id: "Microsoft.VCRedist.2015+.x64", name: "Visual C++ 2015-2022", category: "Componentes", summary: "Lo piden muchos juegos y programas." },
  { id: "Microsoft.DotNet.DesktopRuntime.8", name: ".NET Desktop Runtime 8", category: "Componentes", summary: "Necesario para muchas apps modernas." },
  { id: "Oracle.JavaRuntimeEnvironment", name: "Java", category: "Componentes", summary: "Necesario para Minecraft Java (mods) y otras apps." },
];
