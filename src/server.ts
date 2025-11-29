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
import { startAlpacaWsWorker } from './modules/market/workers/alpaca.ws.worker';
import { startRecoveryWorker } from './modules/trading/workers/recovery.worker';
import { startGapFillerWorker } from './modules/market/workers/gapFiller.worker';
import { seedDatabase } from './config/seeder';
import { initSocketServer } from './ws/socketServer';
import redisClient from './config/redis'; // Import redisClient
import { BINANCE_SYMBOLS } from './modules/market/market.config'; // Import BINANCE_SYMBOLS
import { startVaultSettlementWorker } from './modules/vaults/workers/vaultSettlement.worker';

const CONTROL_CHANNEL = 'market-control-channel';

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
    startVaultSettlementWorker(); // New: Vault Settlement

    // Start WebSocket Workers for Real-time Data
    startBinanceWsWorker();
    startOandaWsWorker();
    startAlpacaWsWorker();

    // Initial subscription for Binance symbols (if not handled by another mechanism)
    logger.info('Publishing initial Binance symbol subscriptions...');
    for (const symbol of BINANCE_SYMBOLS) {
      await redisClient.publish(CONTROL_CHANNEL, JSON.stringify({ action: 'subscribe', symbol }));
    }

    // Start Recovery Worker (Polling fallback for dropped jobs)
    startRecoveryWorker();
    
    // Start Gap Filler (Runs on startup + periodically)
    startGapFillerWorker();

    // Add a repeatable job to the queue for polling non-crypto assets


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
