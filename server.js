const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: [
      "https://idyllic-pegasus-2e83e0.netlify.app",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

app.use(cors());
app.use(express.json());

// Store rooms and their players
const rooms = {};
const playerRooms = {}; // Track which room each player is in

// Rate limiting
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30;

function checkRateLimit(socketId) {
  const now = Date.now();
  const userRequests = rateLimits.get(socketId) || [];
  
  // Remove old requests
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);
  
  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimits.set(socketId, recentRequests);
  return true;
}

// Utility function to generate room codes
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Utility function to sanitize input
function sanitizeString(str) {
  return str.replace(/[<>\"'&]/g, '').trim().substring(0, 20);
}

// Utility function to log room state (simplified)
function logRoomState(roomId) {
  const room = rooms[roomId];
  if (room) {
    console.log(`🏠 Room ${roomId}: ${room.players.length} players`);
  }
}

console.log('🚀 Starting Crazy Bridge Server...');

io.on('connection', (socket) => {
  console.log('🔌 Connection:', socket.id);

  // Heartbeat ping/pong (reduced logging)
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  // Create room event
  socket.on('createRoom', (data) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    console.log('📥 Create room request from', socket.id);
    
    try {
      const { hostName, maxPlayers = 8, gameType = 'crazy-bridge' } = data || {};
      
      const sanitizedName = sanitizeString(hostName || '');
      if (!sanitizedName) {
        console.log('❌ Missing or invalid hostName');
        socket.emit('error', { message: 'Valid host name is required' });
        return;
      }

      let roomCode = generateRoomCode();
      
      // Ensure room code is unique
      while (rooms[roomCode]) {
        roomCode = generateRoomCode();
      }
      
      const hostPlayer = {
        id: socket.id,
        name: sanitizedName,
        isHost: true,
        isConnected: true
      };
      
      rooms[roomCode] = {
        id: roomCode,
        hostId: socket.id,
        players: [hostPlayer],
        gameState: null,
        isGameStarted: false,
        maxPlayers: Math.min(Math.max(maxPlayers, 2), 8), // Clamp between 2-8
        gameType,
        createdAt: new Date()
      };
      
      playerRooms[socket.id] = roomCode;
      socket.join(roomCode);
      
      console.log('✅ Room created:', roomCode, 'by', sanitizedName);
      
      const response = { 
        roomCode, 
        playerId: socket.id,
        room: rooms[roomCode]
      };
      
      socket.emit('roomCreated', response);
      
    } catch (error) {
      console.error('❌ Error creating room:', error.message);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  // Join room event
  socket.on('joinRoom', (data) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    console.log('📥 Join room request from', socket.id);
    
    try {
      const { roomCode, playerName } = data || {};
      
      const sanitizedCode = (roomCode || '').trim().toUpperCase().substring(0, 4);
      const sanitizedName = sanitizeString(playerName || '');
      
      if (!sanitizedCode || !sanitizedName) {
        console.log('❌ Missing or invalid roomCode/playerName');
        socket.emit('error', { message: 'Valid room code and player name are required' });
        return;
      }

      const room = rooms[sanitizedCode];
      if (!room) {
        console.log('❌ Room not found:', sanitizedCode);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      if (room.players.length >= room.maxPlayers) {
        console.log('❌ Room full:', sanitizedCode);
        socket.emit('error', { message: 'Room is full' });
        return;
      }
      
      if (room.isGameStarted) {
        console.log('❌ Game already started:', sanitizedCode);
        socket.emit('error', { message: 'Game already started' });
        return;
      }

      // Check for duplicate names
      if (room.players.some(p => p.name === sanitizedName)) {
        socket.emit('error', { message: 'Player name already taken' });
        return;
      }
      
      const newPlayer = {
        id: socket.id,
        name: sanitizedName,
        isHost: false,
        isConnected: true
      };
      
      room.players.push(newPlayer);
      playerRooms[socket.id] = sanitizedCode;
      socket.join(sanitizedCode);
      
      console.log('✅ Player joined:', sanitizedName, 'in', sanitizedCode);
      logRoomState(sanitizedCode);
      
      // Notify the joining player
      socket.emit('roomJoined', { 
        room,
        playerId: socket.id
      });
      
      // Notify all players in the room
      io.to(sanitizedCode).emit('playerJoined', { 
        players: room.players,
        newPlayer
      });
      
    } catch (error) {
      console.error('❌ Error joining room:', error.message);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave room event
  socket.on('leaveRoom', () => {
    console.log('📥 Leave room request from', socket.id);
    handlePlayerLeave(socket.id);
  });

  // Start game event
  socket.on('startGame', (gameSettings) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { message: 'Rate limit exceeded' });
      return;
    }

    console.log('📥 Start game request from', socket.id);
    
    try {
      const roomCode = playerRooms[socket.id];
      if (!roomCode) {
        console.log('❌ Player not in room:', socket.id);
        socket.emit('error', { message: 'Not in a room' });
        return;
      }
      
      const room = rooms[roomCode];
      if (!room) {
        console.log('❌ Room not found:', roomCode);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !player.isHost) {
        console.log('❌ Only host can start game');
        socket.emit('error', { message: 'Only host can start game' });
        return;
      }
      
      if (room.players.length < 2) {
        console.log('❌ Need at least 2 players');
        socket.emit('error', { message: 'Need at least 2 players to start' });
        return;
      }
      
      room.isGameStarted = true;
      room.gameState = gameSettings;
      
      console.log('✅ Game started in', roomCode, 'with', room.players.length, 'players');
      
      io.to(roomCode).emit('gameStarted', { 
        gameSettings,
        players: room.players
      });
      
    } catch (error) {
      console.error('❌ Error starting game:', error.message);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Game message relay
  socket.on('gameMessage', (message) => {
    if (!checkRateLimit(socket.id)) {
      return; // Silent rate limit for game messages
    }

    const roomCode = playerRooms[socket.id];
    if (roomCode) {
      // Add fromPlayerId for compatibility with frontend
      const enhancedMessage = {
        ...message,
        fromPlayerId: socket.id
      };
      socket.to(roomCode).emit('gameMessage', {
        ...enhancedMessage
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnect:', socket.id, '(' + reason + ')');
    handlePlayerLeave(socket.id);
    rateLimits.delete(socket.id);
  });

  // Catch-all for unknown events (simplified logging)
  socket.onAny((eventName, ...args) => {
    const knownEvents = ['ping', 'createRoom', 'joinRoom', 'leaveRoom', 'startGame', 'gameMessage', 'disconnect'];
    if (!knownEvents.includes(eventName)) {
      console.log('📥 Unknown event:', eventName, 'from', socket.id);
    }
  });
});

// Helper function to handle player leaving
function handlePlayerLeave(socketId) {
  const roomCode = playerRooms[socketId];
  if (!roomCode) return;
  
  const room = rooms[roomCode];
  if (!room) {
    delete playerRooms[socketId];
    return;
  }
  
  console.log('👋 Player leaving:', socketId, 'from', roomCode);
  
  // Remove player from room
  const leavingPlayer = room.players.find(p => p.id === socketId);
  room.players = room.players.filter(p => p.id !== socketId);
  delete playerRooms[socketId];
  
  // If room is empty, delete it
  if (room.players.length === 0) {
    console.log('🗑️ Deleting empty room:', roomCode);
    delete rooms[roomCode];
    return;
  }
  
  // If host left, assign new host
  if (leavingPlayer && leavingPlayer.isHost && room.players.length > 0) {
    room.players[0].isHost = true;
    room.hostId = room.players[0].id;
    console.log('👑 New host:', room.players[0].name);
  }
  
  logRoomState(roomCode);
  
  // Notify remaining players
  io.to(roomCode).emit('playerLeft', { 
    players: room.players,
    leftPlayer: leavingPlayer
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    rooms: Object.keys(rooms).length,
    totalPlayers: Object.keys(playerRooms).length,
    connectedSockets: io.engine.clientsCount,
    uptime: Math.floor(process.uptime()),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get room info endpoint
app.get('/rooms/:roomCode', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const room = rooms[roomCode];
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    roomCode: room.id,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    isGameStarted: room.isGameStarted,
    gameType: room.gameType,
    players: room.players.map(p => ({ name: p.name, isHost: p.isHost }))
  });
});

// Debug endpoint
app.get('/debug/rooms', (req, res) => {
  res.json({
    rooms: Object.keys(rooms).map(roomCode => ({
      roomCode,
      playerCount: rooms[roomCode].players.length,
      players: rooms[roomCode].players.map(p => ({ name: p.name, isHost: p.isHost })),
      isGameStarted: rooms[roomCode].isGameStarted
    })),
    totalRooms: Object.keys(rooms).length,
    totalPlayers: Object.keys(playerRooms).length,
    connectedSockets: io.engine.clientsCount
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
  console.log('🌐 CORS enabled for all origins');
  console.log('🔗 Frontend URL:', process.env.FRONTEND_URL || 'Not specified');
  console.log('📊 Environment:', process.env.NODE_ENV || 'development');
  
  // Log server stats every 5 minutes instead of 30 seconds
  setInterval(() => {
    const stats = {
      activeRooms: Object.keys(rooms).length,
      totalPlayers: Object.keys(playerRooms).length,
      connectedSockets: io.engine.clientsCount,
      uptime: Math.floor(process.uptime() / 60) + 'm'
    };
    console.log('📊 Stats:', stats);
    
    // Clean up old rate limit entries
    const now = Date.now();
    for (const [socketId, requests] of rateLimits.entries()) {
      const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
      if (recentRequests.length === 0) {
        rateLimits.delete(socketId);
      } else {
        rateLimits.set(socketId, recentRequests);
      }
    }
  }, 300000); // 5 minutes
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});