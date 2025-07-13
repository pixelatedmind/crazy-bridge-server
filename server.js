import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { connectDatabase } from './src/config/database.js';
import { RoomManager } from './src/managers/RoomManager.js';
import { PlayerManager } from './src/managers/PlayerManager.js';
import { GameManager } from './src/managers/GameManager.js';
import { setupRoutes } from './src/routes/index.js';
import { setupSocketHandlers } from './src/socket/handlers.js';
import { rateLimiter } from './src/middleware/rateLimiter.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Get allowed origins from environment
const getAllowedOrigins = () => {
  const origins = process.env.ALLOWED_ORIGINS;
  if (origins) {
    return origins.split(',').map(origin => origin.trim());
  }
  
  // Default origins for development
  return process.env.NODE_ENV === 'production' 
    ? ['https://crazy-bridge-client.netlify.app']
    : ['http://localhost:5173', 'http://localhost:3000'];
};

const allowedOrigins = getAllowedOrigins();
console.log('🌐 Allowed origins:', allowedOrigins);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow WebSocket connections
}));
app.use(compression());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api', rateLimiter);

// Connect to database
await connectDatabase();

// Initialize managers
const roomManager = new RoomManager();
const playerManager = new PlayerManager();
const gameManager = new GameManager(roomManager, playerManager);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    rooms: roomManager.getRoomCount(),
    players: playerManager.getPlayerCount()
  });
});

// Setup API routes
setupRoutes(app, roomManager, playerManager, gameManager);

// Setup Socket.IO handlers
setupSocketHandlers(io, roomManager, playerManager, gameManager);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Cleanup on shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  roomManager.cleanup();
  const { disconnectDatabase } = await import('./src/config/database.js');
  await disconnectDatabase();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  roomManager.cleanup();
  const { disconnectDatabase } = await import('./src/config/database.js');
  await disconnectDatabase();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Crazy Bridge Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: ${process.env.MONGODB_URI ? 'MongoDB Atlas' : 'Local MongoDB'}`);
  console.log(`🎮 Ready for multiplayer connections!`);
});

export { app, server, io };