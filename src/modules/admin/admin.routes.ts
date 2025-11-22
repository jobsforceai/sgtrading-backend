import express from 'express';
import { createScenario, getScenarios, deleteScenario, getSystemHealth, toggleInstrument, testConnection, testAll } from './admin.controller';
import { validate } from '../../common/utils/validator';
import { authMiddleware } from '../../common/middleware/authMiddleware'; // Assuming admins are authenticated users
import { z } from 'zod';

// TODO: Add role-based middleware (e.g. requireAdmin)
// For now, we just use authMiddleware.

const router = express.Router();

const createScenarioSchema = z.object({
  body: z.object({
    symbol: z.string(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    startPrice: z.number().positive(),
    endPrice: z.number().positive(),
    highPrice: z.number().positive(),
    lowPrice: z.number().positive(),
  }),
});

const getScenariosSchema = z.object({
  query: z.object({
    symbol: z.string().optional(),
  }),
});

const deleteScenarioSchema = z.object({
  params: z.object({
    id: z.string(),
  }),
});

const toggleInstrumentSchema = z.object({
  params: z.object({
    symbol: z.string(),
  }),
  body: z.object({
    isEnabled: z.boolean(),
  }),
});

const testConnectionSchema = z.object({
  params: z.object({
    symbol: z.string(),
  }),
});

router.use(authMiddleware);

router.post('/scenarios', validate(createScenarioSchema), createScenario);
router.get('/scenarios', validate(getScenariosSchema), getScenarios);
router.delete('/scenarios/:id', validate(deleteScenarioSchema), deleteScenario);

// System Health & Management
router.get('/system-health', getSystemHealth);
router.post('/system-health/test-all', testAll);
router.patch('/instruments/:symbol/toggle', validate(toggleInstrumentSchema), toggleInstrument);
router.post('/instruments/:symbol/test-connection', validate(testConnectionSchema), testConnection);

export default router;
