const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());

// Store rooms and their players
const rooms = {};
const playerRooms = {}; // Track which room each player is in

// Utility function to generate room codes
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Utility function to log room state
function logRoomState(roomId) {
  const room = rooms[roomId];
  if (room) {
    console.log(`🏠 Room ${roomId} state:`, {
      playerCount: room.players.length,
      players: room.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      isGameStarted: room.isGameStarted
    });
  }
}

io.on('connection', (socket) => {
  console.log('🔌 New socket connection:', socket.id);

  // Heartbeat ping/pong
  socket.on('ping', () => {
    console.log('💓 Ping received from', socket.id);
    socket.emit('pong');
  });

  // Create room event - FIXED: using 'createRoom' to match frontend
  socket.on('createRoom', ({ hostName, maxPlayers = 8, gameType = 'crazy-bridge' }) => {
    console.log('📥 Received "createRoom" from', socket.id, 'with:', { hostName, maxPlayers, gameType });
    
    let roomCode = generateRoomCode();
    
    // Ensure room code is unique
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }
    
    const hostPlayer = {
      id: socket.id,
      name: hostName,
      isHost: true,
      isConnected: true
    };
    
    rooms[roomCode] = {
      id: roomCode,
      hostId: socket.id,
      players: [hostPlayer],
      gameState: null,
      isGameStarted: false,
      maxPlayers,
      gameType,
      createdAt: new Date()
    };
    
    playerRooms[socket.id] = roomCode;
    socket.join(roomCode);
    
    console.log('🏠 Room created:', roomCode, 'by host:', hostName);
    logRoomState(roomCode);
    
    // FIXED: Send response that matches what frontend expects
    socket.emit('roomCreated', { 
      roomCode, 
      playerId: socket.id,
      room: rooms[roomCode]
    });
    
    console.log('📤 Sent "roomCreated" response to', socket.id);
  });

  // Join room event - FIXED: using 'joinRoom' to match frontend
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    console.log('📥 Received "joinRoom" from', socket.id, 'with:', { roomCode, playerName });
    
    const room = rooms[roomCode];
    if (!room) {
      console.log('❌ Room not found:', roomCode);
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players.length >= room.maxPlayers) {
      console.log('❌ Room full:', roomCode);
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    if (room.isGameStarted) {
      console.log('❌ Game already started in room:', roomCode);
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    
    const newPlayer = {
      id: socket.id,
      name: playerName,
      isHost: false,
      isConnected: true
    };
    
    room.players.push(newPlayer);
    playerRooms[socket.id] = roomCode;
    socket.join(roomCode);
    
    console.log('👤 Player joined room:', playerName, 'in', roomCode);
    logRoomState(roomCode);
    
    // Notify the joining player
    socket.emit('roomJoined', { 
      room,
      playerId: socket.id
    });
    
    // Notify all players in the room
    io.to(roomCode).emit('playerJoined', { 
      players: room.players,
      newPlayer
    });
    
    console.log('📤 Sent "roomJoined" and "playerJoined" responses');
  });

  // Leave room event
  socket.on('leaveRoom', () => {
    console.log('📥 Received "leaveRoom" from', socket.id);
    handlePlayerLeave(socket.id);
  });

  // Start game event
  socket.on('startGame', (gameSettings) => {
    console.log('📥 Received "startGame" from', socket.id, 'with:', gameSettings);
    
    const roomCode = playerRooms[socket.id];
    if (!roomCode) {
      console.log('❌ Player not in any room:', socket.id);
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    const room = rooms[roomCode];
    if (!room) {
      console.log('❌ Room not found for player:', socket.id);
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      console.log('❌ Only host can start game:', socket.id);
      socket.emit('error', { message: 'Only host can start game' });
      return;
    }
    
    if (room.players.length < 2) {
      console.log('❌ Need at least 2 players to start:', roomCode);
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }
    
    room.isGameStarted = true;
    room.gameState = gameSettings;
    
    console.log('🎮 Game started in room:', roomCode, 'with', room.players.length, 'players');
    logRoomState(roomCode);
    
    io.to(roomCode).emit('gameStarted', { 
      gameSettings,
      players: room.players
    });
    
    console.log('📤 Sent "gameStarted" to room:', roomCode);
  });

  // Game message relay
  socket.on('gameMessage', (message) => {
    console.log('📥 Received "gameMessage" from', socket.id, ':', message);
    
    const roomCode = playerRooms[socket.id];
    if (!roomCode) {
      console.log('❌ Player not in any room for game message:', socket.id);
      return;
    }
    
    // Broadcast to all other players in the room
    socket.to(roomCode).emit('gameMessage', {
      ...message,
      fromPlayerId: socket.id
    });
    
    console.log('📤 Relayed game message to room:', roomCode);
  });

  // Play card event
  socket.on('playCard', (cardData) => {
    console.log('📥 Received "playCard" from', socket.id, ':', cardData);
    
    const roomCode = playerRooms[socket.id];
    if (roomCode) {
      socket.to(roomCode).emit('cardPlayed', {
        playerId: socket.id,
        card: cardData
      });
      console.log('📤 Relayed card play to room:', roomCode);
    }
  });

  // Place bid event
  socket.on('placeBid', (bidData) => {
    console.log('📥 Received "placeBid" from', socket.id, ':', bidData);
    
    const roomCode = playerRooms[socket.id];
    if (roomCode) {
      socket.to(roomCode).emit('bidPlaced', {
        playerId: socket.id,
        bid: bidData
      });
      console.log('📤 Relayed bid to room:', roomCode);
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', socket.id, 'reason:', reason);
    handlePlayerLeave(socket.id);
  });

  // Log any unhandled events for debugging
  socket.onAny((eventName, ...args) => {
    const knownEvents = ['ping', 'createRoom', 'joinRoom', 'leaveRoom', 'startGame', 'gameMessage', 'playCard', 'placeBid', 'disconnect'];
    if (!knownEvents.includes(eventName)) {
      console.log('📥 Received unknown event "' + eventName + '" from', socket.id, ':', args);
    }
  });
});

// Helper function to handle player leaving
function handlePlayerLeave(socketId) {
  const roomCode = playerRooms[socketId];
  if (!roomCode) return;
  
  const room = rooms[roomCode];
  if (!room) return;
  
  console.log('👋 Player leaving room:', socketId, 'from', roomCode);
  
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
    console.log('👑 New host assigned:', room.players[0].name, 'in room', roomCode);
  }
  
  logRoomState(roomCode);
  
  // Notify remaining players
  io.to(roomCode).emit('playerLeft', { 
    players: room.players,
    leftPlayer: leavingPlayer
  });
  
  console.log('📤 Sent "playerLeft" to room:', roomCode);
}

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    rooms: Object.keys(rooms).length,
    totalPlayers: Object.keys(playerRooms).length,
    connectedSockets: io.engine.clientsCount
  });
});

// Get room info endpoint
app.get('/rooms/:roomCode', (req, res) => {
  const roomCode = req.params.roomCode.toUpperCase();
  const room = rooms[roomCode];
  
  console.log('🔍 Room info requested for:', roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    roomCode: room.id,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    isGameStarted: room.isGameStarted,
    gameType: room.gameType
  });
});

// Debug endpoint to see all rooms
app.get('/debug/rooms', (req, res) => {
  console.log('🔍 Debug rooms requested');
  res.json({
    rooms: Object.keys(rooms).map(roomCode => ({
      roomCode,
      playerCount: rooms[roomCode].players.length,
      players: rooms[roomCode].players.map(p => ({ name: p.name, isHost: p.isHost })),
      isGameStarted: rooms[roomCode].isGameStarted
    })),
    totalRooms: Object.keys(rooms).length,
    totalPlayers: Object.keys(playerRooms).length
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
  console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
  console.log('🌐 CORS enabled for all origins');
  
  // Log server stats every 30 seconds
  setInterval(() => {
    const stats = {
      activeRooms: Object.keys(rooms).length,
      totalPlayers: Object.keys(playerRooms).length,
      connectedSockets: io.engine.clientsCount,
      timestamp: new Date().toISOString()
    };
    console.log('📊 Server stats:', stats);
  }, 30000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('🛑 Server closed');
    process.exit(0);
  });
});