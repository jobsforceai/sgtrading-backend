import http from 'http';
import app from './app';
import { config } from './config/config';
import { connectDB } from './config/db';
import { connectRedis } from './config/redis';
import logger from './common/utils/logger';
import { marketIngestQueue } from './config/bullmq';
import { startMarketIngestWorker } from './modules/market/workers/marketIngest.worker';
import { startTradeSettlementWorker } from './modules/trading/workers/tradeSettlement.worker';
import { startSgcDepositConfirmWorker } from './modules/sgc-onramp/workers/sgcDepositConfirm.worker';
import { startSyntheticMarketWorker } from './modules/market/workers/syntheticMarket.worker';
import { startBotRunnerWorker } from './modules/bots/workers/botRunner.worker';
import { startBinanceWsWorker } from './modules/market/workers/binance.ws.worker';
import { startOandaWsWorker } from './modules/market/workers/oanda.ws.worker';
import { startTwelveDataWsWorker } from './modules/market/workers/twelveData.ws.worker';
import { recoverStuckTrades } from './modules/trading/workers/recovery.worker';
import { seedDatabase } from './config/seeder';
import { initSocketServer } from './ws/socketServer';

const startServer = async () => {
  try {
    await connectDB();
    // await seedDatabase(); // Seeding is now a manual script: npm run db:update-instruments
    await connectRedis();

    // Start our essential workers
    // startMarketIngestWorker(); // Disabled as we are not polling for stocks
    startTradeSettlementWorker();
    startSgcDepositConfirmWorker();
    startSyntheticMarketWorker();
    startBotRunnerWorker();

    // Start WebSocket Workers for Real-time Data
    startBinanceWsWorker();
    startOandaWsWorker();
    startTwelveDataWsWorker();

    // Attempt to recover any trades stuck during downtime
    await recoverStuckTrades();

    // Add a repeatable job to the queue for polling non-crypto assets
    /* Disabled as we are not polling for stocks
    await marketIngestQueue.add('ingest-market-data', {}, {
      repeat: {
        every: 10000, // every 10 seconds
      },
      removeOnComplete: true,
      removeOnFail: true,
    });
    */

    const server = http.createServer(app);
    initSocketServer(server);

    server.listen(config.port, () => {
      logger.info(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start the server');
    process.exit(1);
  }
};

startServer();
