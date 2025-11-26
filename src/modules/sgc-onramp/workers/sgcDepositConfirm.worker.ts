import { Worker } from 'bullmq';
import { config } from '../../../config/config';
import { connection } from '../../../config/bullmq';
import logger from '../../../common/utils/logger';
import { confirmDeposit } from '../sgcOnramp.service';

export const startSgcDepositConfirmWorker = () => {
  new Worker(
    'sgc-deposit-confirm',
    async (job) => {
      const { depositIntentId, txHash, amountSgc } = job.data;
      if (!depositIntentId || !txHash || !amountSgc) {
        logger.warn({ job: job.id, data: job.data }, 'SGC deposit confirmation job is missing required data');
        return;
      }
      logger.info({ depositIntentId }, 'Processing SGC deposit confirmation');
      try {
        await confirmDeposit(depositIntentId, txHash, amountSgc);
      } catch (error) {
        logger.error({ err: error, depositIntentId }, 'Failed to confirm SGC deposit');
        throw error;
      }
    },
    {
      connection,
    }
  );
};
