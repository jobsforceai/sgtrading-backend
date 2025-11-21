import { startBinanceWsWorker } from '../modules/market/workers/binance.ws.worker';
import { startOandaWsWorker } from '../modules/market/workers/oanda.ws.worker';
// import { startAlpacaWsWorker } from '../modules/market/workers/alpaca.ws.worker';
import { startTwelveDataWsWorker } from '../modules/market/workers/twelveData.ws.worker';
import { connectDB } from '../config/db';
import { connectRedis } from '../config/redis';
import logger from '../common/utils/logger';

const main = async () => {
  try {
    logger.info('Market worker starting...');
    await connectDB();
    await connectRedis();

    startBinanceWsWorker();
    startOandaWsWorker();
    // startAlpacaWsWorker(); 
    startTwelveDataWsWorker();

    logger.info('Market worker started successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to start market worker');
    process.exit(1);
  }
};

main();
