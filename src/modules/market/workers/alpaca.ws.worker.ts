import WebSocket from 'ws';
import axios from 'axios';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis';
import { CandleService } from '../candle.service';

// Expanded list of popular US Stocks & ETFs
const STOCK_SYMBOLS = [
    'AAPL', 'TSLA', 'GLD', 'NVDA', 'AMD', 
    'MSFT', 'GOOGL', 'AMZN', 'META', 'NFLX', 
    'SPY', 'QQQ', 'V', 'JPM'
];

const PRICE_KEY = (symbol: string) => `price:ALPACA:${symbol.toLowerCase()}`;

const candleService = new CandleService();

const primeCacheWithLatestTrade = async (symbol: string) => {
  try {
    const endpoint = '/v2/stocks/trades/latest';
    const baseUrl = config.alpaca.dataApiUrl.replace(/\/$/, '');
    const url = `${baseUrl}${endpoint}`;

    const headers = {
      'APCA-API-KEY-ID': config.alpaca.apiKeyId,
      'APCA-API-SECRET-KEY': config.alpaca.secretKey,
    };
    const params = { symbols: symbol };

    const response = await axios.get(url, { headers, params });
    const tradeData = response.data.trades; 
    
    if (!tradeData) {
        return;
    }

    const trade = tradeData[symbol];

    if (trade) {
      const tick = {
        symbol: symbol.toLowerCase(),
        last: trade.p, 
        ts: new Date(trade.t).getTime(),
      };
      await redisClient.set(PRICE_KEY(tick.symbol), JSON.stringify(tick));
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));
      logger.info({ symbol: tick.symbol, price: tick.last }, `Primed Redis with latest trade`);
    }
  } catch (error) {
     if (axios.isAxiosError(error) && error.response) {
         logger.error({ status: error.response.status, url: error.config?.url }, `Failed to prime cache for ${symbol}`);
     } else {
         logger.error({ err: error, symbol }, `Failed to prime cache for ${symbol}`);
     }
  }
};

const connect = () => {
  // Alpaca IEX (Free) Data Stream
  const url = config.alpaca.dataWsUrl; 

  logger.info({ url, symbols: STOCK_SYMBOLS.length }, `Connecting to Alpaca Stocks WebSocket`);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    logger.info(`Alpaca Stocks WS connected, authenticating...`);
    ws.send(JSON.stringify({
      action: 'auth',
      key: config.alpaca.apiKeyId,
      secret: config.alpaca.secretKey,
    }));
  });

  ws.on('message', async (raw) => {
    try {
      const messages = JSON.parse(raw.toString());
      for (const msg of messages) {
        if (msg.T === 'success' && msg.msg === 'authenticated') {
          logger.info(`Alpaca Stocks WS authenticated. Subscribing to ${STOCK_SYMBOLS.length} symbols...`);
          
          // Prime cache first
          for (const symbol of STOCK_SYMBOLS) {
            await primeCacheWithLatestTrade(symbol);
          }
          
          ws.send(JSON.stringify({ action: 'subscribe', trades: STOCK_SYMBOLS }));

        } else if (msg.T === 't') { // 't' = Trade
          const symbol = msg.S.toLowerCase();
          const price = msg.p; 
          const volume = msg.s || 1; // 's' is size (volume)
          const ts = new Date(msg.t).getTime();
          
          const tick = { symbol, last: price, ts };
          
          // 1. Redis Cache
          redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick), { EX: 60 });
          
          // 2. PubSub for Frontend
          redisClient.publish('market-ticks-channel', JSON.stringify(tick));

          // 3. Persist Candle History (Self-Built)
          candleService.updateCandle(symbol.toUpperCase(), price, volume)
            .catch(err => logger.error({ err, symbol }, 'Failed to update Alpaca candle'));

        } else if (msg.T === 'error') {
          logger.error({ error: msg }, 'Alpaca WS error message');
          if (msg.code === 406) {
              logger.warn('Alpaca Connection Limit Exceeded. Closing socket to trigger retry in 3s.');
              ws.close();
              // Removed process.exit(1) to prevent crashing the entire Render service.
              // The close handler will auto-reconnect.
          }
        } else if (msg.T === 'subscription') {
          logger.info({ count: msg.trades.length }, 'Alpaca WS subscription confirmed');
        }
      }
    } catch (err) {
      logger.error({ err, raw: raw.toString() }, 'Error processing Alpaca WS message');
    }
  });

  ws.on('close', (code, reason) => {
    logger.warn({ code, reason: reason.toString() }, `Alpaca Stocks WS closed, reconnecting...`);
    setTimeout(() => connect(), 3000);
  });

  ws.on('error', (err) => {
    logger.error({ err }, `Alpaca Stocks WS error`);
    ws.close();
  });
};

export const startAlpacaWsWorker = () => {
  if (!config.alpaca.apiKeyId || !config.alpaca.secretKey) {
      logger.warn('Alpaca API Keys missing. Stocks worker NOT starting.');
      return;
  }
  connect();
};