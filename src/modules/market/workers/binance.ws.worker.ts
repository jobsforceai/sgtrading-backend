import WebSocket from 'ws';
import redisClient from '../../../config/redis';
import logger from '../../../common/utils/logger';
import { STOCK_SYMBOLS, SYNTHETIC_SYMBOLS } from '../market.config';
import { CandleService } from '../candle.service';

const PRICE_KEY = (symbol: string) => `price:BINANCE:${symbol.toLowerCase()}`;
const CONTROL_CHANNEL = 'market-control-channel';
const WS_URL = 'wss://stream.binance.com:9443/stream';

const candleService = new CandleService();

// Track subscribed symbols
const subscribedSymbols = new Set<string>();
const pendingSubscribe = new Set<string>();
const pendingUnsubscribe = new Set<string>();

let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let flushTimeout: NodeJS.Timeout | null = null;

const isValidBinanceSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  // Filter out symbols that are handled by other workers
  if (lowerSymbol.includes('_')) return false; // OANDA
  if (STOCK_SYMBOLS.map((s: string) => s.toLowerCase()).includes(lowerSymbol)) return false;
  if (SYNTHETIC_SYMBOLS.map((s: string) => s.toLowerCase()).includes(lowerSymbol)) return false;
  return true;
};

const flushSubscriptionBuffer = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Process Subscribes
  if (pendingSubscribe.size > 0) {
    const params = Array.from(pendingSubscribe).map(s => `${s}@trade`);
    const msg = {
      method: 'SUBSCRIBE',
      params,
      id: Date.now()
    };
    ws.send(JSON.stringify(msg));
    logger.info({ count: pendingSubscribe.size, symbols: params.join(',') }, 'Sent Batched Subscription to Binance');
    pendingSubscribe.clear();
  }

  // Process Unsubscribes
  if (pendingUnsubscribe.size > 0) {
    const params = Array.from(pendingUnsubscribe).map(s => `${s}@trade`);
    const msg = {
      method: 'UNSUBSCRIBE',
      params,
      id: Date.now()
    };
    ws.send(JSON.stringify(msg));
    logger.info({ count: pendingUnsubscribe.size }, 'Sent Batched Unsubscription to Binance');
    pendingUnsubscribe.clear();
  }
  
  flushTimeout = null;
};

const scheduleFlush = () => {
  if (flushTimeout) return;
  flushTimeout = setTimeout(flushSubscriptionBuffer, 500); // Wait 500ms to collect burst requests
};

const connect = () => {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  logger.info('Connecting to Binance Combined Stream...');
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    logger.info('Binance Combined Stream Connected.');
    
    // Start Heartbeat (Keep-Alive)
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.ping(); // Send standard WS Ping frame
        }
    }, 30000); // 30s interval

    // Resubscribe to all tracked symbols upon connection
    // We treat this as a fresh batch
    if (subscribedSymbols.size > 0) {
      subscribedSymbols.forEach(s => pendingSubscribe.add(s));
      scheduleFlush();
    }
  });

  ws.on('pong', () => {
      // logger.debug('Received Pong from Binance');
  });

  ws.on('message', async (raw) => {
    try {
      const payload = JSON.parse(raw.toString());
      
      if (payload.result === null && payload.id) {
        return;
      }

      const data = payload.data;
      if (!data || !data.s || !data.p) return;

      const price = parseFloat(data.p);
      const ts = data.E ? Number(data.E) : Date.now();
      const symbol = data.s.toLowerCase();
      const volume = parseFloat(data.q || '0');

      const tick = { symbol, last: price, ts };

      // 1. Store in Redis for REST API polling
      await redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick), { EX: 60 });

      // 2. Publish to a ticks channel
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));

      // 3. Persist Candle History (Using Buffer now)
      candleService.updateCandle(symbol.toUpperCase(), price, volume)
        .catch(err => logger.error({ err, symbol }, 'Failed to update candle history'));

    } catch (err) {
      logger.error({ err }, 'Error processing Binance message');
    }
  });

  ws.on('close', (code, reason) => {
    logger.warn({ code, reason: reason.toString() }, 'Binance WS Closed. Reconnecting in 5s...');
    
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    
    ws = null;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    logger.error({ err }, 'Binance WS Error');
    ws?.close();
  });
};

const subscribeToSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  if (!isValidBinanceSymbol(lowerSymbol)) return;

  if (subscribedSymbols.has(lowerSymbol)) return;
  
  subscribedSymbols.add(lowerSymbol);
  
  // Add to pending batch
  pendingSubscribe.add(lowerSymbol);
  // If it was pending unsubscribe, cancel that
  pendingUnsubscribe.delete(lowerSymbol);
  
  scheduleFlush();
  
  if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
  }
};

const unsubscribeFromSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  if (!subscribedSymbols.has(lowerSymbol)) return;

  subscribedSymbols.delete(lowerSymbol);
  
  // Add to pending batch
  pendingUnsubscribe.add(lowerSymbol);
  // If it was pending subscribe, cancel that
  pendingSubscribe.delete(lowerSymbol);

  scheduleFlush();
};

export const startBinanceWsWorker = () => {
  logger.info('Binance worker started (Single Connection Mode). Listening for commands...');

  // Start connection
  connect();

  // Create a dedicated Redis client for subscribing
  const subscriber = redisClient.duplicate();
  subscriber.connect();

  subscriber.subscribe(CONTROL_CHANNEL, (message) => {
    try {
      const { action, symbol } = JSON.parse(message);
      if (!symbol) return;

      if (action === 'subscribe') {
        subscribeToSymbol(symbol);
      } else if (action === 'unsubscribe') {
        unsubscribeFromSymbol(symbol);
      }
    } catch (err) {
      logger.error({ err, message }, 'Error processing control channel message');
    }
  });
};
