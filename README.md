# Crazy Bridge Multiplayer Server

This is a simple Node.js + Express + Socket.io backend for handling real-time multiplayer communication for the Crazy Bridge card game.

## Features

- Room creation and player join logic
- Card play broadcasting
- Socket events for room and game management
- Simple stateless multiplayer logic

## Requirements

- Node.js
- Deployed on Render or similar with port 3001

## Events

- `create_room`
- `join`
- `play_card`
- `disconnect`
