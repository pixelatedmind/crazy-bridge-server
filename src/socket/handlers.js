export function setupSocketHandlers(io, roomManager, playerManager, gameManager) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    let currentPlayer = null;
    let currentRoom = null;

    // Handle player authentication/creation
    socket.on('player:authenticate', async (data, callback) => {
      try {
        const { playerId, playerName } = data;

        if (playerId) {
          // Existing player reconnecting
          currentPlayer = playerManager.getPlayer(playerId);
          if (currentPlayer) {
            playerManager.updatePlayerSocket(playerId, socket.id);
            
            // Rejoin room if they were in one
            if (currentPlayer.roomCode) {
              const room = roomManager.getRoom(currentPlayer.roomCode);
              if (room) {
                roomManager.updatePlayerConnection(currentPlayer.roomCode, playerId, true, socket.id);
                socket.join(currentPlayer.roomCode);
                currentRoom = currentPlayer.roomCode;
                
                // Notify room of reconnection
                socket.to(currentRoom).emit('player:reconnected', {
                  player: currentPlayer,
                  room: room
                });
              }
            }
          }
        }

        if (!currentPlayer && playerName) {
          // New player
          currentPlayer = playerManager.createPlayer(socket.id, { name: playerName });
        }

        if (!currentPlayer) {
          throw new Error('Failed to authenticate player');
        }

        callback({ success: true, player: currentPlayer });

      } catch (error) {
        console.error('Authentication error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle room joining
    socket.on('room:join', async (data, callback) => {
      try {
        const { roomCode, playerId } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        const normalizedRoomCode = roomCode.toUpperCase();
        
        // Join room
        const { room, player } = roomManager.joinRoom(normalizedRoomCode, playerId, {
          name: currentPlayer.name,
          socketId: socket.id
        });

        // Join socket room
        socket.join(normalizedRoomCode);
        currentRoom = normalizedRoomCode;

        // Update player room
        playerManager.setPlayerRoom(playerId, normalizedRoomCode);

        // Notify room of new player
        socket.to(normalizedRoomCode).emit('player:joined', {
          player,
          room: {
            code: room.code,
            players: Array.from(room.players.values()),
            gameState: room.gameState
          }
        });

        callback({ 
          success: true, 
          room: {
            code: room.code,
            hostId: room.hostId,
            players: Array.from(room.players.values()),
            maxPlayers: room.maxPlayers,
            gameState: room.gameState,
            settings: room.settings
          }
        });

      } catch (error) {
        console.error('Room join error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle room leaving
    socket.on('room:leave', async (data, callback) => {
      try {
        const { roomCode, playerId } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        const normalizedRoomCode = roomCode.toUpperCase();
        const success = roomManager.leaveRoom(normalizedRoomCode, playerId);

        if (success) {
          socket.leave(normalizedRoomCode);
          currentRoom = null;
          playerManager.setPlayerRoom(playerId, null);

          // Notify room of player leaving
          socket.to(normalizedRoomCode).emit('player:left', {
            playerId,
            playerName: currentPlayer.name
          });
        }

        callback({ success });

      } catch (error) {
        console.error('Room leave error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle player ready state
    socket.on('player:ready', async (data, callback) => {
      try {
        const { roomCode, playerId, isReady } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        const room = roomManager.updatePlayerReady(roomCode, playerId, isReady);

        // Notify room of ready state change
        io.to(roomCode).emit('player:ready_changed', {
          playerId,
          isReady,
          room: {
            code: room.code,
            players: Array.from(room.players.values()),
            gameState: room.gameState
          }
        });

        callback({ success: true });

      } catch (error) {
        console.error('Player ready error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle game start
    socket.on('game:start', async (data, callback) => {
      try {
        const { roomCode, playerId } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        const gameState = await gameManager.startGame(roomCode, playerId);

        // Notify room that game started
        io.to(roomCode).emit('game:started', { gameState });

        callback({ success: true, gameState });

      } catch (error) {
        console.error('Game start error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle game actions
    socket.on('game:action', async (data, callback) => {
      try {
        const { roomCode, playerId, action } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        const gameState = await gameManager.processGameAction(roomCode, playerId, action);

        // Notify room of game state update
        io.to(roomCode).emit('game:state_updated', { gameState, action });

        callback({ success: true, gameState });

      } catch (error) {
        console.error('Game action error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle chat messages
    socket.on('chat:message', async (data, callback) => {
      try {
        const { roomCode, playerId, message } = data;

        if (!currentPlayer || currentPlayer.id !== playerId) {
          throw new Error('Player not authenticated');
        }

        if (!message || message.trim().length === 0) {
          throw new Error('Message cannot be empty');
        }

        const chatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          playerId,
          playerName: currentPlayer.name,
          message: message.trim(),
          timestamp: Date.now()
        };

        // Broadcast to room
        io.to(roomCode).emit('chat:message', chatMessage);

        callback({ success: true });

      } catch (error) {
        console.error('Chat message error:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);

      if (currentPlayer) {
        const disconnectedPlayer = playerManager.disconnectPlayer(socket.id);
        
        if (disconnectedPlayer && currentRoom) {
          roomManager.updatePlayerConnection(currentRoom, disconnectedPlayer.id, false);
          
          // Notify room of disconnection
          socket.to(currentRoom).emit('player:disconnected', {
            playerId: disconnectedPlayer.id,
            playerName: disconnectedPlayer.name
          });

          // Handle game disconnection if in active game
          gameManager.handlePlayerDisconnection(currentRoom, disconnectedPlayer.id);
        }
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Listen to manager events and broadcast to rooms
  roomManager.on('playerJoined', ({ roomCode, player, room }) => {
    io.to(roomCode).emit('room:player_joined', {
      player,
      room: {
        code: room.code,
        players: Array.from(room.players.values()),
        gameState: room.gameState
      }
    });
  });

  roomManager.on('playerLeft', ({ roomCode, player, room }) => {
    io.to(roomCode).emit('room:player_left', {
      playerId: player.id,
      playerName: player.name,
      room: {
        code: room.code,
        players: Array.from(room.players.values()),
        gameState: room.gameState
      }
    });
  });

  roomManager.on('hostChanged', ({ roomCode, newHost, room }) => {
    io.to(roomCode).emit('room:host_changed', {
      newHost,
      room: {
        code: room.code,
        players: Array.from(room.players.values()),
        gameState: room.gameState
      }
    });
  });

  roomManager.on('allPlayersReady', ({ roomCode, room }) => {
    io.to(roomCode).emit('room:all_ready', {
      room: {
        code: room.code,
        players: Array.from(room.players.values()),
        gameState: room.gameState
      }
    });
  });

  gameManager.on('gameStarted', ({ roomCode, gameState }) => {
    io.to(roomCode).emit('game:started', { gameState });
  });

  gameManager.on('gameStateUpdated', ({ roomCode, gameState, action }) => {
    io.to(roomCode).emit('game:state_updated', { gameState, action });
  });

  gameManager.on('gameEnded', ({ roomCode, results, gameState }) => {
    io.to(roomCode).emit('game:ended', { results, gameState });
  });

  gameManager.on('gamePaused', ({ roomCode, reason }) => {
    io.to(roomCode).emit('game:paused', { reason });
  });

  console.log('🔌 Socket handlers initialized');
}