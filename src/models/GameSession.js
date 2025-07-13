import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  isHost: { type: Boolean, default: false },
  isReady: { type: Boolean, default: false },
  isConnected: { type: Boolean, default: true },
  joinedAt: { type: Date, default: Date.now },
  finalScore: { type: Number, default: 0 },
  finalPosition: { type: Number, default: 0 }
});

const gameSessionSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    length: 4
  },
  hostId: {
    type: String,
    required: true
  },
  players: [playerSchema],
  maxPlayers: {
    type: Number,
    default: 8,
    min: 2,
    max: 10
  },
  gameState: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  gameData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  settings: {
    gameLength: {
      type: Number,
      enum: [7, 10, 12],
      default: 10
    },
    language: {
      type: String,
      enum: ['en', 'pt'],
      default: 'en'
    },
    autoStart: {
      type: Boolean,
      default: false
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  startedAt: {
    type: Date,
    default: null
  },
  finishedAt: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
gameSessionSchema.index({ roomCode: 1 });
gameSessionSchema.index({ hostId: 1 });
gameSessionSchema.index({ gameState: 1 });
gameSessionSchema.index({ lastActivity: 1 });

// TTL index to automatically delete old sessions after 24 hours of inactivity
gameSessionSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 86400 });

// Methods
gameSessionSchema.methods.addPlayer = function(playerData) {
  if (this.players.length >= this.maxPlayers) {
    throw new Error('Room is full');
  }
  
  if (this.players.some(p => p.id === playerData.id)) {
    throw new Error('Player already in room');
  }
  
  this.players.push(playerData);
  this.lastActivity = new Date();
  return this.save();
};

gameSessionSchema.methods.removePlayer = function(playerId) {
  const playerIndex = this.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) {
    return this.save();
  }
  
  const removedPlayer = this.players[playerIndex];
  this.players.splice(playerIndex, 1);
  
  // If host left and there are other players, assign new host
  if (removedPlayer.isHost && this.players.length > 0) {
    this.players[0].isHost = true;
    this.hostId = this.players[0].id;
  }
  
  this.lastActivity = new Date();
  return this.save();
};

gameSessionSchema.methods.updatePlayerReady = function(playerId, isReady) {
  const player = this.players.find(p => p.id === playerId);
  if (!player) {
    throw new Error('Player not found');
  }
  
  player.isReady = isReady;
  this.lastActivity = new Date();
  return this.save();
};

gameSessionSchema.methods.updatePlayerConnection = function(playerId, isConnected) {
  const player = this.players.find(p => p.id === playerId);
  if (!player) {
    return this.save();
  }
  
  player.isConnected = isConnected;
  this.lastActivity = new Date();
  return this.save();
};

gameSessionSchema.methods.startGame = function(gameData) {
  this.gameState = 'playing';
  this.gameData = gameData;
  this.startedAt = new Date();
  this.lastActivity = new Date();
  return this.save();
};

gameSessionSchema.methods.endGame = function(results) {
  this.gameState = 'finished';
  this.finishedAt = new Date();
  this.lastActivity = new Date();
  
  // Update player final scores and positions
  if (results && results.finalScores) {
    results.finalScores.forEach((scoreData, index) => {
      const player = this.players.find(p => p.id === scoreData.id);
      if (player) {
        player.finalScore = scoreData.score;
        player.finalPosition = index + 1;
      }
    });
  }
  
  return this.save();
};

// Static methods
gameSessionSchema.statics.generateRoomCode = async function() {
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
    
    const existing = await this.findOne({ roomCode: code });
    if (!existing) break;
    
  } while (attempts < maxAttempts);

  if (attempts >= maxAttempts) {
    throw new Error('Unable to generate unique room code');
  }

  return code;
};

gameSessionSchema.statics.cleanupInactiveSessions = async function() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
  const result = await this.deleteMany({
    lastActivity: { $lt: cutoff },
    gameState: { $in: ['waiting', 'finished'] }
  });
  
  console.log(`🧹 Cleaned up ${result.deletedCount} inactive game sessions`);
  return result;
};

export const GameSession = mongoose.model('GameSession', gameSessionSchema);