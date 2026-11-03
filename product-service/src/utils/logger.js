import winston from 'winston';
import 'winston-daily-rotate-file';
import config from '../config/env.js';

// Map the shared LOG_LEVEL vocabulary onto winston's levels.
const LEVELS = {
  trace: 'silly',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  fatal: 'error',
};

const level = LEVELS[config.log.level.toLowerCase()] ?? 'info';

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level: lvl, message, stack, service, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp} ${lvl}] ${message}${extra}${stack ? `\n${stack}` : ''}`;
  }),
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const logger = winston.createLogger({
  level,
  defaultMeta: { service: 'product-service' },
  format: winston.format.errors({ stack: true }),
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.DailyRotateFile({
      dirname: config.log.dir,
      filename: 'product-service-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      format: fileFormat,
    }),
  ],
});

export default logger;
