# 🕵️ El Infiltrado

Juego de fiesta para jugar con amigos **con un solo móvil**.

Todos reciben la misma palabra secreta… menos el infiltrado, que no sabe cuál es.
Por turnos, cada uno dice una palabra relacionada. Después votáis quién es el infiltrado.
Si le pilláis, aún puede ganar si adivina la palabra.

## Cómo jugar
1. Añadid los nombres (mínimo 3), elegid categorías y pulsad **Empezar partida**.
2. Pasaos el móvil: cada uno ve su palabra (o descubre que es el infiltrado).
3. Ronda de pistas con temporizador.
4. Votad, revelad y sumad puntos.

### Puntos
- Pilláis al infiltrado y falla la palabra: **+1** para cada jugador normal.
- Le pilláis pero acierta la palabra: **+2** para el infiltrado.
- El infiltrado no es descubierto: **+3** para él.

## Tecnología
HTML, CSS y JavaScript sin dependencias ni compilación. Funciona sin conexión una vez cargado.

- `index.html`: pantallas del juego
- `styles.css`: estilos
- `app.js`: lógica
- `words.js`: banco de palabras (¡añade las vuestras!)

## Jugar en local
Abre `index.html` en el navegador, o:

```bash
npx serve .
```

## Publicarlo gratis
- **GitHub Pages**: Settings → Pages → Branch: `main` / root.
- **Vercel**: importa el repo; no necesita configuración.
