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
  transports: ['websocket', 'polling'],
  allowEIO3: true
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
    console.log('📥 Create room request from', socket.id);
    
    try {
      const { hostName, maxPlayers = 8, gameType = 'crazy-bridge' } = data || {};
      
      if (!hostName) {
        console.log('❌ Missing hostName');
        socket.emit('error', { message: 'Host name is required' });
        return;
      }

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
      
      console.log('✅ Room created:', roomCode, 'by', hostName);
      
      const response = { 
        roomCode, 
        playerId: socket.id,
        room: rooms[roomCode]
      };
      
      socket.emit('roomCreated', response);
      
    } catch (error) {
      console.error('❌ Error creating room:', error.message);
      socket.emit('error', { message: 'Failed to create room: ' + error.message });
    }
  });

  // Join room event
  socket.on('joinRoom', (data) => {
    console.log('📥 Join room request from', socket.id);
    
    try {
      const { roomCode, playerName } = data || {};
      
      if (!roomCode || !playerName) {
        console.log('❌ Missing roomCode or playerName');
        socket.emit('error', { message: 'Room code and player name are required' });
        return;
      }

      const room = rooms[roomCode.toUpperCase()];
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
        console.log('❌ Game already started:', roomCode);
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
      playerRooms[socket.id] = roomCode.toUpperCase();
      socket.join(roomCode.toUpperCase());
      
      console.log('✅ Player joined:', playerName, 'in', roomCode);
      logRoomState(roomCode.toUpperCase());
      
      // Notify the joining player
      socket.emit('roomJoined', { 
        room,
        playerId: socket.id
      });
      
      // Notify all players in the room
      io.to(roomCode.toUpperCase()).emit('playerJoined', { 
        players: room.players,
        newPlayer
      });
      
    } catch (error) {
      console.error('❌ Error joining room:', error.message);
      socket.emit('error', { message: 'Failed to join room: ' + error.message });
    }
  });

  // Leave room event
  socket.on('leaveRoom', () => {
    console.log('📥 Leave room request from', socket.id);
    handlePlayerLeave(socket.id);
  });

  // Start game event
  socket.on('startGame', (gameSettings) => {
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
      socket.emit('error', { message: 'Failed to start game: ' + error.message });
    }
  });

  // Game message relay
  socket.on('gameMessage', (message) => {
    const roomCode = playerRooms[socket.id];
    if (roomCode) {
      socket.to(roomCode).emit('gameMessage', {
        ...message,
        fromPlayerId: socket.id
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnect:', socket.id, '(' + reason + ')');
    handlePlayerLeave(socket.id);
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
    uptime: Math.floor(process.uptime())
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
  
  // Log server stats every 5 minutes instead of 30 seconds
  setInterval(() => {
    const stats = {
      activeRooms: Object.keys(rooms).length,
      totalPlayers: Object.keys(playerRooms).length,
      connectedSockets: io.engine.clientsCount,
      uptime: Math.floor(process.uptime() / 60) + 'm'
    };
    console.log('📊 Stats:', stats);
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