import mongoose from 'mongoose';

export async function connectDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crazy-bridge';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('📊 Connected to MongoDB');
    
    // Set up cleanup interval for inactive sessions
    setInterval(async () => {
      try {
        const { GameSession } = await import('../models/GameSession.js');
        await GameSession.cleanupInactiveSessions();
      } catch (error) {
        console.error('Error during session cleanup:', error);
      }
    }, 10 * 60 * 1000); // Run every 10 minutes
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

export async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error);
  }
}

// Handle connection events
mongoose.connection.on('error', (error) => {
  console.error('❌ MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.log('📊 MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('📊 MongoDB reconnected');
});