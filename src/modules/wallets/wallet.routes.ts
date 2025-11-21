import express from 'express';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { getMyWallet } from './wallet.controller';

const router = express.Router();

router.get('/me', authMiddleware, getMyWallet);

export default router;
