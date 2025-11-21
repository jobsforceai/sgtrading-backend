import axios from 'axios';
import { config } from '../../../config/config';
import logger from '../../../common/utils/logger';
import redisClient from '../../../config/redis';
import { ClientRequest } from 'http';
import { CandleService } from '../candle.service';

const PRICE_KEY = (symbol: string) => `price:OANDA:${symbol.toLowerCase()}`;
const CONTROL_CHANNEL = 'market-control-channel';

const candleService = new CandleService();

const activeSubscriptions = new Set<string>();
let currentStream: ClientRequest | null = null;

const connect = () => {
  // If a stream is already running, abort it. We'll start a new one with the updated symbols.
  if (currentStream) {
    logger.info('Restarting OANDA stream with new symbols...');
    currentStream.destroy();
    currentStream = null;
  }

  if (activeSubscriptions.size === 0) {
    logger.info('No active OANDA subscriptions. Stream will not be started.');
    return;
  }

  const symbols = Array.from(activeSubscriptions);
  const url = `${config.oanda.streamUrl}/v3/accounts/${config.oanda.accountId}/pricing/stream`;
  const headers = {
    'Authorization': `Bearer ${config.oanda.apiKey}`,
    'Content-Type': 'application/json',
  };
  // OANDA requires symbols to be uppercase
  const params = { instruments: symbols.map(s => s.toUpperCase()).join(',') };

  logger.info({ url, symbols }, 'Connecting to OANDA pricing stream');

  axios.get(url, { headers, params, responseType: 'stream' })
    .then(response => {
      const stream = response.data;
      currentStream = response.request;
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const message = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          if (message.trim().length === 0) continue;

          try {
            const data = JSON.parse(message);
            if (data.type === 'PRICE' && data.instrument && data.bids && data.asks) {
              const symbol = data.instrument.toLowerCase();
              const bid = parseFloat(data.bids[0].price);
              const ask = parseFloat(data.asks[0].price);
              const last = (bid + ask) / 2;
              const ts = new Date(data.time).getTime();
              const tick = { symbol, last: parseFloat(last.toFixed(5)), ts };

              redisClient.set(PRICE_KEY(symbol), JSON.stringify(tick));
              redisClient.publish('market-ticks-channel', JSON.stringify(tick));

              // Persist Candle History
              candleService.updateCandle(tick.symbol.toUpperCase(), tick.last, 1)
                .catch(err => logger.error({ err, symbol: tick.symbol }, 'Failed to update candle history'));
            }
          } catch (err) {
            logger.error({ err, message }, 'Error processing OANDA stream message');
          }
        }
      });

      stream.on('end', () => {
        logger.warn('OANDA stream ended, reconnecting...');
        currentStream = null;
        setTimeout(connect, 5000);
      });
    })
    .catch(error => {
      logger.error({ err: error.message }, 'Failed to connect to OANDA stream, retrying...');
      currentStream = null;
      setTimeout(connect, 5000);
    });
};

const handleSubscriptionChange = () => {
  // Debounce the connect function to avoid restarting the stream too frequently
  // if multiple subscribe/unsubscribe requests come in at once.
  setTimeout(connect, 1000);
};

export const startOandaWsWorker = () => {
  logger.info('OANDA worker started. Listening for commands on Redis channel...');
  const subscriber = redisClient.duplicate();
  subscriber.connect();

  subscriber.subscribe(CONTROL_CHANNEL, (message) => {
    try {
      const { action, symbol } = JSON.parse(message);
      // OANDA symbols are in the format EUR_USD
      if (!symbol || !symbol.includes('_')) return;

      if (action === 'subscribe') {
        if (!activeSubscriptions.has(symbol)) {
          activeSubscriptions.add(symbol);
          handleSubscriptionChange();
        }
      } else if (action === 'unsubscribe') {
        if (activeSubscriptions.has(symbol)) {
          activeSubscriptions.delete(symbol);
          handleSubscriptionChange();
        }
      }
    } catch (err) {
      logger.error({ err, message }, 'Error processing control channel message for OANDA');
    }
  });
};
