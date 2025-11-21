import pino from 'pino';
import { config } from '../../config/config';

const logger = pino({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;
