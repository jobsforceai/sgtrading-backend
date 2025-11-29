import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../../config/config';

// Ensure logs directory exists
const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const transport = pino.transport({
  targets: [
    // Write only to console (stdout) for cloud environments
    {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
      level: 'warn', 
    },
  ],
});

const logger = pino(
  {
    level: 'debug', // Must be the lowest level to allow transports to filter
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

export default logger;