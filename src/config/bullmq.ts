import { Queue } from 'bullmq';
import { config } from './config';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

export const marketIngestQueue = new Queue('market-ingest', { connection });
export const tradeSettlementQueue = new Queue('trade-settlement', { connection });
export const sgcDepositConfirmQueue = new Queue('sgc-deposit-confirm', { connection });
export const webhookRetryQueue = new Queue('webhook-retry', { connection });
export const botQueue = new Queue('bot-queue', { connection });

