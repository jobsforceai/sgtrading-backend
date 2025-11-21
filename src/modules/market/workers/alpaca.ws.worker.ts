import WebSocket from 'ws';
import axios from 'axios';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis';

const STOCK_SYMBOLS = ['AAPL', 'TSLA', 'GLD'];
const CRYPTO_SYMBOLS = ['BTC/USD']; // Using a crypto symbol for 24/7 testing
const PRICE_KEY = (symbol: string) => `price:ALPACA:${symbol.toLowerCase()}`;

const primeCacheWithLatestTrade = async (symbol: string) => {
  try {
    const isCrypto = symbol.includes('/');
    // Corrected endpoints based on latest Alpaca API docs
    const endpoint = isCrypto ? '/v1beta3/crypto/us/latest/trades' : '/v2/stocks/trades/latest';
    
    // Ensure no double slashes if dataApiUrl has trailing slash
    const baseUrl = config.alpaca.dataApiUrl.replace(/\/$/, '');
    const url = `${baseUrl}${endpoint}`;

    const headers = {
      'APCA-API-KEY-ID': config.alpaca.apiKeyId,
      'APCA-API-SECRET-KEY': config.alpaca.secretKey,
    };
    const params = { symbols: symbol };

    const response = await axios.get(url, { headers, params });
    
    // Stocks API returns { trades: { "AAPL": { ... } } }
    // Crypto API returns { trades: { "BTC/USD": { ... } } }
    const tradeData = response.data.trades || response.data.latestTrades; 
    
    if (!tradeData) {
        logger.warn({ symbol, data: response.data }, 'No trade data structure found in Alpaca response');
        return;
    }

    const trade = tradeData[symbol];

    if (trade) {
      const tick = {
        symbol: (trade.S || symbol).toLowerCase(), // Use original symbol for crypto
        last: isCrypto ? parseFloat(trade.p) : trade.p, // Price is 'p' (string) for crypto, 'p' (number) for stocks
        ts: new Date(trade.t).getTime(), // Timestamp is 't'
      };
      await redisClient.set(PRICE_KEY(tick.symbol), JSON.stringify(tick));
      // Publish to ticks channel for real-time frontend updates
      await redisClient.publish('market-ticks-channel', JSON.stringify(tick));
      logger.info({ symbol: tick.symbol, price: tick.last }, `Primed Redis with latest trade for ${tick.symbol}`);
    } else {
        logger.warn({ symbol, tradeData }, 'Symbol not found in Alpaca trade response');
    }
  } catch (error) {
     // log the full error response if available to debug 404s or other issues
     if (axios.isAxiosError(error) && error.response) {
         logger.error({ status: error.response.status, data: error.response.data, url: error.config?.url }, `Failed to prime cache for ${symbol}`);
     } else {
         logger.error({ err: error, symbol }, `Failed to prime cache for ${symbol}`);
     }
  }
};

// Generic connection function for any Alpaca WebSocket
const connect = (streamType: 'stocks' | 'crypto') => {
  const symbols = streamType === 'stocks' ? STOCK_SYMBOLS : CRYPTO_SYMBOLS;
  
  let url = config.alpaca.dataWsUrl;
  if (streamType === 'crypto') {
      // Hardcode the correct crypto stream URL as the pattern /v2/crypto is incorrect (404)
      // The correct endpoint for Alpaca Crypto stream is v1beta3/crypto/us
      url = 'wss://stream.data.alpaca.markets/v1beta3/crypto/us';
  }

  logger.info({ url, symbols }, `Connecting to Alpaca ${streamType} WebSocket`);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    logger.info(`Alpaca ${streamType} WS connected, authenticating...`);
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
          logger.info(`Alpaca ${streamType} WS authenticated, subscribing and priming cache...`);
          for (const symbol of symbols) {
            await primeCacheWithLatestTrade(symbol);
          }
          ws.send(JSON.stringify({ action: 'subscribe', trades: symbols }));
        } else if (msg.T === 't' || msg.T === 'b') { // 't' for stock trades, 'b' for crypto trades
          const symbol = msg.S.toLowerCase();
          const price = parseFloat(msg.p); // Price is 'p' for crypto, 'P' for stocks
          const ts = new Date(msg.t).getTime();
          const tick = { symbol, last: price, ts };
          redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick));
          redisClient.publish('market-ticks-channel', JSON.stringify(tick));
        } else if (msg.T === 'error') {
          logger.error({ error: msg, stream: streamType }, 'Alpaca WS error message');
        } else if (msg.T === 'subscription') {
          logger.info({ subscriptions: msg.trades, stream: streamType }, 'Alpaca WS subscription confirmed');
        }
      }
    } catch (err) {
      logger.error({ err, raw: raw.toString(), stream: streamType }, 'Error processing Alpaca WS message');
    }
  });

  ws.on('close', (code, reason) => {
    logger.warn({ code, reason: reason.toString(), stream: streamType }, `Alpaca ${streamType} WS closed, reconnecting...`);
    setTimeout(() => connect(streamType), 3000);
  });

  ws.on('error', (err) => {
    logger.error({ err, stream: streamType }, `Alpaca ${streamType} WS error`);
    ws.close();
  });
};

export const startAlpacaWsWorker = () => {
  connect('stocks');
  connect('crypto');
};
