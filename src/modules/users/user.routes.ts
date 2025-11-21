import express from 'express';
import { authMiddleware } from '../../common/middleware/authMiddleware';
import { getMe } from './user.controller';

const router = express.Router();

router.get('/me', authMiddleware, getMe);

export default router;
