// Banco de palabras por categoría. Añade o quita las que quieras.
const CATEGORIES = {
  "Lugares": {
    emoji: "📍",
    words: ["Playa", "Hospital", "Aeropuerto", "Biblioteca", "Gimnasio", "Cine", "Supermercado", "Discoteca",
      "Colegio", "Museo", "Zoo", "Iglesia", "Estadio", "Farmacia", "Peluquería", "Camping", "Piscina",
      "Cárcel", "Montaña", "Restaurante", "Parque de atracciones", "Gasolinera", "Comisaría", "Mercado"]
  },
  "Comida": {
    emoji: "🍕",
    words: ["Paella", "Tortilla de patatas", "Pizza", "Sushi", "Churros", "Gazpacho", "Hamburguesa", "Croquetas",
      "Helado", "Tacos", "Patatas bravas", "Jamón", "Palomitas", "Chocolate", "Ensalada", "Lentejas",
      "Kebab", "Macarrones", "Donut", "Sandía", "Huevo frito", "Calamares", "Flan", "Cereales"]
  },
  "Animales": {
    emoji: "🐙",
    words: ["Perro", "Gato", "Pulpo", "Jirafa", "Pingüino", "Elefante", "Mosquito", "Tiburón", "Caballo",
      "Serpiente", "Loro", "Canguro", "Murciélago", "Vaca", "Delfín", "Hormiga", "León", "Tortuga",
      "Cerdo", "Mono", "Búho", "Caracol", "Cocodrilo", "Abeja"]
  },
  "Objetos": {
    emoji: "🧦",
    words: ["Paraguas", "Calcetín", "Móvil", "Cepillo de dientes", "Tijeras", "Mando de la tele", "Almohada",
      "Espejo", "Llaves", "Mochila", "Gafas de sol", "Sartén", "Vela", "Reloj", "Martillo", "Toalla",
      "Bolígrafo", "Escoba", "Auriculares", "Cartera", "Linterna", "Peine", "Taza", "Bombilla"]
  },
  "Profesiones": {
    emoji: "👩‍🚒",
    words: ["Bombero", "Médico", "Profesor", "Policía", "Cocinero", "Astronauta", "Fontanero", "Piloto",
      "Peluquero", "Youtuber", "Camarero", "Dentista", "Payaso", "Futbolista", "Mago", "Taxista",
      "Panadero", "Socorrista", "Veterinario", "Cartero", "Pintor", "Jardinero", "Juez", "Detective"]
  },
  "Deportes": {
    emoji: "⚽",
    words: ["Fútbol", "Baloncesto", "Tenis", "Natación", "Pádel", "Boxeo", "Surf", "Esquí", "Ciclismo",
      "Golf", "Ajedrez", "Escalada", "Voleibol", "Karate", "Atletismo", "Bolos", "Patinaje", "Rugby",
      "Ping pong", "Yoga", "Balonmano", "Dardos", "Equitación", "Paracaidismo"]
  },
  "Fiesta": {
    emoji: "🎉",
    words: ["Cumpleaños", "Boda", "Nochevieja", "Halloween", "Karaoke", "Carnaval", "Barbacoa", "Despedida de soltero",
      "Feria", "Concierto", "Navidad", "Fiesta de pijamas", "Graduación", "San Fermín", "Botellón", "Verbena",
      "Reyes Magos", "Tomatina", "Fuegos artificiales", "Piñata", "Disfraz", "Tarta", "Confeti", "Brindis"]
  },
  "Cosas de casa": {
    emoji: "🏠",
    words: ["Lavadora", "Nevera", "Sofá", "Ducha", "Microondas", "Ventana", "Escalera", "Garaje", "Balcón",
      "Cama", "Ascensor", "Chimenea", "Persiana", "Timbre", "Váter", "Armario", "Alfombra", "Lámpara",
      "Horno", "Buzón", "Radiador", "Jardín", "Trastero", "Cortina"]
  }
};
