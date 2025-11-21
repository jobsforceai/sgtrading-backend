import WebSocket from 'ws';
import axios from 'axios';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis';
import { CandleService } from '../candle.service';

const PRICE_KEY = (symbol: string) => `price:TWELVEDATA:${symbol.toLowerCase()}`;
const WS_URL = 'wss://ws.twelvedata.com/v1/quotes/price';
const REST_URL = 'https://api.twelvedata.com/quote';

const candleService = new CandleService();

// Symbols to track via TwelveData (Stocks)
const TRACKED_SYMBOLS = ['AAPL', 'TSLA', 'GLD'];

const primeCache = async () => {
  logger.info('Priming TwelveData cache via REST API...');
  try {
    // Fetch quotes for all symbols at once
    const symbolStr = TRACKED_SYMBOLS.join(',');
    const url = `${REST_URL}?symbol=${symbolStr}&apikey=${config.twelvedata.apiKey}`;
    
    const response = await axios.get(url);
    const data = response.data;
    
    // If multiple symbols, response is an object with keys as symbols. 
    // If single symbol, it's the object itself. 
    // Since we track multiple, it should be { AAPL: {...}, TSLA: {...} }
    
    const processQuote = async (quote: any) => {
      if (!quote || !quote.symbol) return;
      
      const symbol = quote.symbol.toLowerCase();
      const price = parseFloat(quote.close); // 'close' is the latest price in /quote endpoint
      const ts = quote.timestamp ? quote.timestamp * 1000 : Date.now();
      
      const tick = {
        symbol,
        last: price,
        ts,
      };

      await redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick));
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));
      logger.info({ symbol, price }, 'Primed TwelveData cache');
    };

    if (data.AAPL || data.TSLA) {
        // It's a map
        for (const key of Object.keys(data)) {
            await processQuote(data[key]);
        }
    } else if (data.symbol) {
        // Single symbol response (edge case if list has 1 item)
        await processQuote(data);
    }

  } catch (error) {
    logger.error({ err: error }, 'Failed to prime TwelveData cache');
  }
};

export const startTwelveDataWsWorker = async () => {
  if (!config.twelvedata.apiKey) {
    logger.warn('TwelveData API key is missing. Worker will not start.');
    return;
  }

  // Prime cache first so data is available immediately
  await primeCache();

  const maskedKey = config.twelvedata.apiKey ? `${config.twelvedata.apiKey.slice(0, 4)}...${config.twelvedata.apiKey.slice(-4)}` : 'missing';
  const wsUrl = `${WS_URL}?apikey=${config.twelvedata.apiKey}`;
  logger.info({ url: `${WS_URL}?apikey=${maskedKey}` }, 'Connecting to TwelveData WS...');

  const ws = new WebSocket(wsUrl);
  let heartbeatInterval: NodeJS.Timeout;

  ws.on('open', () => {
    logger.info('TwelveData WS connected. Sending subscription...');
    // Subscribe to symbols
    const subscribeMsg = {
      action: 'subscribe',
      params: {
        symbols: TRACKED_SYMBOLS.join(','),
      },
    };
    ws.send(JSON.stringify(subscribeMsg));
    logger.info({ symbols: TRACKED_SYMBOLS }, 'Subscribed to TwelveData symbols');

    // Start heartbeat every 10 seconds
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'heartbeat' }));
        // logger.debug('Sent TwelveData heartbeat');
      }
    }, 10000);
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.event === 'price') {
        const symbol = msg.symbol.toLowerCase();
        const price = msg.price;
        const ts = msg.timestamp * 1000; 
        
        const tick = {
          symbol,
          last: price,
          ts: ts, 
        };

        // Store in Redis
        await redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick));
        
        // Publish to channel
        await redisClient.publish('market-ticks-channel', JSON.stringify(tick));
        
        // Persist Candle
        candleService.updateCandle(tick.symbol.toUpperCase(), tick.last, 1)
          .catch(err => logger.error({ err, symbol: tick.symbol }, 'Failed to update candle history'));

        // logger.debug({ symbol, price }, 'TwelveData tick received');
      } else if (msg.event === 'subscribe-status') {
        logger.info({ status: msg }, 'TwelveData subscription status');
      } else if (msg.event === 'error') {
        logger.error({ err: msg }, 'TwelveData WS error message from server');
      } else if (msg.event === 'heartbeat') {
        // logger.debug('TwelveData heartbeat');
      } else {
          logger.debug({ msg }, 'Received unhandled TwelveData message');
      }
    } catch (error) {
      logger.error({ err: error, data: data.toString() }, 'Error processing TwelveData message');
    }
  });

  ws.on('close', (code, reason) => {
    clearInterval(heartbeatInterval);
    logger.warn({ code, reason: reason.toString() }, 'TwelveData WS closed, reconnecting in 5s...');
    setTimeout(startTwelveDataWsWorker, 5000);
  });

  ws.on('error', (error) => {
    clearInterval(heartbeatInterval);
    logger.error({ err: error, message: error.message }, 'TwelveData WS connection error');
    ws.close();
  });
};
