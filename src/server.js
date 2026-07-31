import http from 'http';
import app from './app.js';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket.js';
import { closeRedisClients, createRedisClients } from './config/redis.js';

// Import enterprise models to ensure they are registered before sync
import './modules/message_receipt/message_receipt.model.js';
import './modules/message_reaction/message_reaction.model.js';
import './modules/message_deletion/message_deletion.model.js';
import './modules/audit_log/audit_log.model.js';
let httpServer;
let io;
let shuttingDown = false;

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();
    await createRedisClients();

    // 2. Wrap Express app in a raw http.Server so Socket.IO can share the port
    httpServer = http.createServer(app);

    // 3. Attach Socket.IO (online presence, real-time message delivery)
    io = initSocket(httpServer);

    // 4. Expose io globally so services can broadcast messages after DB writes
    //    Usage in service: import { getIO } from '../../socket.js'; getIO().to(...)
    app.set('io', io);

    // 5. Start listening
    httpServer.listen(env.port, () => {
      console.log(`🚀 Server running in ${env.nodeEnv} mode on port ${env.port}`);
      console.log(`🔌 Socket.IO attached — real-time presence & messaging active`);
    });

  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing server resources...`);
  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  try {
    if (io) await new Promise((resolve) => io.close(resolve));
    if (httpServer?.listening) await new Promise((resolve) => httpServer.close(resolve));
    await closeRedisClients();
    process.exitCode = 0;
  } catch (error) {
    console.error('Failed to shut down cleanly:', error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExit);
  }
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
});
