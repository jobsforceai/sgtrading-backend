import express from 'express';
import { register, login, requestOtp, refresh, logout, loginPassword } from './auth.controller';
import { validate } from '../../common/utils/validator';
import { z } from 'zod';

const router = express.Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    fullName: z.string().min(2),
    password: z.string().min(6),
  }),
});

const requestOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6),
  }),
});

const loginPasswordSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6), // Password must be at least 6 characters
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
  }),
});

const logoutSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
  }),
});

router.post('/register', validate(registerSchema), register);
router.post('/otp/request', validate(requestOtpSchema), requestOtp);
router.post('/login', validate(loginSchema), login);
router.post('/login/password', validate(loginPasswordSchema), loginPassword);
router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', validate(logoutSchema), logout);

export default router;
