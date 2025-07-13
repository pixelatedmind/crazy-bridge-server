import { EventEmitter } from 'events';

export class RoomManager extends EventEmitter {
  constructor() {
    super();
    this.rooms = new Map();
    this.roomCodes = new Set();
    this.cleanupInterval = setInterval(() => this.cleanupInactiveRooms(), 60000); // Check every minute
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      attempts++;
    } while (this.roomCodes.has(code) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      throw new Error('Unable to generate unique room code');
    }

    return code;
  }

  createRoom(hostPlayerId, options = {}) {
    const roomCode = this.generateRoomCode();
    const room = {
      code: roomCode,
      hostId: hostPlayerId,
      players: new Map(),
      maxPlayers: options.maxPlayers || 8,
      gameState: 'waiting', // waiting, playing, finished
      gameData: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      settings: {
        gameLength: options.gameLength || 10,
        language: options.language || 'en',
        autoStart: options.autoStart || false
      }
    };

    this.rooms.set(roomCode, room);
    this.roomCodes.add(roomCode);

    console.log(`🏠 Room ${roomCode} created by player ${hostPlayerId}`);
    this.emit('roomCreated', { roomCode, hostId: hostPlayerId });

    return room;
  }

  joinRoom(roomCode, playerId, playerData) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.players.size >= room.maxPlayers) {
      throw new Error('Room is full');
    }

    if (room.gameState === 'playing') {
      throw new Error('Game already in progress');
    }

    // Check if player is already in room
    if (room.players.has(playerId)) {
      throw new Error('Player already in room');
    }

    const player = {
      id: playerId,
      name: playerData.name || `Player ${room.players.size + 1}`,
      isHost: playerId === room.hostId,
      isReady: false,
      isConnected: true,
      joinedAt: Date.now(),
      socketId: playerData.socketId
    };

    room.players.set(playerId, player);
    room.lastActivity = Date.now();

    console.log(`👤 Player ${player.name} joined room ${roomCode}`);
    this.emit('playerJoined', { roomCode, player, room });

    return { room, player };
  }

  leaveRoom(roomCode, playerId) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      return false;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return false;
    }

    room.players.delete(playerId);
    room.lastActivity = Date.now();

    console.log(`👋 Player ${player.name} left room ${roomCode}`);
    this.emit('playerLeft', { roomCode, player, room });

    // If host left and there are other players, assign new host
    if (player.isHost && room.players.size > 0) {
      const newHost = Array.from(room.players.values())[0];
      newHost.isHost = true;
      room.hostId = newHost.id;
      
      console.log(`👑 ${newHost.name} is now host of room ${roomCode}`);
      this.emit('hostChanged', { roomCode, newHost, room });
    }

    // If room is empty, schedule for deletion
    if (room.players.size === 0) {
      setTimeout(() => {
        if (this.rooms.has(roomCode) && this.rooms.get(roomCode).players.size === 0) {
          this.deleteRoom(roomCode);
        }
      }, 30000); // 30 second grace period
    }

    return true;
  }

  deleteRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return false;
    }

    this.rooms.delete(roomCode);
    this.roomCodes.delete(roomCode);

    console.log(`🗑️ Room ${roomCode} deleted`);
    this.emit('roomDeleted', { roomCode, room });

    return true;
  }

  getRoom(roomCode) {
    return this.rooms.get(roomCode);
  }

  getRoomByPlayerId(playerId) {
    for (const [roomCode, room] of this.rooms) {
      if (room.players.has(playerId)) {
        return { roomCode, room };
      }
    }
    return null;
  }

  updatePlayerReady(roomCode, playerId, isReady) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    const player = room.players.get(playerId);
    if (!player) {
      throw new Error('Player not found in room');
    }

    player.isReady = isReady;
    room.lastActivity = Date.now();

    console.log(`${isReady ? '✅' : '❌'} Player ${player.name} ${isReady ? 'ready' : 'not ready'} in room ${roomCode}`);
    this.emit('playerReadyChanged', { roomCode, player, room });

    // Check if all players are ready
    const allReady = Array.from(room.players.values()).every(p => p.isReady);
    if (allReady && room.players.size >= 2) {
      this.emit('allPlayersReady', { roomCode, room });
    }

    return room;
  }

  updatePlayerConnection(roomCode, playerId, isConnected, socketId = null) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return false;
    }

    const player = room.players.get(playerId);
    if (!player) {
      return false;
    }

    player.isConnected = isConnected;
    if (socketId) {
      player.socketId = socketId;
    }
    room.lastActivity = Date.now();

    console.log(`🔌 Player ${player.name} ${isConnected ? 'connected' : 'disconnected'} in room ${roomCode}`);
    this.emit('playerConnectionChanged', { roomCode, player, room });

    return true;
  }

  startGame(roomCode, gameData) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.gameState !== 'waiting') {
      throw new Error('Game already started or finished');
    }

    room.gameState = 'playing';
    room.gameData = gameData;
    room.lastActivity = Date.now();

    console.log(`🎮 Game started in room ${roomCode}`);
    this.emit('gameStarted', { roomCode, room, gameData });

    return room;
  }

  updateGameState(roomCode, gameData) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    room.gameData = gameData;
    room.lastActivity = Date.now();

    this.emit('gameStateUpdated', { roomCode, room, gameData });

    return room;
  }

  endGame(roomCode, results) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    room.gameState = 'finished';
    room.gameData = { ...room.gameData, results };
    room.lastActivity = Date.now();

    // Reset player ready states
    room.players.forEach(player => {
      player.isReady = false;
    });

    console.log(`🏁 Game ended in room ${roomCode}`);
    this.emit('gameEnded', { roomCode, room, results });

    return room;
  }

  resetRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    room.gameState = 'waiting';
    room.gameData = null;
    room.lastActivity = Date.now();

    // Reset all players to not ready
    room.players.forEach(player => {
      player.isReady = false;
    });

    console.log(`🔄 Room ${roomCode} reset`);
    this.emit('roomReset', { roomCode, room });

    return room;
  }

  cleanupInactiveRooms() {
    const now = Date.now();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [roomCode, room] of this.rooms) {
      if (now - room.lastActivity > inactivityThreshold) {
        console.log(`🧹 Cleaning up inactive room ${roomCode}`);
        this.deleteRoom(roomCode);
      }
    }
  }

  getRoomCount() {
    return this.rooms.size;
  }

  getActiveRooms() {
    return Array.from(this.rooms.entries()).map(([code, room]) => ({
      code,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      gameState: room.gameState,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    }));
  }

  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.rooms.clear();
    this.roomCodes.clear();
    console.log('🧹 RoomManager cleaned up');
  }
}