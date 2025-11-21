import { Server, Socket } from 'socket.io';
import http from 'http';
import redisClient from '../config/redis';
import logger from '../common/utils/logger';
import { MarketCacheService } from '../modules/market/marketCache.service';

const CONTROL_CHANNEL = 'market-control-channel';
const TICKS_CHANNEL = 'market-ticks-channel';

// In-memory store to track which symbols have active subscriptions
const activeSubscriptions = new Map<string, number>(); // symbol -> count
const marketCache = new MarketCacheService();

const handleSubscribe = async (socket: Socket, symbol: string) => {
  logger.info({ clientId: socket.id, symbol }, 'Client subscribing');
  const room = `market:${symbol}`;
  socket.join(room);

  // Immediately fetch and emit the latest cached tick so the user sees data instantly
  try {
    const tick = await marketCache.getTick(symbol);
    if (tick) {
      socket.emit('market:tick', tick);
    }
  } catch (error) {
    logger.error({ err: error, symbol }, 'Failed to fetch initial tick for subscriber');
  }

  const currentCount = activeSubscriptions.get(symbol) || 0;
  if (currentCount === 0) {
    // First subscriber for this symbol, tell the workers to start fetching
    redisClient.publish(CONTROL_CHANNEL, JSON.stringify({ action: 'subscribe', symbol }));
  }
  activeSubscriptions.set(symbol, currentCount + 1);
};

const handleUnsubscribe = (socket: Socket, symbol: string) => {
  logger.info({ clientId: socket.id, symbol }, 'Client unsubscribing');
  const room = `market:${symbol}`;
  socket.leave(room);

  const currentCount = activeSubscriptions.get(symbol) || 1;
  if (currentCount === 1) {
    // Last subscriber for this symbol, tell the workers to stop fetching
    redisClient.publish(CONTROL_CHANNEL, JSON.stringify({ action: 'unsubscribe', symbol }));
    activeSubscriptions.delete(symbol);
  } else {
    activeSubscriptions.set(symbol, currentCount - 1);
  }
};

export const initSocketServer = (server: http.Server) => {
  const io = new Server(server, { cors: { origin: '*' } });

  // Subscribe to the ticks channel to receive data from workers
  const subscriber = redisClient.duplicate();
  subscriber.connect();
  subscriber.subscribe(TICKS_CHANNEL, (message) => {
    try {
      const tick = JSON.parse(message);
      const room = `market:${tick.symbol}`;
      
      // Broadcast to the specific room for that symbol
      io.to(room).emit('market:tick', tick); // Emit tick as is
    } catch (err) {
      logger.error({ err, message }, 'Error processing tick from Redis channel');
    }
  });

  io.on('connection', (socket) => {
    logger.info({ clientId: socket.id }, 'Client connected to WebSocket');
    const subscribedSymbols = new Set<string>();

    socket.on('market:subscribe', (symbol: string) => {
      if (symbol && !subscribedSymbols.has(symbol)) {
        handleSubscribe(socket, symbol);
        subscribedSymbols.add(symbol);
      }
    });

    socket.on('market:unsubscribe', (symbol: string) => {
      if (symbol && subscribedSymbols.has(symbol)) {
        handleUnsubscribe(socket, symbol);
        subscribedSymbols.delete(symbol);
      }
    });

    socket.on('disconnect', () => {
      logger.info({ clientId: socket.id }, 'Client disconnected');
      // Unsubscribe from all symbols this client was subscribed to
      subscribedSymbols.forEach(symbol => handleUnsubscribe(socket, symbol));
    });
  });

  logger.info('Socket.IO server initialized and listening for subscriptions');
  return io;
};
