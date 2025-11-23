import express from 'express';
import { createDepositIntentController, sgcWebhookController, redeemCodeController } from './sgcOnramp.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';
import { sgchainWebhookAuth } from './middleware/sgchainWebhookAuth';

const router = express.Router();

const createDepositIntentSchema = z.object({
  body: z.object({
    amountUsd: z.number().positive(),
  }),
});

const redeemCodeSchema = z.object({
  body: z.object({
    code: z.string().min(5), // Assuming code format like SGT-XXXX
  }),
});

// Route for users to create a deposit intent
router.post('/deposits/sgc/intents', authMiddleware, validate(createDepositIntentSchema), createDepositIntentController);

// Webhook endpoint for SGChain to confirm deposits
// This endpoint should be protected by network security (IP whitelisting) or a shared secret
router.post('/deposits/sgc/webhook', sgchainWebhookAuth, sgcWebhookController);

// New Redemption Endpoint
router.post('/redeem', authMiddleware, validate(redeemCodeSchema), redeemCodeController);

export default router;