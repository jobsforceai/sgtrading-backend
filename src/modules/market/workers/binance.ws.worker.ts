import WebSocket from 'ws';
import redisClient from '../../../config/redis';
import logger from '../../../common/utils/logger';
import { STOCK_SYMBOLS } from '../market.config';
import { CandleService } from '../candle.service';
import { config } from '../../../config/config';

const PRICE_KEY = (symbol: string) => `price:BINANCE:${symbol.toLowerCase()}`;
const CONTROL_CHANNEL = 'market-control-channel';

const candleService = new CandleService();

// Use a Map to store active WebSocket connections, keyed by symbol
const activeSubscriptions = new Map<string, WebSocket>();

const subscribeToSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();

  // Filter out symbols that are handled by other workers
  if (lowerSymbol.includes('_')) {
    // OANDA symbols (e.g. eur_usd)
    return; 
  }
  if (STOCK_SYMBOLS.map((s: string) => s.toLowerCase()).includes(lowerSymbol)) {
    // Stock symbols (e.g. aapl)
    return;
  }

  if (activeSubscriptions.has(lowerSymbol)) {
    logger.warn({ symbol: lowerSymbol }, 'Already subscribed to this symbol.');
    return;
  }

  const url = `${config.binance.wsUrl}/ws/${lowerSymbol}@trade`;
  const ws = new WebSocket(url);

  ws.on('open', () => {
    logger.info({ symbol: lowerSymbol, url }, 'Binance WS connected for symbol');
    activeSubscriptions.set(lowerSymbol, ws);
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (!msg || !msg.s || !msg.p) return;

      const price = parseFloat(msg.p);
      const ts = msg.E ? Number(msg.E) : Date.now();
      const tick = { symbol: msg.s.toLowerCase(), last: price, ts };

      // 1. Store in Redis for REST API polling
      await redisClient.set(PRICE_KEY(tick.symbol), JSON.stringify(tick));

      // 2. Publish to a ticks channel for our own socket.io server to broadcast
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));

      // 3. Persist Candle History (Fire and Forget)
      candleService.updateCandle(tick.symbol.toUpperCase(), price, parseFloat(msg.q || '0'))
        .catch(err => logger.error({ err, symbol: tick.symbol }, 'Failed to update candle history'));

    } catch (err) {
      logger.error({ err, symbol: lowerSymbol }, 'Error processing Binance WS message');
    }
  });

  ws.on('close', (code, reason) => {
    logger.warn({ code, reason: reason.toString(), symbol: lowerSymbol }, 'Binance WS closed for symbol. It will be reopened on next subscribe request.');
    activeSubscriptions.delete(lowerSymbol);
  });

  ws.on('error', (err) => {
    logger.error({ err, symbol: lowerSymbol }, 'Binance WS error for symbol');
    ws.close();
  });
};

const unsubscribeFromSymbol = (symbol: string) => {
  const lowerSymbol = symbol.toLowerCase();
  const ws = activeSubscriptions.get(lowerSymbol);
  if (ws) {
    logger.info({ symbol: lowerSymbol }, 'Unsubscribing from symbol');
    ws.close();
    activeSubscriptions.delete(lowerSymbol);
  }
};

export const startBinanceWsWorker = () => {
  logger.info('Binance worker started. Listening for commands on Redis channel...');

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
