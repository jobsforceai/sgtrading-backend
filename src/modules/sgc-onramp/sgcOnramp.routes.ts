import express from 'express';
import { 
    createDepositIntentController, 
    sgcWebhookController, 
    redeemCodeController,
    createReverseTransferController,
    verifyReverseTransferController,
    cancelReverseTransferController
} from './sgcOnramp.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';
import { sgchainWebhookAuth } from './middleware/sgchainWebhookAuth';
import { sgcInternalAuth } from './middleware/sgcInternalAuth';

const router = express.Router();

const createDepositIntentSchema = z.object({
  body: z.object({
    amountUsd: z.number().positive(),
  }),
});

const redeemCodeSchema = z.object({
  body: z.object({
    code: z.string().min(5),
  }),
});

const createReverseTransferSchema = z.object({
    body: z.object({
        amountUsd: z.number().positive(),
    }),
});

const verifyReverseTransferSchema = z.object({
    body: z.object({
        code: z.string(),
    }),
});

// --- ONRAMP (Deposit USD via SGC) ---
router.post('/deposits/sgc/intents', authMiddleware, validate(createDepositIntentSchema), createDepositIntentController);
router.post('/deposits/sgc/webhook', sgchainWebhookAuth, sgcWebhookController); // Webhook from SGChain (Deposit)

// --- OFFRAMP (Withdraw USD to SGC) ---
// User generates code
router.post('/withdrawals/sgc', authMiddleware, validate(createReverseTransferSchema), createReverseTransferController);
// Alias for Frontend (matches /sgc-offramp/create-code)
router.post('/create-code', authMiddleware, validate(createReverseTransferSchema), createReverseTransferController);

// User refunds unused code
router.post('/withdrawals/sgc/:codeId/refund', authMiddleware, cancelReverseTransferController);

// --- INTERNAL (Called by SGChain) ---
// SGChain verifies and burns the user's code
router.post('/internal/sgchain/verify-burn', sgcInternalAuth, validate(verifyReverseTransferSchema), verifyReverseTransferController);

// --- REDEMPTION (Deposit via Code on SGTrading) ---
// (Existing functionality: User enters code here)
router.post('/redeem', authMiddleware, validate(redeemCodeSchema), redeemCodeController);

export default router;
