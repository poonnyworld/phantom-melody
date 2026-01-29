import mongoose from 'mongoose';

// Connection state constants - export for use in other files
export const MONGODB_CONNECTED = 1 as const; // mongoose.ConnectionStates.connected
export const MONGODB_DISCONNECTED = 0 as const; // mongoose.ConnectionStates.disconnected

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      console.error('❌ MONGO_URI is not defined in environment variables');
      console.error('⚠️  Bot will continue running but database features will not work.');
      return;
    }

    // Check if already connected
    if (mongoose.connection.readyState === MONGODB_CONNECTED) {
      console.log('✓ MongoDB already connected');
      return;
    }

    // Normalize connection string - use 127.0.0.1 instead of localhost to avoid IPv6 issues
    let normalizedURI = mongoURI;
    if (normalizedURI.includes('localhost')) {
      normalizedURI = normalizedURI.replace('localhost', '127.0.0.1');
      console.log(`[MongoDB] Normalized connection string (localhost -> 127.0.0.1)`);
    }

    // Connection options for better reliability
    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
      bufferCommands: false, // Don't buffer commands if not connected - fail fast
      retryWrites: true, // Enable retry writes
    };

    // Set up connection event handlers BEFORE connecting
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
      // Try to reconnect after 5 seconds
      setTimeout(() => {
        if (mongoose.connection.readyState === MONGODB_DISCONNECTED) {
          console.log('[MongoDB] Attempting to reconnect...');
          connectDB().catch((error) => {
            console.error('[MongoDB] Reconnection failed:', error);
          });
        }
      }, 5000);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✓ MongoDB reconnected');
    });

    console.log(`[MongoDB] Attempting to connect to MongoDB...`);

    // Try to connect with retry logic
    let retries = 3;
    let lastError: Error | null = null;

    while (retries > 0) {
      try {
        await mongoose.connect(normalizedURI, options);
        console.log('✓ MongoDB connected successfully');

        // Handle process termination
        process.on('SIGINT', async () => {
          await mongoose.connection.close();
          console.log('MongoDB connection closed through app termination');
          process.exit(0);
        });

        return; // Success, exit function
      } catch (connectError) {
        lastError = connectError instanceof Error ? connectError : new Error(String(connectError));
        retries--;

        if (retries > 0) {
          console.warn(`[MongoDB] Connection attempt failed, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('Failed to connect to MongoDB after retries');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);

    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('closed')) {
        console.error('');
        console.error('⚠️  MongoDB is not running or not accessible!');
        console.error('');
        console.error('To fix this, you can:');
        console.error('1. Start MongoDB with Docker: docker-compose up -d mongodb');
        console.error('2. Or install MongoDB locally and start the service');
        console.error('3. Or use MongoDB Atlas (cloud) and update MONGO_URI in .env');
        console.error('');
        console.error('⚠️  Bot will continue running but database features will not work.');
        console.error('');
      } else {
        console.error('Error details:', error.message);
      }
    }

    // Don't throw error - let bot continue running without database
    mongoose.set('bufferCommands', false);
  }
};

/**
 * Check if MongoDB is connected
 * @returns true if connected, false otherwise
 */
export const isDBConnected = (): boolean => {
  return mongoose.connection.readyState === MONGODB_CONNECTED;
};
