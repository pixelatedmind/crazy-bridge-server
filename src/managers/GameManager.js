import { EventEmitter } from 'events';

export class GameManager extends EventEmitter {
  constructor(roomManager, playerManager) {
    super();
    this.roomManager = roomManager;
    this.playerManager = playerManager;
    this.activeGames = new Map();

    // Listen to room manager events
    this.roomManager.on('allPlayersReady', this.handleAllPlayersReady.bind(this));
    this.roomManager.on('playerLeft', this.handlePlayerLeft.bind(this));
    this.roomManager.on('gameStarted', this.handleGameStarted.bind(this));
  }

  async handleAllPlayersReady({ roomCode, room }) {
    if (room.settings.autoStart) {
      console.log(`🚀 Auto-starting game in room ${roomCode}`);
      await this.startGame(roomCode);
    } else {
      console.log(`✅ All players ready in room ${roomCode}, waiting for host to start`);
      this.emit('readyToStart', { roomCode, room });
    }
  }

  handlePlayerLeft({ roomCode, player, room }) {
    const game = this.activeGames.get(roomCode);
    if (game && room.gameState === 'playing') {
      console.log(`⚠️ Player ${player.name} left during active game in room ${roomCode}`);
      
      // Handle player leaving during game
      this.handlePlayerDisconnection(roomCode, player.id);
    }
  }

  handleGameStarted({ roomCode, room }) {
    console.log(`🎮 Game management started for room ${roomCode}`);
  }

  async startGame(roomCode, hostId = null) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.gameState !== 'waiting') {
      throw new Error('Game already started or finished');
    }

    // Verify host permission if hostId provided
    if (hostId) {
      const host = room.players.get(hostId);
      if (!host || !host.isHost) {
        throw new Error('Only the host can start the game');
      }
    }

    // Check minimum players
    if (room.players.size < 2) {
      throw new Error('Need at least 2 players to start');
    }

    // Check all players are ready
    const allReady = Array.from(room.players.values()).every(p => p.isReady);
    if (!allReady) {
      throw new Error('All players must be ready to start');
    }

    // Initialize game state
    const gameState = this.initializeGameState(room);
    
    // Store active game
    this.activeGames.set(roomCode, {
      roomCode,
      gameState,
      startedAt: Date.now(),
      currentRound: 0,
      phase: 'setup'
    });

    // Update room
    this.roomManager.startGame(roomCode, gameState);

    console.log(`🎮 Game started in room ${roomCode} with ${room.players.size} players`);
    this.emit('gameStarted', { roomCode, room, gameState });

    return gameState;
  }

  initializeGameState(room) {
    const players = Array.from(room.players.values()).map(player => ({
      id: player.id,
      name: player.name,
      isHuman: true, // All multiplayer players are human
      hand: [],
      bid: null,
      actualWins: 0,
      totalScore: 0,
      isConnected: player.isConnected,
      roundHistory: []
    }));

    // Create round sequence based on game length
    const gameLength = room.settings.gameLength || 10;
    const roundSequence = this.createRoundSequence(gameLength);

    return {
      players,
      currentRound: 0,
      totalRounds: roundSequence.length,
      cardsPerRound: roundSequence[0],
      trumpSuit: null,
      trumpCard: null,
      phase: 'setup',
      currentPlayerIndex: 0,
      dealer: 0,
      currentTrick: [],
      currentTrickPlayers: [],
      leadSuit: null,
      trickWinner: null,
      roundSequence,
      deck: [],
      language: room.settings.language || 'en',
      roundHistory: [],
      isMultiplayer: true,
      roomCode: room.code,
      startedAt: Date.now()
    };
  }

  createRoundSequence(startCards) {
    const sequence = [];
    
    // Decreasing phase
    for (let i = startCards; i >= 1; i--) {
      sequence.push(i);
    }
    
    // Increasing phase
    for (let i = 2; i <= startCards; i++) {
      sequence.push(i);
    }
    
    return sequence;
  }

  async processGameAction(roomCode, playerId, action) {
    const game = this.activeGames.get(roomCode);
    if (!game) {
      throw new Error('No active game found');
    }

    const room = this.roomManager.getRoom(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    // Verify player is in the game
    const player = game.gameState.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not in game');
    }

    // Process the action based on type
    let updatedGameState;
    
    switch (action.type) {
      case 'placeBid':
        updatedGameState = await this.processBid(game, playerId, action.bid);
        break;
      case 'playCard':
        updatedGameState = await this.processCardPlay(game, playerId, action.card);
        break;
      case 'nextRound':
        updatedGameState = await this.processNextRound(game);
        break;
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    // Update game state
    game.gameState = updatedGameState;
    this.roomManager.updateGameState(roomCode, updatedGameState);

    // Emit game state update
    this.emit('gameStateUpdated', { roomCode, gameState: updatedGameState, action });

    return updatedGameState;
  }

  async processBid(game, playerId, bid) {
    const gameState = { ...game.gameState };
    
    if (gameState.phase !== 'bidding') {
      throw new Error('Not in bidding phase');
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    if (player.bid !== null) {
      throw new Error('Player has already bid');
    }

    if (bid < 0 || bid > gameState.cardsPerRound) {
      throw new Error('Invalid bid amount');
    }

    // Set player's bid
    player.bid = bid;

    // Check if all players have bid
    const allBidsPlaced = gameState.players.every(p => p.bid !== null);
    
    if (allBidsPlaced) {
      gameState.phase = 'playing';
      gameState.currentPlayerIndex = 0; // Start with first player
    }

    return gameState;
  }

  async processCardPlay(game, playerId, card) {
    const gameState = { ...game.gameState };
    
    if (gameState.phase !== 'playing') {
      throw new Error('Not in playing phase');
    }

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }

    // Validate card is in player's hand
    const cardIndex = currentPlayer.hand.findIndex(c => 
      c.suit === card.suit && c.rank === card.rank
    );
    
    if (cardIndex === -1) {
      throw new Error('Card not in hand');
    }

    // Remove card from hand
    currentPlayer.hand.splice(cardIndex, 1);

    // Add to current trick
    gameState.currentTrick.push(card);
    gameState.currentTrickPlayers.push(playerId);

    // Set lead suit if first card
    if (gameState.currentTrick.length === 1) {
      gameState.leadSuit = card.suit;
    }

    // Check if trick is complete
    if (gameState.currentTrick.length === gameState.players.length) {
      // Determine trick winner
      const winnerId = this.findTrickWinner(
        gameState.currentTrick,
        gameState.currentTrickPlayers,
        gameState.trumpSuit,
        gameState.leadSuit
      );

      const winnerIndex = gameState.players.findIndex(p => p.id === winnerId);
      gameState.players[winnerIndex].actualWins++;
      gameState.trickWinner = winnerId;

      // Check if round is complete
      if (gameState.players[0].hand.length === 0) {
        gameState.phase = 'roundEnd';
        this.calculateRoundScores(gameState);
      } else {
        // Next trick starts with winner
        gameState.currentPlayerIndex = winnerIndex;
        gameState.currentTrick = [];
        gameState.currentTrickPlayers = [];
        gameState.leadSuit = null;
        gameState.trickWinner = null;
      }
    } else {
      // Move to next player
      gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    }

    return gameState;
  }

  async processNextRound(game) {
    const gameState = { ...game.gameState };
    
    if (gameState.phase !== 'roundEnd') {
      throw new Error('Not at end of round');
    }

    // Save round history
    const roundHistory = gameState.players.map(player => ({
      round: gameState.currentRound,
      cardsInRound: gameState.cardsPerRound,
      bid: player.bid || 0,
      actualWins: player.actualWins,
      roundScore: this.calculateScore(player.bid || 0, player.actualWins)
    }));

    gameState.roundHistory.push(roundHistory);

    // Move to next round
    gameState.currentRound++;

    if (gameState.currentRound >= gameState.totalRounds) {
      // Game complete
      gameState.phase = 'gameEnd';
      await this.endGame(game.roomCode, gameState);
    } else {
      // Setup next round
      gameState.cardsPerRound = gameState.roundSequence[gameState.currentRound];
      gameState.phase = 'setup';
      
      // Reset player states
      gameState.players.forEach(player => {
        player.hand = [];
        player.bid = null;
        player.actualWins = 0;
      });

      // Deal new cards (this would be implemented based on your card logic)
      await this.dealCards(gameState);
      gameState.phase = 'bidding';
    }

    return gameState;
  }

  calculateRoundScores(gameState) {
    gameState.players.forEach(player => {
      const roundScore = this.calculateScore(player.bid || 0, player.actualWins);
      player.totalScore += roundScore;
    });
  }

  calculateScore(bid, actualWins) {
    return bid === actualWins ? 10 + actualWins : 0;
  }

  findTrickWinner(trick, players, trumpSuit, leadSuit) {
    // This would implement your card comparison logic
    // For now, return first player as placeholder
    return players[0];
  }

  async dealCards(gameState) {
    // This would implement your card dealing logic
    // For now, just set phase to bidding
    gameState.phase = 'bidding';
  }

  handlePlayerDisconnection(roomCode, playerId) {
    const game = this.activeGames.get(roomCode);
    if (!game) {
      return;
    }

    const player = game.gameState.players.find(p => p.id === playerId);
    if (player) {
      player.isConnected = false;
      
      // Emit player disconnection
      this.emit('playerDisconnected', { roomCode, playerId, gameState: game.gameState });
      
      // Check if game should be paused or ended
      const connectedPlayers = game.gameState.players.filter(p => p.isConnected);
      if (connectedPlayers.length < 2) {
        console.log(`⏸️ Game paused in room ${roomCode} - insufficient connected players`);
        this.emit('gamePaused', { roomCode, reason: 'insufficient_players' });
      }
    }
  }

  async endGame(roomCode, gameState) {
    const game = this.activeGames.get(roomCode);
    if (!game) {
      return;
    }

    // Calculate final results
    const results = {
      winner: this.determineWinner(gameState),
      finalScores: gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.totalScore
      })),
      gameStats: {
        totalRounds: gameState.totalRounds,
        duration: Date.now() - game.startedAt
      }
    };

    // Update player stats
    gameState.players.forEach(player => {
      this.playerManager.updatePlayerStats(player.id, {
        score: player.totalScore,
        won: player.id === results.winner.id
      });
    });

    // End the game in room manager
    this.roomManager.endGame(roomCode, results);

    // Remove from active games
    this.activeGames.delete(roomCode);

    console.log(`🏁 Game ended in room ${roomCode}, winner: ${results.winner.name}`);
    this.emit('gameEnded', { roomCode, results, gameState });

    return results;
  }

  determineWinner(gameState) {
    return gameState.players.reduce((winner, player) => 
      player.totalScore > winner.totalScore ? player : winner
    );
  }

  getActiveGame(roomCode) {
    return this.activeGames.get(roomCode);
  }

  getActiveGameCount() {
    return this.activeGames.size;
  }

  cleanup() {
    this.activeGames.clear();
    console.log('🧹 GameManager cleaned up');
  }
}