import { Router } from 'express';

export function setupRoutes(app, roomManager, playerManager, gameManager) {
  const router = Router();

  // Room routes
  router.post('/rooms/create', async (req, res) => {
    try {
      const { playerName, gameSettings = {} } = req.body;

      if (!playerName || playerName.trim().length === 0) {
        return res.status(400).json({ error: 'Player name is required' });
      }

      // Create player first
      const player = playerManager.createPlayer(null, { name: playerName.trim() });
      
      // Create room
      const room = roomManager.createRoom(player.id, {
        maxPlayers: gameSettings.maxPlayers || 8,
        gameLength: gameSettings.gameLength || 10,
        language: gameSettings.language || 'en',
        autoStart: gameSettings.autoStart || false
      });

      // Add player to room
      const { room: updatedRoom } = roomManager.joinRoom(room.code, player.id, {
        name: player.name,
        socketId: null
      });

      playerManager.setPlayerRoom(player.id, room.code);

      res.json({
        success: true,
        roomCode: room.code,
        playerId: player.id,
        room: {
          code: updatedRoom.code,
          hostId: updatedRoom.hostId,
          players: Array.from(updatedRoom.players.values()),
          maxPlayers: updatedRoom.maxPlayers,
          gameState: updatedRoom.gameState,
          settings: updatedRoom.settings
        }
      });

    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/rooms/join', async (req, res) => {
    try {
      const { roomCode, playerName } = req.body;

      if (!roomCode || !playerName) {
        return res.status(400).json({ error: 'Room code and player name are required' });
      }

      const normalizedRoomCode = roomCode.toUpperCase().trim();
      
      if (normalizedRoomCode.length !== 4) {
        return res.status(400).json({ error: 'Room code must be 4 characters' });
      }

      // Create player
      const player = playerManager.createPlayer(null, { name: playerName.trim() });

      // Join room
      const { room, player: roomPlayer } = roomManager.joinRoom(normalizedRoomCode, player.id, {
        name: player.name,
        socketId: null
      });

      playerManager.setPlayerRoom(player.id, normalizedRoomCode);

      res.json({
        success: true,
        playerId: player.id,
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
      console.error('Error joining room:', error);
      
      let statusCode = 500;
      if (error.message === 'Room not found') statusCode = 404;
      else if (error.message === 'Room is full') statusCode = 409;
      else if (error.message === 'Game already in progress') statusCode = 409;
      else if (error.message === 'Player already in room') statusCode = 409;

      res.status(statusCode).json({ error: error.message });
    }
  });

  router.get('/rooms/:code', async (req, res) => {
    try {
      const roomCode = req.params.code.toUpperCase();
      const room = roomManager.getRoom(roomCode);

      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      res.json({
        success: true,
        room: {
          code: room.code,
          hostId: room.hostId,
          players: Array.from(room.players.values()),
          maxPlayers: room.maxPlayers,
          gameState: room.gameState,
          settings: room.settings,
          gameData: room.gameData
        }
      });

    } catch (error) {
      console.error('Error getting room:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/rooms/:code', async (req, res) => {
    try {
      const roomCode = req.params.code.toUpperCase();
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID is required' });
      }

      const room = roomManager.getRoom(roomCode);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      const player = room.players.get(playerId);
      if (!player || !player.isHost) {
        return res.status(403).json({ error: 'Only the host can delete the room' });
      }

      roomManager.deleteRoom(roomCode);

      res.json({ success: true, message: 'Room deleted successfully' });

    } catch (error) {
      console.error('Error deleting room:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Player routes
  router.get('/players/:id', async (req, res) => {
    try {
      const playerId = req.params.id;
      const player = playerManager.getPlayer(playerId);

      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }

      res.json({
        success: true,
        player: {
          id: player.id,
          name: player.name,
          roomCode: player.roomCode,
          isConnected: player.isConnected,
          stats: player.stats
        }
      });

    } catch (error) {
      console.error('Error getting player:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Game routes
  router.post('/games/:roomCode/start', async (req, res) => {
    try {
      const roomCode = req.params.roomCode.toUpperCase();
      const { playerId } = req.body;

      if (!playerId) {
        return res.status(400).json({ error: 'Player ID is required' });
      }

      const gameState = await gameManager.startGame(roomCode, playerId);

      res.json({
        success: true,
        gameState
      });

    } catch (error) {
      console.error('Error starting game:', error);
      
      let statusCode = 500;
      if (error.message === 'Room not found') statusCode = 404;
      else if (error.message === 'Only the host can start the game') statusCode = 403;
      else if (error.message === 'Need at least 2 players to start') statusCode = 400;
      else if (error.message === 'All players must be ready to start') statusCode = 400;
      else if (error.message === 'Game already started or finished') statusCode = 409;

      res.status(statusCode).json({ error: error.message });
    }
  });

  router.get('/games/:roomCode', async (req, res) => {
    try {
      const roomCode = req.params.roomCode.toUpperCase();
      const game = gameManager.getActiveGame(roomCode);

      if (!game) {
        return res.status(404).json({ error: 'No active game found' });
      }

      res.json({
        success: true,
        gameState: game.gameState
      });

    } catch (error) {
      console.error('Error getting game state:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Stats routes
  router.get('/stats', async (req, res) => {
    try {
      const stats = {
        rooms: {
          total: roomManager.getRoomCount(),
          active: roomManager.getActiveRooms()
        },
        players: {
          total: playerManager.getPlayerCount(),
          connected: playerManager.getConnectedPlayers().length
        },
        games: {
          active: gameManager.getActiveGameCount()
        }
      };

      res.json({ success: true, stats });

    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use('/api', router);
}