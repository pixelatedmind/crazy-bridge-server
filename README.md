# Crazy Bridge Server

Backend server for the Crazy Bridge multiplayer card game.

## Live Deployment

- **Server URL**: `https://crazy-bridge-server.onrender.com`
- **Frontend URL**: `https://idyllic-pegasus-2e83e0.netlify.app`
- **Health Check**: `https://crazy-bridge-server.onrender.com/health`

## Features

- **Real-time Multiplayer**: Socket.IO for instant game updates
- **Room Management**: Create and join game rooms with 4-letter codes
- **Rate Limiting**: Protection against spam and abuse
- **Health Monitoring**: Built-in health check endpoints
- **CORS Enabled**: Works with any frontend domain

## API Endpoints

### Health Check
```
GET /health
```
Returns server status, uptime, and connection statistics.

### Room Information
```
GET /rooms/:roomCode
```
Get information about a specific room.

### Debug Information
```
GET /debug/rooms
```
Get all active rooms and statistics (for debugging).

## Socket.IO Events

### Client to Server
- `createRoom` - Create a new game room
- `joinRoom` - Join an existing room
- `leaveRoom` - Leave current room
- `startGame` - Start the game (host only)
- `gameMessage` - Send game action to other players
- `ping` - Heartbeat ping

### Server to Client
- `roomCreated` - Room successfully created
- `roomJoined` - Successfully joined room
- `playerJoined` - Another player joined
- `playerLeft` - Player left the room
- `gameStarted` - Game has started
- `gameMessage` - Game action from another player
- `error` - Error message
- `pong` - Heartbeat response

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (production/development)
- `FRONTEND_URL` - Frontend application URL for CORS

## Deployment

This server is designed to be deployed on Render.com using the included `render.yaml` configuration.

### Deploy to Render

1. Push this repository to GitHub
2. Connect your GitHub repo to Render
3. Render will automatically detect the `render.yaml` file
4. The server will be deployed with the free tier
5. Set environment variables in Render dashboard if needed

### Local Development

```bash
npm install
npm run dev
```

The server will start on port 3001 with auto-reload enabled.

### Testing the Deployment

```bash
# Test health endpoint
curl https://crazy-bridge-server.onrender.com/health

# Test room creation (requires Socket.IO client)
# Use the frontend application to test full functionality
```

## Rate Limiting

- 30 requests per minute per socket connection
- Automatic cleanup of old rate limit entries
- Silent rate limiting for game messages to prevent disruption

## Room Management

- Rooms are automatically created with unique 4-letter codes
- Maximum 8 players per room
- Rooms are automatically deleted when empty
- Host privileges transfer automatically if host leaves

## Security Features

- Input sanitization for all user data
- Rate limiting to prevent abuse
- CORS configuration for cross-origin requests
- Automatic cleanup of disconnected players

## Monitoring

The server includes built-in monitoring:
- Active room count
- Connected player count
- Server uptime
- Memory usage statistics

Access monitoring data via the `/health` endpoint.