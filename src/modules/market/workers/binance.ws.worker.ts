import WebSocket from 'ws';
import axios from 'axios';
import redisClient from '../../../config/redis';
import logger from '../../../common/utils/logger';
import { STOCK_SYMBOLS, SYNTHETIC_SYMBOLS } from '../market.config';
import { CandleService } from '../candle.service';
import { config } from '../../../config/config';

const PRICE_KEY = (symbol: string) => `price:BINANCE:${symbol.toLowerCase()}`;
const CONTROL_CHANNEL = 'market-control-channel';

const candleService = new CandleService();

// Store active subscriptions: key = symbol, value = { type: 'WS' | 'POLL', ref: WebSocket | NodeJS.Timeout }
interface Subscription {
  type: 'WS' | 'POLL';
  ref: WebSocket | NodeJS.Timeout;
}
const activeSubscriptions = new Map<string, Subscription>();

const startPolling = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  
  // Clear any existing sub
  if (activeSubscriptions.has(lowerSymbol)) {
    const sub = activeSubscriptions.get(lowerSymbol);
    if (sub?.type === 'POLL') return; // Already polling
    if (sub?.type === 'WS') (sub.ref as WebSocket).close();
  }

  logger.info({ symbol: lowerSymbol }, 'Starting REST Polling Fallback for symbol');

  const pollInterval = setInterval(async () => {
    try {
      // https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT
      const url = `${config.binance.apiUrl}/ticker/price`;
      const res = await axios.get(url, { 
          params: { symbol: lowerSymbol.toUpperCase() },
          timeout: 2000 
      });
      
      if (res.data && res.data.price) {
          const price = parseFloat(res.data.price);
          const tick = { symbol: lowerSymbol, last: price, ts: Date.now() };

          await redisClient.set(PRICE_KEY(tick.symbol), JSON.stringify(tick));
          await redisClient.publish('market-ticks-channel', JSON.stringify(tick));
          
          // Fire and forget persistence
          candleService.updateCandle(tick.symbol.toUpperCase(), price, 0)
            .catch(err => logger.error({ err, symbol: tick.symbol }, 'Failed to update candle history (Poll)'));
      }
    } catch (error: any) {
        logger.warn({ err: error.message, symbol: lowerSymbol }, 'Polling failed, retrying...');
    }
  }, 2000); // Poll every 2 seconds

  activeSubscriptions.set(lowerSymbol, { type: 'POLL', ref: pollInterval });
};

const subscribeToSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();

  if (lowerSymbol.includes('_') || 
      STOCK_SYMBOLS.map((s: string) => s.toLowerCase()).includes(lowerSymbol) ||
      SYNTHETIC_SYMBOLS.map((s: string) => s.toLowerCase()).includes(lowerSymbol)) {
    return;
  }

  if (activeSubscriptions.has(lowerSymbol)) {
    return;
  }

  // Default: Try WebSocket First
  const wsUrl = `${config.binance.wsUrl}/ws/${lowerSymbol}@aggTrade`; // Using aggTrade for better reliability
  logger.info({ symbol: lowerSymbol, url: wsUrl }, 'Attempting Binance WS connection');
  
  const ws = new WebSocket(wsUrl);

  // Connection Watchdog: If no message in 10s, kill and switch to Poll
  let watchdog = setTimeout(() => {
      logger.warn({ symbol: lowerSymbol }, 'WS Watchdog Timeout (No Data). Switching to Polling.');
      ws.terminate();
      startPolling(lowerSymbol);
  }, 10000);

  ws.on('open', () => {
    logger.info({ symbol: lowerSymbol }, 'Binance WS Connected');
    activeSubscriptions.set(lowerSymbol, { type: 'WS', ref: ws });
  });

  ws.on('message', async (raw) => {
    clearTimeout(watchdog);
    // Reset watchdog on every message
    watchdog = setTimeout(() => {
        logger.warn({ symbol: lowerSymbol }, 'WS Silent for 10s. Switching to Polling.');
        ws.terminate(); // This triggers on('close') which handles cleanup/retry logic? 
        // Actually, we should call startPolling directly or let close handle it.
        // Let's call polling directly to be sure.
        startPolling(lowerSymbol); 
    }, 10000);

    try {
      const msg = JSON.parse(raw.toString());
      // aggTrade format: { e: 'aggTrade', s: 'BTCUSDT', p: '91000.00', ... }
      if (!msg || !msg.p) return;

      const price = parseFloat(msg.p);
      const ts = msg.E ? Number(msg.E) : Date.now();
      const tick = { symbol: lowerSymbol, last: price, ts };

      await redisClient.set(PRICE_KEY(tick.symbol), JSON.stringify(tick));
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));

      candleService.updateCandle(tick.symbol.toUpperCase(), price, parseFloat(msg.q || '0'))
        .catch(err => {});

    } catch (err) {
      logger.error({ err, symbol: lowerSymbol }, 'Error processing Binance WS message');
    }
  });

  ws.on('close', (code, reason) => {
    clearTimeout(watchdog);
    logger.warn({ code, reason: reason.toString(), symbol: lowerSymbol }, 'Binance WS Closed.');
    
    // If it was a deliberate close (e.g. unsubscribe), do nothing.
    // If it was an error/timeout, allow fallback.
    // However, our `unsubscribe` deletes from the map.
    // So if it's still in the map, it was an accidental close -> Switch to Polling.
    if (activeSubscriptions.has(lowerSymbol)) {
        const sub = activeSubscriptions.get(lowerSymbol);
        if (sub?.type === 'WS' && sub.ref === ws) {
             logger.info({ symbol: lowerSymbol }, 'Connection lost unexpectedly. Switching to REST Polling Fallback.');
             startPolling(lowerSymbol);
        }
    }
  });

  ws.on('error', (err) => {
    clearTimeout(watchdog);
    logger.error({ err: err.message, symbol: lowerSymbol }, 'Binance WS Error');
    // 'close' event usually follows error, so logic there handles fallback
  });
};

const unsubscribeFromSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  const sub = activeSubscriptions.get(lowerSymbol);
  
  if (sub) {
    logger.info({ symbol: lowerSymbol }, 'Unsubscribing');
    if (sub.type === 'WS') {
        (sub.ref as WebSocket).close();
    } else {
        clearInterval(sub.ref as NodeJS.Timeout);
    }
    activeSubscriptions.delete(lowerSymbol);
  }
};

export const startBinanceWsWorker = () => {
  logger.info('Binance worker started. Listening for commands on Redis channel...');

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
