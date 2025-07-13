# Crazy Bridge Multiplayer Server

A Node.js multiplayer server for the Crazy Bridge card game using Socket.IO for real-time communication.

## Features

- **Jackbox-style Room System**: 4-digit room codes for easy joining
- **Real-time Multiplayer**: Socket.IO for instant game updates
- **Room Management**: Create, join, and manage game rooms
- **Player Management**: Handle connections, disconnections, and reconnections
- **Game State Management**: Full game logic with synchronized state
- **Rate Limiting**: Protection against abuse
- **Production Ready**: Deployed on Render.com

## API Endpoints

### Room Management

#### Create Room
```http
POST /api/rooms/create
Content-Type: application/json

{
  "playerName": "Player Name",
  "gameSettings": {
    "maxPlayers": 8,
    "gameLength": 10,
    "language": "en",
    "autoStart": false
  }
}
```

#### Join Room
```http
POST /api/rooms/join
Content-Type: application/json

{
  "roomCode": "ABCD",
  "playerName": "Player Name"
}
```

#### Get Room Status
```http
GET /api/rooms/:code
```

#### Delete Room (Host Only)
```http
DELETE /api/rooms/:code
Content-Type: application/json

{
  "playerId": "player_id"
}
```

### Game Management

#### Start Game
```http
POST /api/games/:roomCode/start
Content-Type: application/json

{
  "playerId": "player_id"
}
```

#### Get Game State
```http
GET /api/games/:roomCode
```

### Player Management

#### Get Player Info
```http
GET /api/players/:id
```

### Statistics

#### Get Server Stats
```http
GET /api/stats
```

## Socket Events

### Client to Server

#### Player Authentication
```javascript
socket.emit('player:authenticate', {
  playerId: 'existing_player_id', // optional for reconnection
  playerName: 'Player Name'
}, (response) => {
  if (response.success) {
    console.log('Authenticated:', response.player);
  }
});
```

#### Join Room
```javascript
socket.emit('room:join', {
  roomCode: 'ABCD',
  playerId: 'player_id'
}, (response) => {
  if (response.success) {
    console.log('Joined room:', response.room);
  }
});
```

#### Leave Room
```javascript
socket.emit('room:leave', {
  roomCode: 'ABCD',
  playerId: 'player_id'
}, (response) => {
  console.log('Left room:', response.success);
});
```

#### Set Ready State
```javascript
socket.emit('player:ready', {
  roomCode: 'ABCD',
  playerId: 'player_id',
  isReady: true
}, (response) => {
  console.log('Ready state updated:', response.success);
});
```

#### Start Game
```javascript
socket.emit('game:start', {
  roomCode: 'ABCD',
  playerId: 'player_id'
}, (response) => {
  if (response.success) {
    console.log('Game started:', response.gameState);
  }
});
```

#### Game Actions
```javascript
socket.emit('game:action', {
  roomCode: 'ABCD',
  playerId: 'player_id',
  action: {
    type: 'placeBid',
    bid: 3
  }
}, (response) => {
  if (response.success) {
    console.log('Action processed:', response.gameState);
  }
});
```

#### Chat Messages
```javascript
socket.emit('chat:message', {
  roomCode: 'ABCD',
  playerId: 'player_id',
  message: 'Hello everyone!'
}, (response) => {
  console.log('Message sent:', response.success);
});
```

### Server to Client

#### Player Events
```javascript
socket.on('player:joined', (data) => {
  console.log('Player joined:', data.player);
  console.log('Updated room:', data.room);
});

socket.on('player:left', (data) => {
  console.log('Player left:', data.playerId);
});

socket.on('player:ready_changed', (data) => {
  console.log('Player ready state:', data.playerId, data.isReady);
});

socket.on('player:disconnected', (data) => {
  console.log('Player disconnected:', data.playerId);
});

socket.on('player:reconnected', (data) => {
  console.log('Player reconnected:', data.player);
});
```

#### Room Events
```javascript
socket.on('room:host_changed', (data) => {
  console.log('New host:', data.newHost);
});

socket.on('room:all_ready', (data) => {
  console.log('All players ready in room:', data.room);
});
```

#### Game Events
```javascript
socket.on('game:started', (data) => {
  console.log('Game started:', data.gameState);
});

socket.on('game:state_updated', (data) => {
  console.log('Game state updated:', data.gameState);
  console.log('Action:', data.action);
});

socket.on('game:ended', (data) => {
  console.log('Game ended:', data.results);
});

socket.on('game:paused', (data) => {
  console.log('Game paused:', data.reason);
});
```

#### Chat Events
```javascript
socket.on('chat:message', (data) => {
  console.log('Chat message:', data.playerName, data.message);
});
```

## Installation & Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production mode
npm start

# Run tests
npm test
```

### Environment Variables
```bash
NODE_ENV=production
PORT=3001
```

## Deployment

### Render.com Deployment

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Set environment variables as needed

### Health Check
The server provides a health check endpoint at `/health` that returns:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "rooms": 5,
  "players": 23
}
```

## Architecture

### Managers

#### RoomManager
- Handles room creation, joining, and cleanup
- Generates unique 4-digit room codes
- Manages room lifecycle and player states
- Automatic cleanup of inactive rooms

#### PlayerManager
- Manages player authentication and connections
- Handles socket mapping and reconnections
- Tracks player statistics and game history
- Automatic cleanup of disconnected players

#### GameManager
- Orchestrates game logic and state
- Processes game actions (bids, card plays)
- Manages game phases and transitions
- Calculates scores and determines winners

### Security Features

- Rate limiting on API endpoints
- Input validation and sanitization
- CORS protection
- Helmet security headers
- Error handling and logging

### Performance Features

- Connection pooling
- Memory-based rate limiting
- Automatic cleanup of inactive resources
- Efficient event-driven architecture

## Error Handling

The server provides detailed error responses:

```json
{
  "error": "Room not found",
  "success": false
}
```

Common error codes:
- `400`: Bad Request (invalid input)
- `403`: Forbidden (permission denied)
- `404`: Not Found (room/player not found)
- `409`: Conflict (room full, game in progress)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

## Monitoring

Monitor server health using:
- `/health` endpoint for basic status
- `/api/stats` endpoint for detailed statistics
- Console logs for debugging
- Socket connection events

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.