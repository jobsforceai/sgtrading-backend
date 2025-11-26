import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

const nodeEnv = process.env.NODE_ENV || 'development';
const envPath = path.resolve(process.cwd(), `.env.${nodeEnv}`);

dotenv.config({ path: envPath });

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().url(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_TLS: z.enum(['true', 'false']).optional(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_ACCESS_TOKEN_EXPIRATION: z.string(),
  JWT_REFRESH_TOKEN_EXPIRATION: z.string(),
  FINNHUB_API_KEY: z.string(),
  FINNHUB_WEBHOOK_SECRET: z.string(),
  OANDA_API_KEY: z.string(),
  OANDA_ACCOUNT_ID: z.string(),
  OANDA_API_URL: z.string().url(),
  OANDA_STREAM_URL: z.string().url(),
  ALPACA_API_KEY_ID: z.string(),
  ALPACA_SECRET_KEY: z.string(),
  ALPACA_PAPER_API_URL: z.string().url(),
  ALPACA_DATA_WS_URL: z.string().url(),
  ALPACA_DATA_API_URL: z.string().url(),
  TWELVEDATA_API_KEY: z.string().optional(), // Optional for now to avoid crash if not set immediately
  SGCHAIN_API_URL: z.string().url().optional(), // URL for SGChain integration
  SGCHAIN_SECRET: z.string().optional(), // Shared secret for SGChain integration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const env = envSchema.parse(process.env);

let redisConfig = {
  host: env.REDIS_HOST || 'localhost',
  port: env.REDIS_PORT || 6379,
  username: env.REDIS_USERNAME || undefined,
  password: env.REDIS_PASSWORD || undefined,
  tls: env.REDIS_TLS === 'true' ? true : undefined as boolean | undefined,
};

if (env.REDIS_URL) {
  try {
    const url = new URL(env.REDIS_URL);
    redisConfig.host = url.hostname;
    redisConfig.port = parseInt(url.port, 10);
    redisConfig.username = url.username || redisConfig.username;
    redisConfig.password = url.password || redisConfig.password;
    if (url.protocol === 'rediss:') {
      redisConfig.tls = true;
    }
  } catch (error) {
    console.error('Invalid REDIS_URL:', error);
  }
}

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  mongo: {
    uri: env.MONGO_URI,
  },
  redis: redisConfig,
  jwt: {
    secret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTokenExpiration: env.JWT_ACCESS_TOKEN_EXPIRATION,
    refreshTokenExpiration: env.JWT_REFRESH_TOKEN_EXPIRATION,
  },
  email: {
    smtp: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    },
    from: env.EMAIL_FROM,
  },
  finnhub: {
    apiKey: env.FINNHUB_API_KEY,
    webhookSecret: env.FINNHUB_WEBHOOK_SECRET,
  },
  oanda: {
    apiKey: env.OANDA_API_KEY,
    accountId: env.OANDA_ACCOUNT_ID,
    apiUrl: env.OANDA_API_URL,
    streamUrl: env.OANDA_STREAM_URL,
  },
  alpaca: {
    apiKeyId: env.ALPACA_API_KEY_ID,
    secretKey: env.ALPACA_SECRET_KEY,
    paperApiUrl: env.ALPACA_PAPER_API_URL,
    dataWsUrl: env.ALPACA_DATA_WS_URL,
    dataApiUrl: env.ALPACA_DATA_API_URL,
  },
  twelvedata: {
    apiKey: env.TWELVEDATA_API_KEY,
  },
  sgchain: {
    apiUrl: env.SGCHAIN_API_URL,
    secret: env.SGCHAIN_SECRET,
  },
  coinmarketcap: {
    apiKey: process.env.COINMARKETCAP_API_KEY || '3ed3b558a52e4f1ca38faeb9250d41a5',
    apiUrl: process.env.COINMARKETCAP_API_URL || 'https://pro-api.coinmarketcap.com',
  },
};
