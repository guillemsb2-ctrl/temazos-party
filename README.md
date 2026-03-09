# Temazos Rooms modular

Proyecto estático para Vercel con Firebase Realtime Database + Anonymous Auth.

## Archivos
- `index.html`: estructura principal
- `styles.css`: look cyber/neón mobile-first
- `firebase-client.js`: conexión Firebase
- `songs-data.js`: listas y parser `URL | AÑO | TÍTULO`
- `utils.js`: utilidades, modos, scoring
- `room-service.js`: salas, join, presencia, reset
- `game-service.js`: rondas, timer, reveal, ajustes
- `app.js`: arranque, render y eventos UI

## Flujo
- Home: crear o unirse
- Crear sala: guarda moderador, modo, géneros y share URL
- Lobby: compartir, QR, jugadores
- Ronda: nueva ronda -> abrir canción -> iniciar 35s -> respuestas
- Reveal: calcula puntos y actualiza ranking
- Final: ganador o desempate

## Firebase
- Activa Anonymous Auth
- Activa Realtime Database
- Pega `firebase.rules.json` en Rules

## Vercel
- Sube todos los archivos al repo
- Vercel redepliega automáticamente en cada commit si el repo ya está conectado
