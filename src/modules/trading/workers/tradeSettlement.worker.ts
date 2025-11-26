import { Worker } from 'bullmq';
import { config } from '../../../config/config';
import { connection } from '../../../config/bullmq';
import logger from '../../../common/utils/logger';
import { settleTrade } from '../trading.service';

export const startTradeSettlementWorker = () => {
  new Worker(
    'trade-settlement',
    async (job) => {
      const { tradeId } = job.data;
      if (!tradeId) {
        logger.warn({ job: job.id }, 'Trade settlement job is missing tradeId');
        return;
      }
      logger.info({ tradeId }, 'Processing trade settlement');
      try {
        await settleTrade(tradeId);
      } catch (error) {
        logger.error({ err: error, tradeId }, 'Failed to settle trade');
        // The job will be retried automatically by BullMQ's default settings
        throw error;
      }
    },
    {
      connection,
    }
  );
};
