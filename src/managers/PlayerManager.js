import { EventEmitter } from 'events';

export class PlayerManager extends EventEmitter {
  constructor() {
    super();
    this.players = new Map();
    this.socketToPlayer = new Map();
  }

  createPlayer(socketId, playerData) {
    const playerId = this.generatePlayerId();
    
    const player = {
      id: playerId,
      socketId: socketId,
      name: playerData.name || `Player ${this.players.size + 1}`,
      roomCode: null,
      isConnected: true,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      stats: {
        gamesPlayed: 0,
        gamesWon: 0,
        totalScore: 0
      }
    };

    this.players.set(playerId, player);
    this.socketToPlayer.set(socketId, playerId);

    console.log(`👤 Player ${player.name} (${playerId}) created`);
    this.emit('playerCreated', { player });

    return player;
  }

  generatePlayerId() {
    return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getPlayer(playerId) {
    return this.players.get(playerId);
  }

  getPlayerBySocket(socketId) {
    const playerId = this.socketToPlayer.get(socketId);
    return playerId ? this.players.get(playerId) : null;
  }

  updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    Object.assign(player, updates);
    player.lastActivity = Date.now();

    this.emit('playerUpdated', { player, updates });
    return player;
  }

  updatePlayerSocket(playerId, newSocketId) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Remove old socket mapping
    if (player.socketId) {
      this.socketToPlayer.delete(player.socketId);
    }

    // Update player and create new mapping
    player.socketId = newSocketId;
    player.isConnected = true;
    player.lastActivity = Date.now();
    this.socketToPlayer.set(newSocketId, playerId);

    console.log(`🔌 Player ${player.name} socket updated`);
    this.emit('playerSocketUpdated', { player, newSocketId });

    return player;
  }

  setPlayerRoom(playerId, roomCode) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    player.roomCode = roomCode;
    player.lastActivity = Date.now();

    this.emit('playerRoomChanged', { player, roomCode });
    return player;
  }

  disconnectPlayer(socketId) {
    const playerId = this.socketToPlayer.get(socketId);
    if (!playerId) {
      return null;
    }

    const player = this.players.get(playerId);
    if (!player) {
      return null;
    }

    player.isConnected = false;
    player.lastActivity = Date.now();
    this.socketToPlayer.delete(socketId);

    console.log(`👋 Player ${player.name} disconnected`);
    this.emit('playerDisconnected', { player });

    // Schedule player cleanup after 5 minutes of disconnection
    setTimeout(() => {
      if (!player.isConnected) {
        this.removePlayer(playerId);
      }
    }, 5 * 60 * 1000);

    return player;
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    this.players.delete(playerId);
    if (player.socketId) {
      this.socketToPlayer.delete(player.socketId);
    }

    console.log(`🗑️ Player ${player.name} removed`);
    this.emit('playerRemoved', { player });

    return true;
  }

  updatePlayerStats(playerId, gameResult) {
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    player.stats.gamesPlayed++;
    player.stats.totalScore += gameResult.score || 0;
    
    if (gameResult.won) {
      player.stats.gamesWon++;
    }

    player.lastActivity = Date.now();

    this.emit('playerStatsUpdated', { player, gameResult });
    return player;
  }

  getPlayerCount() {
    return this.players.size;
  }

  getConnectedPlayers() {
    return Array.from(this.players.values()).filter(player => player.isConnected);
  }

  getPlayersInRoom(roomCode) {
    return Array.from(this.players.values()).filter(player => player.roomCode === roomCode);
  }

  cleanup() {
    this.players.clear();
    this.socketToPlayer.clear();
    console.log('🧹 PlayerManager cleaned up');
  }
}