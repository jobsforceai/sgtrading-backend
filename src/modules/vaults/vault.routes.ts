import { createVault, deposit, getVaults, getVaultById, activateVault, getMyParticipations, withdrawFromVault } from './vault.controller';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';
import express from 'express';

const router = express.Router();

const createVaultSchema = z.object({
  body: z.object({
    name: z.string().min(3),
    botId: z.string(),
    targetAmountUsd: z.number().positive(),
    durationDays: z.number().int().min(1),
    creatorCollateralPercent: z.number().min(0).max(100).optional(),
    profitSharePercent: z.number().min(0).max(100).optional(),
  }),
});

const depositSchema = z.object({
  params: z.object({
    vaultId: z.string(),
  }),
  body: z.object({
    amountUsd: z.number().positive(),
    buyInsurance: z.boolean(),
  }),
});

const activateSchema = z.object({
    params: z.object({
      vaultId: z.string(),
    }),
});

const withdrawSchema = z.object({
    params: z.object({
      vaultId: z.string(),
    }),
});

router.use(authMiddleware);

router.post('/', validate(createVaultSchema), createVault);
router.get('/', getVaults);
router.get('/me/participations', getMyParticipations);
router.get('/:vaultId', getVaultById);
router.post('/:vaultId/deposit', validate(depositSchema), deposit);
router.post('/:vaultId/activate', validate(activateSchema), activateVault);
router.post('/:vaultId/withdraw', validate(withdrawSchema), withdrawFromVault);

export default router;
